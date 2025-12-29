#!/bin/bash
# Cloudflare Tunnel Installation Script for Audio City API
# Run this on your VPS: bash cloudflared-install.sh

set -e

echo "🚀 Installing cloudflared for Audio City API..."
echo ""

# Step 1: Download and install cloudflared
echo "📥 Downloading cloudflared..."
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared

# Verify installation
echo "✅ Verifying installation..."
cloudflared --version

echo ""
echo "✅ cloudflared installed successfully!"
echo ""
echo "📋 Next steps (run these commands):"
echo ""
echo "1. Login to Cloudflare:"
echo "   cloudflared tunnel login"
echo ""
echo "2. Create tunnel:"
echo "   cloudflared tunnel create audio-city-api"
echo "   (Save the tunnel ID that's displayed)"
echo ""
echo "3. Create config file (replace TUNNEL_ID with your actual ID):"
echo "   mkdir -p ~/.cloudflared"
echo "   cat > ~/.cloudflared/config.yml << 'EOF'"
echo "   tunnel: TUNNEL_ID"
echo "   credentials-file: /root/.cloudflared/TUNNEL_ID.json"
echo "   "
echo "   ingress:"
echo "     - hostname: api.audiocity-ug.com"
echo "       service: http://localhost:3002"
echo "     - service: http_status:404"
echo "   EOF"
echo ""
echo "4. Route DNS:"
echo "   cloudflared tunnel route dns audio-city-api api.audiocity-ug.com"
echo ""
echo "5. Install as service:"
echo "   cloudflared service install"
echo "   systemctl start cloudflared"
echo "   systemctl enable cloudflared"
echo ""
echo "6. Test:"
echo "   curl https://api.audiocity-ug.com/api/health"
echo ""
