#!/bin/bash
set -e

echo "============================================="
echo "DÉMARRAGE DE L'INSTALLATION DU BACKEND CRASH"
echo "============================================="

# 1. Update and install Node.js 20
apt-get update
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# 2. Install PM2
npm install -g pm2

# 3. Setup backend dependencies and environment
cd /root/Crash-Game/backend
npm install

cat <<EOT > .env
PORT=5000
DATABASE_URL=postgresql://postgres.fqumcrhfvxgtgjdwvvng:XquPnfABdUEBel0G@aws-1-us-east-1.pooler.supabase.com:6543/postgres
JWT_SECRET=crash_game_token_secret_key_2026_htg_platform
UPLOAD_DIR=uploads
FRONTEND_URL=https://crash-game-smoky.vercel.app
EOT

echo "Fichier .env créé avec succès."

# 4. Configure Firewall to open port 5000
ufw allow 5000/tcp
ufw allow 22/tcp
ufw --force enable

# 5. Launch server with PM2
pm2 delete crash-backend || true
pm2 start index.js --name "crash-backend"
pm2 startup
pm2 save

echo "============================================="
echo "INSTALLATION TERMINÉE AVEC SUCCÈS !"
echo "Sèvè a ap kouri sou http://103.101.202.46:5000"
echo "============================================="
