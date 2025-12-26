#!/bin/bash
# Auto-deploy when VM comes online

VM_IP="168.119.241.59"
KEY="$HOME/.ssh/vmsocket_key"
MAX_ATTEMPTS=10
ATTEMPT=0

echo "🔄 Waiting for VM to come online..."
echo "📍 Target: ${VM_IP}"
echo ""

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    ATTEMPT=$((ATTEMPT + 1))
    echo "Attempt $ATTEMPT/$MAX_ATTEMPTS..."
    
    # Test connection
    if ssh -i "$KEY" -o ConnectTimeout=5 -o StrictHostKeyChecking=no -o BatchMode=yes root@${VM_IP} "echo 'online'" 2>/dev/null; then
        echo "✅ VM is online! Deploying..."
        
        # Upload file
        scp -i "$KEY" -o StrictHostKeyChecking=no \
            backend/api-server.js root@${VM_IP}:/opt/backend/api-server.js
        
        if [ $? -eq 0 ]; then
            echo "✅ File uploaded!"
            
            # Restart backend
            ssh -i "$KEY" -o StrictHostKeyChecking=no \
                root@${VM_IP} "cd /opt/backend && pm2 restart audio-city-api && pm2 save && pm2 status"
            
            echo "✅ Deployment complete!"
            exit 0
        fi
    else
        echo "⏳ VM not responding, waiting 10 seconds..."
        sleep 10
    fi
done

echo "❌ VM did not come online after $MAX_ATTEMPTS attempts"
echo "💡 Please check your VPS dashboard and ensure the VM is running"
exit 1
