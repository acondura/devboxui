#!/bin/bash
echo "🚀 Deploying DevBox SSH Service..."

# Ensure we are in the correct directory
cd "$(dirname "$0")"

# Install dependencies for the worker
npm install ssh2

# Deploy to Cloudflare
npx wrangler deploy

echo "✅ SSH Service Deployed!"
echo "------------------------------------------------"
echo "Next steps:"
echo "1. Go to Cloudflare Dashboard > Workers & Pages > devbox-ssh-service"
echo "2. Settings > Variables > Add 'SSH_SERVICE_SECRET' (make it a long random string)"
echo "3. Go to your Pages project (devboxui) > Settings > Environment Variables"
echo "4. Add 'SSH_SERVICE_URL' (your worker URL) and 'SSH_SERVICE_SECRET' (the same string)"
echo "------------------------------------------------"
