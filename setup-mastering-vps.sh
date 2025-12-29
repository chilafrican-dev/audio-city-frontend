#!/bin/bash

# Setup Mastering-Only Backend on VPS
# This VPS is ONLY for mastering (FFmpeg processing)

VPS_HOST="audio-city-server"
VPS_IP="168.119.241.59"
BACKEND_DIR="/opt/backend"

echo "═══════════════════════════════════════════════════════════════"
echo "  Setting Up Mastering-Only Backend on VPS"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Test SSH connection
echo "🔐 Testing SSH connection..."
ssh -o ConnectTimeout=5 root@${VPS_IP} "echo 'SSH connection successful'" 2>&1

if [ $? -ne 0 ]; then
    echo ""
    echo "❌ SSH connection failed"
    echo "💡 Make sure your SSH key is configured"
    echo "   The email says: 'SSH Key' authentication"
    exit 1
fi

echo "✅ SSH connection works!"
echo ""

# Upload server.js
echo "📤 Uploading server.js (mastering only)..."
scp backend/server.js root@${VPS_IP}:${BACKEND_DIR}/server.js

if [ $? -eq 0 ]; then
    echo "   ✅ server.js uploaded"
else
    echo "   ❌ Failed to upload server.js"
    exit 1
fi

# Setup on VPS
echo ""
echo "🔧 Setting up on VPS..."
ssh root@${VPS_IP} << 'ENDSSH'
cd /opt/backend

# Check if FFmpeg is installed
echo "Checking FFmpeg..."
if ! command -v ffmpeg &> /dev/null; then
    echo "   Installing FFmpeg..."
    apt-get update -qq
    apt-get install -y ffmpeg
    echo "   ✅ FFmpeg installed"
else
    echo "   ✅ FFmpeg already installed"
    ffmpeg -version | head -1
fi

# Install Node.js dependencies
echo ""
echo "Installing dependencies..."
if [ -f package.json ]; then
    npm install
    echo "   ✅ Dependencies installed"
else
    echo "   ⚠️  package.json not found, creating minimal one..."
    cat > package.json << 'PKG'
{
  "name": "audio-city-mastering",
  "version": "1.0.0",
  "dependencies": {
    "express": "^4.22.1",
    "multer": "^1.4.5-lts.1",
    "cors": "^2.8.5",
    "uuid": "^9.0.0"
  }
}
PKG
    npm install
fi

# Setup PM2
echo ""
echo "Setting up PM2..."
if ! command -v pm2 &> /dev/null; then
    echo "   Installing PM2..."
    npm install -g pm2
    echo "   ✅ PM2 installed"
fi

# Restart mastering service
echo ""
echo "Restarting mastering service..."
pm2 delete mastering 2>/dev/null
pm2 start server.js --name mastering -- --port 3001
pm2 save
pm2 startup

echo ""
echo "✅ Mastering backend setup complete!"
echo ""
echo "Status:"
pm2 status
echo ""
echo "Endpoint: http://168.119.241.59:3001/api/quick-master"
ENDSSH

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  ✅ Mastering Backend Deployed!"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "🎯 VPS is now running:"
echo "   • Mastering service on port 3001"
echo "   • FFmpeg for audio processing"
echo "   • Temporary files only (auto-deleted)"
echo ""
echo "📋 Test it:"
echo "   curl http://168.119.241.59:3001/api/health"
echo ""
