#!/bin/bash

# Script to add SSH key to VPS and deploy

VPS_IP="168.119.241.59"
NEW_KEY_PUB=$(cat ~/.ssh/id_ed25519_audio_city.pub)

echo "═══════════════════════════════════════════════════════════════"
echo "  SSH Key Setup for VPS"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "📋 Your NEW public key:"
echo "$NEW_KEY_PUB"
echo ""
echo "📝 You need to add this key to your VPS:"
echo ""
echo "OPTION 1: Via VMSocket Dashboard (if available)"
echo "  1. Go to VMSocket dashboard"
echo "  2. Find 'audio-city-server'"
echo "  3. Add SSH key: $NEW_KEY_PUB"
echo ""
echo "OPTION 2: If you have any access to VPS"
echo "  Run on VPS:"
echo "  mkdir -p ~/.ssh"
echo "  echo '$NEW_KEY_PUB' >> ~/.ssh/authorized_keys"
echo "  chmod 600 ~/.ssh/authorized_keys"
echo ""
echo "OPTION 3: Use password authentication (if enabled)"
echo "  Try: ssh root@168.119.241.59"
echo ""
echo "═══════════════════════════════════════════════════════════════"
