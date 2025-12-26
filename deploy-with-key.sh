#!/bin/bash
# Try multiple methods to deploy

VM_IP="168.119.241.59"
KEY="$HOME/.ssh/vmsocket_key"

echo "🔑 Using vmsocket_key..."
echo "📤 Attempting to upload api-server.js..."

# Try default port 22
scp -i "$KEY" -o ConnectTimeout=10 -o StrictHostKeyChecking=no \
    backend/api-server.js root@${VM_IP}:/opt/backend/api-server.js 2>&1

if [ $? -eq 0 ]; then
    echo "✅ Upload successful!"
    ssh -i "$KEY" -o ConnectTimeout=10 -o StrictHostKeyChecking=no \
        root@${VM_IP} "cd /opt/backend && pm2 restart audio-city-api && pm2 save && echo '✅ Restarted!'"
else
    echo "❌ Connection failed - VM may be offline or firewall blocking"
    echo "💡 Check:"
    echo "   1. Is the VM running in your VPS dashboard?"
    echo "   2. Is port 22 open in firewall?"
    echo "   3. Try accessing via VPS web console"
fi
