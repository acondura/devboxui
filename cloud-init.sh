#!/bin/bash
set -e

# --- 0. Configuration ---
DEV_USER="$1"
GIT_USER_EMAIL="$2"
TUNNEL_TOKEN="$3"
MANAGEMENT_SSH_KEY="$4"
USER_SSH_KEY="$5"
SERVER_ID="$6"
PROV_TOKEN="$7"
CALLBACK_URL="$8"
ROOT_PASSWORD="$9"
SERVICE_TOKEN_ID="${10}"
SERVICE_TOKEN_SECRET="${11}"
PROVIDER="${13:-DevBox}"
DISPLAY_URL="${14:-Server}"

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

# --- 6. Developer Tools (DDEV) ---
# Create the parent workspace directory
mkdir -p /home/"$DEV_USER"/workspace
chown -R "$DEV_USER":"$DEV_USER" /home/"$DEV_USER"

# Pre-configure Git for the host user
cat <<EOF > /home/"$DEV_USER"/.gitconfig
[user]
    name = $GIT_USER_NAME
    email = $GIT_USER_EMAIL
EOF
chown "$DEV_USER":"$DEV_USER" /home/"$DEV_USER"/.gitconfig

echo "🐳 Installing DDEV..."

# Install DDEV Repo
apt-get update && apt-get install -y curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://pkg.ddev.com/apt/gpg.key | gpg --batch --yes --dearmor -o /etc/apt/keyrings/ddev.gpg
echo 'deb [signed-by=/etc/apt/keyrings/ddev.gpg] https://pkg.ddev.com/apt/ * *' > /etc/apt/sources.list.d/ddev.list

# Install DDEV and essential tools
apt-get update && apt-get install -y ddev git jq vim libnss3-tools mkcert

# Grant NOPASSWD so the developer can use sudo without a password (since they use SSH keys)
echo "$DEV_USER ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/90-devbox-user

# Initialize mkcert for the host user
sudo -u "$DEV_USER" mkcert -install || true

# Oh My Bash for the host user
if [ ! -d "/home/$DEV_USER/.oh-my-bash" ]; then
    sudo -u "$DEV_USER" bash -c "curl -fsSL https://raw.githubusercontent.com/ohmybash/oh-my-bash/master/tools/install.sh | bash -s -- --unattended" || true
fi

# Apply Theme and Fixes
if [ -f "/home/$DEV_USER/.bashrc" ]; then
    sed -i 's/OSH_THEME="[^"]*"/OSH_THEME="90210"/' "/home/$DEV_USER/.bashrc"
    grep -q "enable-bracketed-paste" "/home/$DEV_USER/.bashrc" || echo "bind 'set enable-bracketed-paste off'" >> "/home/$DEV_USER/.bashrc"
    grep -q "alias l=" "/home/$DEV_USER/.bashrc" || echo "alias l='ls -lah'" >> "/home/$DEV_USER/.bashrc"
fi

echo "------------------------------------------------"
echo "✅ Setup Complete! Master Server is Ready."
echo "------------------------------------------------"
echo "User: $DEV_USER"
echo "Sudo Password (Host): [NOT REQUIRED / NOPASSWD]"
echo "------------------------------------------------"

# --- 8. Final Security (Firewall) ---
echo "🔒 Hardening server firewall..."
apt-get install -y ufw
ufw allow 22/tcp
ufw --force enable

# Signal that the setup is done
echo "✅ SETUP FINISHED - Server is ready for use." > /etc/motd
