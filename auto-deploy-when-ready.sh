#!/bin/bash
# Auto-deploy when firewall opens

VM_IP="168.119.241.59"
KEY="$HOME/.ssh/vmsocket_key"
MAX_ATTEMPTS=30

echo "🔄 Waiting for firewall to open..."
echo "📍 Server: ${VM_IP}"
echo "🔑 Using: vmsocket_key (matches VMSocket dashboard)"
echo ""

for i in $(seq 1 $MAX_ATTEMPTS); do
    echo "[$i/$MAX_ATTEMPTS] Testing connection..."
    
    if ssh -i "$KEY" -o ConnectTimeout=5 -o StrictHostKeyChecking=no -o BatchMode=yes root@${VM_IP} "echo 'connected'" 2>/dev/null; then
        echo ""
        echo "✅ Connection successful! Deploying..."
        echo ""
        
        # Upload file
        echo "📤 Uploading api-server.js..."
        scp -i "$KEY" -o StrictHostKeyChecking=no \
            backend/api-server.js root@${VM_IP}:/opt/backend/api-server.js
        
        if [ $? -eq 0 ]; then
            echo "✅ File uploaded!"
            echo ""
            
            # Restart backend
            echo "🔄 Restarting backend..."
            ssh -i "$KEY" -o StrictHostKeyChecking=no \
                root@${VM_IP} "cd /opt/backend && pm2 restart audio-city-api && pm2 save && pm2 status"
            
            echo ""
            echo "✅✅✅ DEPLOYMENT COMPLETE! ✅✅✅"
            echo "   The /api/quick-master endpoint is now live!"
            exit 0
        else
            echo "❌ Upload failed"
            exit 1
        fi
    else
        if [ $i -lt $MAX_ATTEMPTS ]; then
            echo "⏳ Firewall still blocking, waiting 10 seconds..."
            sleep 10
        fi
    fi
done

echo ""
echo "❌ Firewall did not open after $MAX_ATTEMPTS attempts"
echo "💡 Please open port 22 in VMSocket firewall settings"
exit 1
