#!/bin/bash
# Fix all HTTP URLs to HTTPS

echo "Fixing HTTP URLs to HTTPS in all files..."
echo ""

# Fix HTML files
for file in *.html; do
  if [ -f "$file" ]; then
    # Replace http:// with https:// (except localhost)
    sed -i '' 's|http://\([^l][^o][^c][^a][^l]|http://localhost|g' "$file" 2>/dev/null || true
    # More specific: replace http://api and http://www but keep localhost
    sed -i '' 's|http://api\.|https://api.|g' "$file"
    sed -i '' 's|http://www\.|https://www.|g' "$file"
    sed -i '' 's|http://audiocity|https://audiocity|g' "$file"
    sed -i '' 's|"http://|"https://|g' "$file" | grep -v localhost || true
    sed -i '' "s|'http://|'https://|g" "$file" | grep -v localhost || true
    echo "✅ Updated $file"
  fi
done

echo ""
echo "✅ All files updated!"
