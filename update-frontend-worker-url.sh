#!/bin/bash
# Update frontend files to use Cloudflare Worker URL

WORKER_URL="https://audio-city-api-proxy.chilafrican.workers.dev"

echo "Updating frontend files to use worker URL: $WORKER_URL"
echo ""

# Find all HTML files
for file in *.html; do
  if [ -f "$file" ]; then
    # Update API_BASE_URL patterns
    sed -i '' "s|http://api.audiocity-ug.com:3002|$WORKER_URL|g" "$file"
    sed -i '' "s|'http://api.audiocity-ug.com:3002'|'$WORKER_URL'|g" "$file"
    sed -i '' "s|\"http://api.audiocity-ug.com:3002\"|\"$WORKER_URL\"|g" "$file"
    
    # Update localhost to worker URL for production
    sed -i '' "s|: 'http://api.audiocity-ug.com:3002'|: '$WORKER_URL'|g" "$file"
    sed -i '' "s|: \"http://api.audiocity-ug.com:3002\"|: \"$WORKER_URL\"|g" "$file"
    
    echo "✅ Updated $file"
  fi
done

echo ""
echo "✅ Frontend files updated!"
