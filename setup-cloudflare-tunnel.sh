#!/bin/bash
# Setup Cloudflare Tunnel for local backend

echo "═══════════════════════════════════════════════════════════════"
echo "  🔧 SETTING UP CLOUDFLARE TUNNEL"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Check if cloudflared is installed
if ! command -v cloudflared &> /dev/null; then
    echo "❌ cloudflared not found. Installing..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew install cloudflared
    else
        echo "Please install cloudflared from:"
        echo "https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/"
        exit 1
    fi
fi

echo "✅ cloudflared found"
echo ""

# Login to Cloudflare
echo "Step 1: Login to Cloudflare..."
cloudflared tunnel login

echo ""
echo "Step 2: Creating tunnel..."
cloudflared tunnel create audio-city-backend

echo ""
echo "Step 3: Routing DNS..."
cloudflared tunnel route dns audio-city-backend api.audiocity-ug.com

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  ✅ TUNNEL CREATED"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Step 4: Starting tunnel..."
echo "This will run in the foreground. Press Ctrl+C to stop."
echo ""
echo "Starting tunnel to localhost:3002..."
cloudflared tunnel run audio-city-backend --url http://localhost:3002

