#!/bin/bash
# One-liner to install and setup cloudflared
# Copy and paste this entire block into your VPS terminal

set -e
echo "🚀 Installing cloudflared..."
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared && chmod +x /usr/local/bin/cloudflared
cloudflared --version
echo ""
echo "✅ Installation complete!"
echo ""
echo "Now run these commands one by one:"
echo "1. cloudflared tunnel login"
echo "2. cloudflared tunnel create audio-city-api"
echo "3. (Save the tunnel ID, then create config - see instructions)"
