#!/bin/bash
set -e

echo "============================================="
echo "MISE À JOUR DE KETMESYE / CRASH GAME"
echo "============================================="

cd /root/Crash-Game

echo "[1/3] Mise à jour du Frontend..."
cd frontend
npm install
npm run build
cp -r dist/* /var/www/html/ 2>/dev/null || true
cp -r dist/* /var/www/ketarena.com/ 2>/dev/null || true

echo "[2/3] Mise à jour du Backend..."
cd ../backend
npm install

echo "[3/3] Redémarrage du serveur..."
pm2 restart crash-backend

echo "============================================="
echo "MISE À JOUR TERMINÉE AVEC SUCCÈS !"
echo "============================================="
