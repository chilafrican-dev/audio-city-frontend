#!/bin/bash
# Complete Cloudflare Tunnel Setup - Run this on your VPS
# This script does everything automatically

set -e

echo "🚀 Complete Cloudflare Tunnel Setup for Audio City API"
echo "=================================================="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "❌ Please run as root (sudo bash cloudflared-complete-setup.sh)"
    exit 1
fi

# Step 1: Install cloudflared
echo "📥 Step 1: Installing cloudflared..."
if ! command -v cloudflared &> /dev/null; then
    curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
    chmod +x /usr/local/bin/cloudflared
    echo "✅ cloudflared installed"
else
    echo "✅ cloudflared already installed"
fi
cloudflared --version
echo ""

# Step 2: Login (interactive - user must do this)
echo "📝 Step 2: Login to Cloudflare"
echo "This will open a browser window. Please authorize the tunnel."
echo "Press Enter when login is complete..."
read
echo ""

# Step 3: Create tunnel
echo "📝 Step 3: Creating tunnel..."
if cloudflared tunnel list | grep -q "audio-city-api"; then
    echo "✅ Tunnel 'audio-city-api' already exists"
    TUNNEL_ID=$(cloudflared tunnel list | grep "audio-city-api" | awk '{print $1}')
    echo "   Tunnel ID: $TUNNEL_ID"
else
    TUNNEL_OUTPUT=$(cloudflared tunnel create audio-city-api 2>&1)
    echo "$TUNNEL_OUTPUT"
    TUNNEL_ID=$(echo "$TUNNEL_OUTPUT" | grep -oP 'Created tunnel \K[^ ]+' || echo "")
    if [ -z "$TUNNEL_ID" ]; then
        echo "⚠️  Could not extract tunnel ID. Please enter it manually:"
        read TUNNEL_ID
    fi
    echo "✅ Tunnel created with ID: $TUNNEL_ID"
fi
echo ""

# Step 4: Create config
echo "📝 Step 4: Creating config file..."
mkdir -p ~/.cloudflared
cat > ~/.cloudflared/config.yml << EOF
tunnel: $TUNNEL_ID
credentials-file: /root/.cloudflared/$TUNNEL_ID.json

ingress:
  - hostname: api.audiocity-ug.com
    service: http://localhost:3002
  - service: http_status:404
EOF
echo "✅ Config created at ~/.cloudflared/config.yml"
echo ""

# Step 5: Route DNS
echo "📝 Step 5: Routing DNS..."
cloudflared tunnel route dns audio-city-api api.audiocity-ug.com || echo "⚠️  DNS routing may have failed (tunnel might already be routed)"
echo ""

# Step 6: Install service
echo "📝 Step 6: Installing as systemd service..."
cloudflared service install || echo "⚠️  Service may already be installed"
systemctl daemon-reload
systemctl start cloudflared || echo "⚠️  Service may already be running"
systemctl enable cloudflared
echo ""

# Step 7: Check status
echo "📝 Step 7: Checking service status..."
systemctl status cloudflared --no-pager -l || true
echo ""

echo "✅ Setup complete!"
echo ""
echo "🧪 Test the tunnel (wait 2-5 minutes for DNS):"
echo "   curl https://api.audiocity-ug.com/api/health"
echo ""
echo "📊 View logs:"
echo "   journalctl -u cloudflared -f"
echo ""
echo "🔄 Restart service if needed:"
echo "   systemctl restart cloudflared"
echo ""
