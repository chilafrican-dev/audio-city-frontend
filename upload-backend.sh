#!/bin/bash
# Upload and restart backend script
# Usage: ./upload-backend.sh

echo "📤 Uploading backend/api-server.js to VPS..."
scp backend/api-server.js root@168.119.241.59:/root/backend/

echo ""
echo "🔄 Restarting backend..."
ssh root@168.119.241.59 'cd /root/backend && pm2 restart api-server || (pkill -f "node.*api-server" && sleep 1 && nohup node api-server.js > server.log 2>&1 &)'

echo ""
echo "✅ Done! Testing backend..."
sleep 2
curl -s http://168.119.241.59:3002/api/health | head -1
echo ""
