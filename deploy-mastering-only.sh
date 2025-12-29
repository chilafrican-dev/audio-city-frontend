#!/bin/bash

# Deploy ONLY Mastering Backend (server.js) to VPS

VPS_IP="168.119.241.59"
VPS_USER="root"
BACKEND_DIR="/opt/backend"

echo "═══════════════════════════════════════════════════════════════"
echo "  Deploying Mastering Backend (server.js) to VPS"
echo "═══════════════════════════════════════════════════════════════"
echo ""

if [ ! -f "backend/server.js" ]; then
    echo "❌ backend/server.js not found"
    exit 1
fi

echo "📤 Uploading server.js to VPS..."
scp backend/server.js ${VPS_USER}@${VPS_IP}:${BACKEND_DIR}/server.js

if [ $? -eq 0 ]; then
    echo "   ✅ server.js uploaded"
else
    echo "   ❌ Failed to upload server.js"
    exit 1
fi

echo ""
echo "🔄 Restarting mastering backend..."
ssh ${VPS_USER}@${VPS_IP} << 'ENDSSH'
cd /opt/backend
# Try different PM2 process names
if pm2 restart mastering 2>/dev/null; then
    echo "   ✅ Restarted mastering"
elif pm2 restart server 2>/dev/null; then
    echo "   ✅ Restarted server"
elif pm2 restart all 2>/dev/null; then
    echo "   ✅ Restarted all PM2 processes"
else
    echo "   ⚠️  Starting new process..."
    pm2 start server.js --name mastering -- --port 3001
fi
ENDSSH

echo ""
echo "✅ Mastering backend deployed!"
echo ""
echo "Mastering endpoint: http://${VPS_IP}:3001/api/quick-master"
