#!/bin/bash
set -e

# --- 0. Configuration ---
# Replace these manually in the Hetzner UI before creating the server.
TUNNEL_TOKEN="REPLACE_WITH_YOUR_CLOUDFLARE_TUNNEL_TOKEN"
DEV_USER="andrei"
GIT_USER_NAME="Andrei Condurachi"
GIT_USER_EMAIL="acondurachi@opisnet.com"

# --- 1. System Update ---
export DEBIAN_FRONTEND=noninteractive

# Signal that setup is in progress
echo "⚠️ SETUP IN PROGRESS - Please wait a few minutes before using the server." > /etc/motd

# Wait for any background APT locks to clear
while fuser /var/lib/dpkg/lock-mirror >/dev/null 2>&1 || fuser /var/lib/apt/lists/lock >/dev/null 2>&1 || fuser /var/lib/dpkg/lock >/dev/null 2>&1; do
   echo "Waiting for other software managers to finish..."
   sleep 5
done

apt-get update

# --- 2. Create User '$DEV_USER' & Sync SSH Keys ---
if ! id "$DEV_USER" &>/dev/null; then
    useradd -m -s /bin/bash "$DEV_USER"
    usermod -aG sudo "$DEV_USER"
    echo "$DEV_USER ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers.d/"$DEV_USER"
    
    # Sync SSH keys from root
    mkdir -p /home/"$DEV_USER"/.ssh
    if [ -f /root/.ssh/authorized_keys ]; then
        cp /root/.ssh/authorized_keys /home/"$DEV_USER"/.ssh/
    fi
    chown -R "$DEV_USER":"$DEV_USER" /home/"$DEV_USER"/.ssh
    chmod 700 /home/"$DEV_USER"/.ssh
    chmod 600 /home/"$DEV_USER"/.ssh/authorized_keys || true
fi

# --- 2.1 Install Oh My Bash for '$DEV_USER' ---
sudo -u "$DEV_USER" bash -c "curl -fsSL https://raw.githubusercontent.com/ohmybash/oh-my-bash/master/tools/install.sh | bash -s -- --unattended"
# Ensure the theme is set to '90210'
sed -i 's/OSH_THEME="[^"]*"/OSH_THEME="90210"/' /home/"$DEV_USER"/.bashrc

# --- 3. Install Docker ---
apt-get install -y ca-certificates curl gnupg lsb-release
mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --batch --yes --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
usermod -aG docker "$DEV_USER"

# Configure Docker to use DEV_USER group for the socket so the container inherits access
echo "{\"group\": \"$DEV_USER\"}" > /etc/docker/daemon.json
systemctl restart docker




# --- 5. Install Cloudflare Tunnel ---
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
dpkg -i cloudflared.deb
rm cloudflared.deb

if [ "$TUNNEL_TOKEN" != "REPLACE_WITH_YOUR_CLOUDFLARE_TUNNEL_TOKEN" ]; then
    cloudflared service install "$TUNNEL_TOKEN"
fi

# --- 6. Deploy Code-Server (Master Workspace) ---
PUID=$(id -u "$DEV_USER")
PGID=$(id -g "$DEV_USER")

# Create the parent project directory
mkdir -p /home/"$DEV_USER"/config /home/"$DEV_USER"/projects

# Pre-configure code-server to disable authentication (Cloudflare Tunnel handles security)
cat <<EOF > /home/"$DEV_USER"/config/config.yaml
bind-addr: 0.0.0.0:8443
auth: none
cert: false
EOF

# Create code-server settings for font sizes
mkdir -p /home/"$DEV_USER"/config/data/User
cat <<EOF > /home/"$DEV_USER"/config/data/User/settings.json
{
    "editor.fontSize": 15,
    "terminal.integrated.fontSize": 15,
    "workbench.colorTheme": "Default Dark+"
}
EOF

# Save the container sudo password to a file in the user's home directory (mapped to /config in container)
echo "$DEV_USER" > /home/"$DEV_USER"/config/.pass
chmod 600 /home/"$DEV_USER"/config/.pass

chown -R "$DEV_USER":"$DEV_USER" /home/"$DEV_USER"

docker run -d \
  --name=code-server \
  -e PUID=$PUID \
  -e PGID=$PGID \
  -e SUDO_PASSWORD="$DEV_USER" \
  -e TZ=Europe/Bucharest \
  -e DEFAULT_WORKSPACE=/config/workspace \
  -v /home/"$DEV_USER"/config:/config \
  -v /home/"$DEV_USER"/projects:/config/workspace \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -p 8443:8443 \
  --restart unless-stopped \
  linuxserver/code-server:latest

# --- 7. Install Container Tools & Extensions ---
# Wait a bit for the server to start up
sleep 15

# Install system-level Vim for the terminal
echo "📦 Installing Vim in container..."
docker exec -u root code-server bash -c "apt-get install -y vim" || true

# Install DDEV in container using apt-get
echo "🐳 Installing DDEV in container..."
docker exec -u root code-server bash -c "
apt-get update && apt-get install -y curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://pkg.ddev.com/apt/gpg.key | gpg --dearmor | tee /etc/apt/keyrings/ddev.gpg > /dev/null
chmod a+r /etc/apt/keyrings/ddev.gpg
echo 'deb [signed-by=/etc/apt/keyrings/ddev.gpg] https://pkg.ddev.com/apt/ * *' | tee /etc/apt/sources.list.d/ddev.list >/dev/null
apt-get update && apt-get install -y ddev
"

# Enable NOPASSWD for the container user (abc)
echo "🔓 Enabling NOPASSWD in container..."
docker exec -u root code-server bash -c "echo 'abc ALL=(ALL) NOPASSWD:ALL' >> /etc/sudoers.d/abc"

# Initialize mkcert
echo "🔐 Initializing mkcert..."
docker exec -u abc code-server bash -c "sudo mkcert -install"

# Install Oh My Bash in container
echo "🐚 Installing Oh My Bash in container..."
docker exec -u abc code-server bash -c "curl -fsSL https://raw.githubusercontent.com/ohmybash/oh-my-bash/master/tools/install.sh | bash -s -- --unattended"
docker exec -u abc code-server sed -i 's/OSH_THEME="[^"]*"/OSH_THEME="90210"/' /config/.bashrc

# Install VS Code Extensions (Run in background to avoid blocking the reboot)
echo "🧩 Installing VS Code extensions in background..."
docker exec -d -u abc code-server bash -c "code-server --install-extension xdebug.php-debug --install-extension vscodevim.vim"

# Configure Git
echo "⚙️ Configuring Git..."
docker exec -u abc code-server bash -c "git config --global user.name \"$GIT_USER_NAME\" && git config --global user.email \"$GIT_USER_EMAIL\""

echo "------------------------------------------------"
echo "✅ Setup Complete! Master Server is Ready."
echo "------------------------------------------------"
echo "User: $DEV_USER"
echo "Sudo Password (Container): [NOT REQUIRED / NOPASSWD]"
echo "Sudo Password (Host): [NOT REQUIRED / NOPASSWD]"
echo "Code-Server: Auth Disabled (via Cloudflare)"
echo "------------------------------------------------"

# Signal that the setup is done
echo "✅ SETUP FINISHED - Server is ready for use." > /etc/motd
