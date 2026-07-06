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
wait_for_apt_locks() {
  local max_wait=300
  local wait_count=0
  echo "Checking for package manager locks..."
  while [ $wait_count -lt $max_wait ]; do
    local locked=false
    if command -v pgrep >/dev/null 2>&1 && pgrep -f "apt-get|dpkg|unattended-upgrades" >/dev/null 2>&1; then
      locked=true
    elif command -v fuser >/dev/null 2>&1; then
      if fuser /var/lib/dpkg/lock-mirror >/dev/null 2>&1 || \
         fuser /var/lib/apt/lists/lock >/dev/null 2>&1 || \
         fuser /var/lib/dpkg/lock >/dev/null 2>&1 || \
         fuser /var/lib/dpkg/lock-frontend >/dev/null 2>&1; then
        locked=true
      fi
    fi
    if [ "$locked" = "false" ]; then
      break
    fi
    echo "Waiting for other software managers to finish (sleep 5s)..."
    sleep 5
    wait_count=$((wait_count + 5))
  done
}
wait_for_apt_locks


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

# Configure DDEV global settings
sudo -u "$DEV_USER" ddev config --global router-bind-all-interfaces=true || true

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

# --- 7. Write and Configure Collaborator Sync Daemon ---
echo "🔄 Setting up collaborator sync daemon..."
cat << 'EOF' > /usr/local/bin/sync-devbox-users.sh
#!/bin/bash
# Sync script running on the VM to poll devboxui API and sync collaborators/SSH keys

SERVER_ID="SERVER_ID_PLACEHOLDER"
CALLBACK_URL="CALLBACK_URL_PLACEHOLDER"
SERVICE_TOKEN_ID="SERVICE_TOKEN_ID_PLACEHOLDER"
SERVICE_TOKEN_SECRET="SERVICE_TOKEN_SECRET_PLACEHOLDER"

API_URL="${CALLBACK_URL%/provisioning/status}/servers/${SERVER_ID}/users"

# Fetch users from the devboxui API
RESPONSE=$(curl -s -m 10 \
  -H "CF-Access-Client-Id: ${SERVICE_TOKEN_ID}" \
  -H "CF-Access-Client-Secret: ${SERVICE_TOKEN_SECRET}" \
  "${API_URL}")

if [ -z "${RESPONSE}" ]; then
  exit 0
fi

# Parse users using jq
echo "${RESPONSE}" | jq -c '.users[]' | while read -r user_json; do
  username=$(echo "${user_json}" | jq -r '.username')
  email=$(echo "${user_json}" | jq -r '.email')
  
  if [ -z "${username}" ] || [ "${username}" = "null" ]; then
    continue
  fi

  # Create user if they don't exist
  if ! id "${username}" &>/dev/null; then
    useradd -m -s /bin/bash "${username}"
    usermod -aG sudo "${username}"
    usermod -aG docker "${username}"
    echo "${username} ALL=(ALL) NOPASSWD:ALL" > "/etc/sudoers.d/${username}"
    
    # Pre-configure Git for user
    sudo -u "${username}" git config --global user.name "${username}"
    sudo -u "${username}" git config --global user.email "${email}"
    
    # Setup workspace for user
    mkdir -p "/home/${username}/workspace"
    chown -R "${username}":"${username}" "/home/${username}/workspace"
    
    # Initialize mkcert local CA for user
    sudo -u "${username}" mkcert -install || true
    # Configure DDEV global settings for user
    sudo -u "${username}" ddev config --global router-bind-all-interfaces=true || true
  fi
  
  # Sync SSH keys
  mkdir -p "/home/${username}/.ssh"
  chmod 700 "/home/${username}/.ssh"
  chown "${username}":"${username}" "/home/${username}/.ssh"
  
  # Read keys array and join with newlines
  echo "${user_json}" | jq -r '.sshKeys[]' > "/home/${username}/.ssh/authorized_keys.tmp"
  
  # Add management SSH key if present
  if [ -f /root/.ssh/authorized_keys ]; then
    grep -v '^#' /root/.ssh/authorized_keys >> "/home/${username}/.ssh/authorized_keys.tmp" || true
  fi
  
  # Only overwrite if contents changed to prevent resetting permissions
  if ! diff -q "/home/${username}/.ssh/authorized_keys.tmp" "/home/${username}/.ssh/authorized_keys" &>/dev/null; then
    mv "/home/${username}/.ssh/authorized_keys.tmp" "/home/${username}/.ssh/authorized_keys"
    chmod 600 "/home/${username}/.ssh/authorized_keys"
    chown "${username}":"${username}" "/home/${username}/.ssh/authorized_keys"
  else
    rm "/home/${username}/.ssh/authorized_keys.tmp"
  fi
done
EOF

# Inject variables into the sync script
sed -i "s|SERVER_ID_PLACEHOLDER|${SERVER_ID}|g" /usr/local/bin/sync-devbox-users.sh
sed -i "s|CALLBACK_URL_PLACEHOLDER|${CALLBACK_URL}|g" /usr/local/bin/sync-devbox-users.sh
sed -i "s|SERVICE_TOKEN_ID_PLACEHOLDER|${SERVICE_TOKEN_ID}|g" /usr/local/bin/sync-devbox-users.sh
sed -i "s|SERVICE_TOKEN_SECRET_PLACEHOLDER|${SERVICE_TOKEN_SECRET}|g" /usr/local/bin/sync-devbox-users.sh

chmod +x /usr/local/bin/sync-devbox-users.sh

# Run sync immediately
/usr/local/bin/sync-devbox-users.sh || true

# Setup cron job to run every minute
echo "* * * * * root /usr/local/bin/sync-devbox-users.sh >/dev/null 2>&1" > /etc/cron.d/sync-devbox-users

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
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# Signal that the setup is done
echo "✅ SETUP FINISHED - Server is ready for use." > /etc/motd
