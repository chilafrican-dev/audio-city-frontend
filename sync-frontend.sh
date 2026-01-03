#!/bin/bash
# Sync cloudflare-frontend/ to deployment folders

echo "🔄 Syncing cloudflare-frontend/ to deployment folders..."

# Sync all HTML files
cp cloudflare-frontend/*.html deploy-pages/ 2>/dev/null
cp cloudflare-frontend/*.html deploy-frontend/ 2>/dev/null

# Sync JS files
cp cloudflare-frontend/*.js deploy-pages/ 2>/dev/null
cp cloudflare-frontend/*.js deploy-frontend/ 2>/dev/null

# Sync other important files
cp cloudflare-frontend/_headers deploy-pages/ 2>/dev/null
cp cloudflare-frontend/_headers deploy-frontend/ 2>/dev/null
cp cloudflare-frontend/manifest.json deploy-pages/ 2>/dev/null
cp cloudflare-frontend/manifest.json deploy-frontend/ 2>/dev/null

echo "✅ Sync complete!"
echo ""
echo "📁 Files synced:"
echo "  - deploy-pages/"
echo "  - deploy-frontend/"
