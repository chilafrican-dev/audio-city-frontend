#!/bin/bash

# Alternative deployment methods

VPS_IP="168.119.241.59"

echo "═══════════════════════════════════════════════════════════════"
echo "  Alternative Deployment Methods"
echo "═══════════════════════════════════════════════════════════════"
echo ""

echo "🔍 Checking if VPS has any open ports..."
nmap -p 22,80,443,3001,3002 $VPS_IP 2>/dev/null | grep -E "(open|filtered)" || echo "   (nmap not available, skipping)"

echo ""
echo "💡 OPTIONS:"
echo ""
echo "1. Try password SSH:"
echo "   ssh root@$VPS_IP"
echo ""
echo "2. Use SFTP (if password works):"
echo "   sftp root@$VPS_IP"
echo ""
echo "3. Check if VMSocket has API:"
echo "   Look for API keys in VMSocket account"
echo ""
echo "4. Contact VMSocket support:"
echo "   Ask them to add your SSH key or provide access"
echo ""
echo "5. Create base64 encoded deployment:"
echo "   (See below)"
echo ""

# Create base64 encoded server.js for easy copy-paste
echo "📦 Base64 encoded server.js (for copy-paste):"
echo "═══════════════════════════════════════════════════════════════"
base64 backend/server.js | head -20
echo "..."
echo "(Full file: $(wc -l < backend/server.js) lines)"
echo ""
echo "To decode on VPS:"
echo "  echo 'BASE64_CONTENT' | base64 -d > /opt/backend/server.js"
