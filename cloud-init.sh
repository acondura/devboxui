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
apt-get install -y ufw
ufw allow 22/tcp
ufw --force enable

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

# --- 3. Install Docker & Tools ---
apt-get install -y ca-certificates curl gnupg lsb-release
mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --batch --yes --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Configure Docker for socket access
echo "{\"group\": \"$DEV_USER\"}" > /etc/docker/daemon.json
systemctl restart docker
usermod -aG docker "$DEV_USER"




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
chown -R "$DEV_USER":"$DEV_USER" /home/"$DEV_USER"

# --- 6.1 Pre-configure Container Environment (Host-side) ---
echo "⚙️ Pre-configuring container environment..."

# Pre-install Oh My Bash for the container user
sudo -u "$DEV_USER" bash -c "export HOME=/home/$DEV_USER/config; curl -fsSL https://raw.githubusercontent.com/ohmybash/oh-my-bash/master/tools/install.sh | bash -s -- --unattended"
sed -i 's/OSH_THEME="[^"]*"/OSH_THEME="90210"/' /home/"$DEV_USER"/config/.bashrc
sed -i "s|/home/$DEV_USER/config|/config|g" /home/"$DEV_USER"/config/.bashrc

# Pre-configure Git for the container
cat <<EOF > /home/"$DEV_USER"/config/.gitconfig
[user]
    name = $GIT_USER_NAME
    email = $GIT_USER_EMAIL
EOF

# Save the container sudo password
echo "$DEV_USER" > /home/"$DEV_USER"/config/.pass
chmod 600 /home/"$DEV_USER"/config/.pass

# Pre-configure code-server
cat <<EOF > /home/"$DEV_USER"/config/config.yaml
bind-addr: 0.0.0.0:8443
auth: none
cert: false
EOF

mkdir -p /home/"$DEV_USER"/config/data/User
cat <<EOF > /home/"$DEV_USER"/config/data/User/settings.json
{
    "editor.fontSize": 15,
    "terminal.integrated.fontSize": 15,
    "workbench.colorTheme": "Default Dark+"
}
EOF

# Final permission sync
chown -R "$DEV_USER":"$DEV_USER" /home/"$DEV_USER"

docker run -d \
  --name=code-server \
  -e PUID=$PUID \
  -e PGID=$PGID \
  -e SUDO_PASSWORD="$DEV_USER" \
  -e TZ=Europe/Bucharest \
  -e DEFAULT_WORKSPACE=/home/"$DEV_USER"/config/workspace \
  -v /home/"$DEV_USER":/home/"$DEV_USER" \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /usr/bin/docker:/usr/bin/docker \
  -v /usr/libexec/docker/cli-plugins:/usr/libexec/docker/cli-plugins \
  -p 127.0.0.1:8443:8443 \
  -p 9003:9003 \
  --restart unless-stopped \
  linuxserver/code-server:latest

# --- 7. Final Container Setup (Async) ---
echo "🐳 Finalizing container tools (DDEV, Vim, extensions)..."

docker exec -d -u root code-server bash -c "
    # Create the mirror symlink so /config points to the user's isolated home
    ln -sfn /home/\"$DEV_USER\"/config /config
    
    # Ensure Docker socket is accessible
    chmod 666 /var/run/docker.sock
    
    # Install DDEV Repo
    apt-get update && apt-get install -y curl gnupg
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://pkg.ddev.com/apt/gpg.key | gpg --batch --yes --dearmor -o /etc/apt/keyrings/ddev.gpg
    echo 'deb [signed-by=/etc/apt/keyrings/ddev.gpg] https://pkg.ddev.com/apt/ * *' > /etc/apt/sources.list.d/ddev.list
    
    # Install DDEV and Vim
    apt-get update && apt-get install -y ddev vim
    
    # Permissions & Initializations
    echo 'abc ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/abc
    sudo -u abc mkcert -install
    
    # Extensions
    sudo -u abc code-server --install-extension xdebug.php-debug --install-extension vscodevim.vim
"

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
