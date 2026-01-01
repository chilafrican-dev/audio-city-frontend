#!/bin/bash
# Complete Deployment Script for Album Art Embedding on Hostkey VPS

echo "🚀 Audio City - Album Art Embedding Deployment"
echo "=============================================="

# Step 1: Install ffmpeg
echo "Step 1: Checking ffmpeg..."
if ! command -v ffmpeg &> /dev/null; then
    echo "📦 Installing ffmpeg..."
    sudo apt update && sudo apt install -y ffmpeg
    echo "✅ ffmpeg installed"
else
    echo "✅ ffmpeg already installed"
fi

# Step 2: Create directories
echo ""
echo "Step 2: Creating directories..."
mkdir -p assets temp
chmod 755 temp
echo "✅ Directories created"

# Step 3: Check for logo
echo ""
echo "Step 3: Checking for logo file..."
if [ -f "assets/nico-city-logo.jpg" ] || [ -f "assets/nico-city-logo.png" ] || [ -f "assets/NICO-CITY-LOGO.jpg" ] || [ -f "assets/NICO-CITY-LOGO.png" ]; then
    echo "✅ Logo file found"
else
    echo "⚠️  Logo file not found!"
    echo "Please add nico-city-logo.jpg to assets/ directory"
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next: Add logo file and run: pm2 restart api-server"
