#!/bin/bash
# Deploy to VM using vmsocket_key

VM_IP="168.119.241.59"
SSH_KEY="$HOME/.ssh/vmsocket_key"

echo "🚀 Deploying to VM..."

# Upload file
echo "📤 Uploading api-server.js..."
scp -i "$SSH_KEY" -o ConnectTimeout=30 -o StrictHostKeyChecking=no \
    backend/api-server.js root@${VM_IP}:/opt/backend/api-server.js

if [ $? -eq 0 ]; then
    echo "✅ File uploaded!"
    
    echo "🔄 Restarting backend..."
    ssh -i "$SSH_KEY" -o ConnectTimeout=30 -o StrictHostKeyChecking=no \
        root@${VM_IP} "cd /opt/backend && pm2 restart audio-city-api && pm2 save && pm2 status"
    
    if [ $? -eq 0 ]; then
        echo "✅ Deployment complete!"
    else
        echo "❌ Restart failed"
    fi
else
    echo "❌ Upload failed - VM may be offline"
fi
