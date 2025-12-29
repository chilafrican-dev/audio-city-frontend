#!/bin/bash
# Deploy Mastering Backend to VPS

VPS_IP="168.119.241.59"
VPS_USER="root"
SSH_KEY="$HOME/.ssh/audio_city_final"

echo "═══════════════════════════════════════════════════════════════"
echo "  🚀 DEPLOYING MASTERING BACKEND"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Test connection
echo "Testing SSH connection..."
if ssh -i "$SSH_KEY" -o ConnectTimeout=10 "$VPS_USER@$VPS_IP" "echo 'Connected'" 2>/dev/null; then
    echo "✅ SSH connection successful!"
else
    echo "❌ SSH connection failed. Trying again in 30 seconds..."
    sleep 30
    if ! ssh -i "$SSH_KEY" -o ConnectTimeout=10 "$VPS_USER@$VPS_IP" "echo 'Connected'" 2>/dev/null; then
        echo "❌ SSH still failing. Please check:"
        echo "   1. Key is added in VMSocket"
        echo "   2. Wait 2-3 minutes for propagation"
        echo "   3. Try manual deployment (see DEPLOY_MASTERING_FINAL.txt)"
        exit 1
    fi
fi

echo ""
echo "Creating directories..."
ssh -i "$SSH_KEY" "$VPS_USER@$VPS_IP" "mkdir -p /opt/backend/uploads /opt/backend/output"

echo "Uploading server.js..."
scp -i "$SSH_KEY" backend/server.js "$VPS_USER@$VPS_IP:/opt/backend/"

echo "Installing dependencies..."
ssh -i "$SSH_KEY" "$VPS_USER@$VPS_IP" << 'ENDSSH'
cd /opt/backend
apt-get update
apt-get install -y ffmpeg nodejs npm
npm install express multer cors uuid
npm install -g pm2

# Stop existing mastering service if running
pm2 stop mastering 2>/dev/null || true
pm2 delete mastering 2>/dev/null || true

# Start new service
pm2 start server.js --name mastering -- --port 3001
pm2 save
pm2 startup

echo ""
echo "✅ Deployment complete!"
echo "Service running on port 3001"
pm2 status
ENDSSH

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  ✅ DEPLOYMENT COMPLETE"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Mastering endpoint: http://168.119.241.59:3001/api/quick-master"
echo ""
