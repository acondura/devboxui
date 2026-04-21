#!/bin/bash
set -e

# --- 0. Configuration ---
# Replace this manually in the Hetzner UI before creating the server.
TUNNEL_TOKEN="REPLACE_WITH_YOUR_CLOUDFLARE_TUNNEL_TOKEN"

# --- 1. System Update ---
export DEBIAN_FRONTEND=noninteractive
apt-get update && apt-get -y upgrade

# --- 2. Create User 'andrei' & Sync SSH Keys ---
if ! id "andrei" &>/dev/null; then
    useradd -m -s /bin/bash andrei
    usermod -aG sudo andrei
    echo "andrei ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers.d/andrei
    
    # Sync SSH keys from root
    mkdir -p /home/andrei/.ssh
    if [ -f /root/.ssh/authorized_keys ]; then
        cp /root/.ssh/authorized_keys /home/andrei/.ssh/
    fi
    chown -R andrei:andrei /home/andrei/.ssh
    chmod 700 /home/andrei/.ssh
    chmod 600 /home/andrei/.ssh/authorized_keys || true
fi

# --- 3. Install Docker ---
apt-get install -y ca-certificates curl gnupg lsb-release
mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
usermod -aG docker andrei

# --- 4. Install DDEV ---
sudo -u andrei bash -c "curl -fsSL https://ddev.com/install.sh | bash"

# --- 5. Install Cloudflare Tunnel ---
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
dpkg -i cloudflared.deb
rm cloudflared.deb

if [ "$TUNNEL_TOKEN" != "REPLACE_WITH_YOUR_CLOUDFLARE_TUNNEL_TOKEN" ]; then
    cloudflared service install "$TUNNEL_TOKEN"
fi

# --- 6. Deploy Code-Server (Master Workspace) ---
PUID=$(id -u andrei)
PGID=$(id -g andrei)

# Create the parent project directory
mkdir -p /home/andrei/config /home/andrei/projects

# Pre-configure code-server to disable authentication (Cloudflare Tunnel handles security)
cat <<EOF > /home/andrei/config/config.yaml
bind-addr: 0.0.0.0:8443
auth: none
cert: false
EOF

chown -R andrei:andrei /home/andrei

docker run -d \
  --name=code-server \
  -e PUID=$PUID \
  -e PGID=$PGID \
  -e TZ=Europe/Bucharest \
  -e DEFAULT_WORKSPACE=/config/workspace \
  -v /home/andrei/config:/config \
  -v /home/andrei/projects:/config/workspace \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -p 8443:8443 \
  --restart unless-stopped \
  linuxserver/code-server:latest

# --- 7. Install PHP Debug Extension ---
docker exec -u andrei code-server /usr/lib/code-server/bin/code-server --install-extension xdebug.php-debug

echo "------------------------------------------------"
echo "✅ Setup Complete! Master Server is Ready."
echo "------------------------------------------------"
