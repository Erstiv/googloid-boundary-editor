#!/bin/bash
# ═══════════════════════════════════════════════════
# Googloid Boundary Editor — Deploy to Hetzner
# Run this ON your Hetzner server
# ═══════════════════════════════════════════════════

set -e

APP_DIR="/var/www/googloid"
REPO="https://github.com/Erstiv/googloid-boundary-editor.git"
SERVICE_NAME="googloid"

echo "════════════════════════════════════════"
echo "  Deploying Googloid Boundary Editor"
echo "════════════════════════════════════════"

# 1. Clone or pull
if [ -d "$APP_DIR" ]; then
    echo "→ Pulling latest code..."
    cd "$APP_DIR"
    git pull origin main
else
    echo "→ Cloning repo..."
    git clone "$REPO" "$APP_DIR"
    cd "$APP_DIR"
fi

# 2. Install dependencies
echo "→ Installing dependencies..."
npm install

# 3. Build frontend
echo "→ Building frontend..."
npm run build

# 4. Create data directory (won't overwrite existing data)
mkdir -p "$APP_DIR/data/boundaries"

# 5. Install systemd service
echo "→ Setting up systemd service..."
cp server/googloid.service /etc/systemd/system/googloid.service
systemctl daemon-reload
systemctl enable googloid
systemctl restart googloid

# 6. Set up Nginx (only if not already configured)
if [ ! -f /etc/nginx/sites-available/googloid ]; then
    echo "→ Setting up Nginx..."
    cp server/nginx-googloid.conf /etc/nginx/sites-available/googloid
    ln -sf /etc/nginx/sites-available/googloid /etc/nginx/sites-enabled/
    nginx -t && systemctl reload nginx
    echo "→ Nginx configured. Run this for HTTPS:"
    echo "  certbot --nginx -d googloid.com -d www.googloid.com"
else
    echo "→ Nginx already configured, reloading..."
    nginx -t && systemctl reload nginx
fi

echo ""
echo "════════════════════════════════════════"
echo "  ✓ Deployed successfully!"
echo "  App running on port 3001"
echo "  Default admin: admin / admin"
echo "  CHANGE THE ADMIN PASSWORD!"
echo "════════════════════════════════════════"
echo ""
echo "Useful commands:"
echo "  systemctl status googloid    — check if running"
echo "  journalctl -u googloid -f    — view logs"
echo "  systemctl restart googloid   — restart app"
