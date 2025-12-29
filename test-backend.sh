#!/bin/bash
echo "=== Testing Backend Connectivity ==="
echo ""
echo "1. Testing direct backend access..."
echo "   curl https://api.audiocity-ug.com/api/health"
curl -v -m 10 https://api.audiocity-ug.com/api/health 2>&1 | head -20
echo ""
echo ""
echo "2. Testing through Cloudflare Worker..."
echo "   curl https://audio-city-api-proxy.chilafrican.workers.dev/api/health"
curl -v -m 10 https://audio-city-api-proxy.chilafrican.workers.dev/api/health 2>&1 | head -20
echo ""
echo ""
echo "3. Checking DNS resolution..."
echo "   dig api.audiocity-ug.com"
dig +short api.audiocity-ug.com 2>&1 | head -5
echo ""
echo ""
echo "=== Diagnostic Complete ==="
