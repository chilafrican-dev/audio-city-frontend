#!/bin/bash

# Deploy Backend with R2 Support to VPS

VPS_IP="168.119.241.59"
VPS_USER="root"
BACKEND_DIR="/opt/backend"

echo "═══════════════════════════════════════════════════════════════"
echo "  Deploying Backend with R2 Support to VPS"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Check if files exist
if [ ! -f "backend/api-server.js" ]; then
    echo "❌ backend/api-server.js not found"
    exit 1
fi

if [ ! -f "backend/r2-storage.js" ]; then
    echo "❌ backend/r2-storage.js not found"
    exit 1
fi

echo "📤 Step 1: Uploading files to VPS..."
echo ""

# Upload files
scp backend/api-server.js ${VPS_USER}@${VPS_IP}:${BACKEND_DIR}/api-server.js
if [ $? -eq 0 ]; then
    echo "   ✅ api-server.js uploaded"
else
    echo "   ❌ Failed to upload api-server.js"
    exit 1
fi

scp backend/r2-storage.js ${VPS_USER}@${VPS_IP}:${BACKEND_DIR}/r2-storage.js
if [ $? -eq 0 ]; then
    echo "   ✅ r2-storage.js uploaded"
else
    echo "   ❌ Failed to upload r2-storage.js"
    exit 1
fi

scp backend/package.json ${VPS_USER}@${VPS_IP}:${BACKEND_DIR}/package.json
if [ $? -eq 0 ]; then
    echo "   ✅ package.json uploaded"
else
    echo "   ❌ Failed to upload package.json"
    exit 1
fi

echo ""
echo "📦 Step 2: Installing dependencies on VPS..."
echo ""

ssh ${VPS_USER}@${VPS_IP} << 'ENDSSH'
cd /opt/backend
echo "   Installing npm packages..."
npm install
if [ $? -eq 0 ]; then
    echo "   ✅ Dependencies installed"
else
    echo "   ❌ Failed to install dependencies"
    exit 1
fi
ENDSSH

if [ $? -ne 0 ]; then
    echo "❌ Deployment failed"
    exit 1
fi

echo ""
echo "🔧 Step 3: Updating .env on VPS..."
echo ""

ssh ${VPS_USER}@${VPS_IP} << 'ENDSSH'
cd /opt/backend
if [ ! -f .env ]; then
    echo "   Creating .env file..."
    touch .env
fi

# Add R2 credentials if not present
if ! grep -q "R2_ACCOUNT_ID" .env; then
    echo "" >> .env
    echo "# Cloudflare R2 Configuration" >> .env
    echo "R2_ACCOUNT_ID=46e46abeb32a1a41fe25bea655d9b69a" >> .env
    echo "R2_ACCESS_KEY_ID=5f2fe12f710705c52bcd5cfb9990711a" >> .env
    echo "R2_SECRET_ACCESS_KEY=1371502d227222cf623fd8f98b62883f56d8c9759d57f48c2dddfa5b406b4bf2" >> .env
    echo "R2_BUCKET_NAME=audio-city-tracks" >> .env
    echo "R2_PUBLIC_URL=https://pub-xxxxx.r2.dev" >> .env
    echo "   ✅ R2 credentials added to .env"
else
    echo "   ℹ️  R2 credentials already in .env"
fi
ENDSSH

echo ""
echo "🔄 Step 4: Restarting backend..."
echo ""

ssh ${VPS_USER}@${VPS_IP} << 'ENDSSH'
cd /opt/backend
# Try different PM2 process names
if pm2 restart audio-city-api 2>/dev/null; then
    echo "   ✅ Restarted audio-city-api"
elif pm2 restart audio-city-backend 2>/dev/null; then
    echo "   ✅ Restarted audio-city-backend"
elif pm2 restart all 2>/dev/null; then
    echo "   ✅ Restarted all PM2 processes"
else
    echo "   ⚠️  PM2 restart failed, trying to start..."
    pm2 start api-server.js --name audio-city-api || pm2 start api-server.js
fi
ENDSSH

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  ✅ Deployment Complete!"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "📋 Next steps:"
echo "   1. Check backend logs: ssh ${VPS_USER}@${VPS_IP} 'pm2 logs audio-city-api'"
echo "   2. Test R2: ssh ${VPS_USER}@${VPS_IP} 'cd /opt/backend && node configure-r2.js'"
echo "   3. Test track upload from frontend"
echo ""
