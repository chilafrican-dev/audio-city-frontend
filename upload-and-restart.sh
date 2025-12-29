#!/bin/bash
# Upload backend and restart via API

echo "📤 Step 1: Uploading backend/api-server.js..."
scp backend/api-server.js root@168.119.241.59:/root/backend/

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Upload successful!"
    echo ""
    echo "🔄 Step 2: Restarting backend via API..."
    sleep 2
    curl -X POST http://168.119.241.59:3002/api/restart
    
    echo ""
    echo ""
    echo "✅ Done! Backend should be restarted with new CORS code."
    echo ""
    echo "Testing backend..."
    sleep 3
    curl -s http://168.119.241.59:3002/api/health | head -1
    echo ""
else
    echo ""
    echo "❌ Upload failed. Please check your SSH credentials."
fi
