#!/bin/bash
# Fix all HTTP URLs to HTTPS (except localhost)

echo "Fixing all HTTP URLs to HTTPS..."
echo ""

WORKER_URL="https://audio-city-api-proxy.chilafrican.workers.dev"

for file in *.html; do
  if [ -f "$file" ]; then
    # Replace http://api.audiocity-ug.com with worker URL
    sed -i '' "s|http://api\.audiocity-ug\.com:3002|$WORKER_URL|g" "$file"
    sed -i '' "s|'http://api\.audiocity-ug\.com:3002'|'$WORKER_URL'|g" "$file"
    sed -i '' "s|\"http://api\.audiocity-ug\.com:3002\"|\"$WORKER_URL\"|g" "$file"
    
    # Replace any other http://api patterns
    sed -i '' "s|http://api\.|https://api.|g" "$file" | grep -v localhost || true
    
    echo "✅ Updated $file"
  fi
done

echo ""
echo "✅ All files updated!"
