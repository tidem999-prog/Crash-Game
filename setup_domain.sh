#!/bin/bash
set -e

echo "============================================="
echo "KONFIGIRASYON DOMEN: ketarena.com"
echo "============================================="

# 1. Update and install Nginx + Certbot
echo "Enstalasyon Nginx ak Certbot..."
apt-get update
apt-get install -y nginx certbot python3-certbot-nginx

# 2. Create web root and copy frontend build
echo "Kopye fichye frontend yo..."
mkdir -p /var/www/ketarena.com
cp -r /root/Crash-Game/frontend/dist/* /var/www/ketarena.com/
chown -R www-data:www-data /var/www/ketarena.com

# 3. Create Nginx config
echo "Kreye konfigirasyon Nginx la..."
cat << 'EOF' > /etc/nginx/sites-available/ketarena.com
server {
    listen 80;
    server_name ketarena.com www.ketarena.com;

    root /var/www/ketarena.com;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /socket.io/ {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
EOF

# 4. Enable site and restart Nginx
echo "Aktivasyon sit la..."
ln -sf /etc/nginx/sites-available/ketarena.com /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
systemctl restart nginx

echo "============================================="
echo "Konfigirasyon an Fini!"
echo "Kounye a ou ka tape kòmand pou HTTPS la:"
echo "certbot --nginx -d ketarena.com -d www.ketarena.com --non-interactive --agree-tos -m tidem999@gmail.com"
echo "============================================="
