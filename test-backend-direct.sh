#!/bin/bash
echo "=== Testing Backend Direct Access ==="
echo ""
echo "This test determines if Worker will work:"
echo ""
echo "Test 1: HTTP direct access (if backend is HTTP-only)"
echo "curl http://168.119.241.59:3002/api/tracks?limit=1"
curl -v -m 5 http://168.119.241.59:3002/api/tracks?limit=1 2>&1 | head -30
echo ""
echo ""
echo "Test 2: HTTPS via domain (if configured)"
echo "curl https://api.audiocity-ug.com/api/tracks?limit=1"
curl -v -m 5 https://api.audiocity-ug.com/api/tracks?limit=1 2>&1 | head -30
echo ""
echo ""
echo "=== Results ==="
echo "✅ If either test returns JSON → Worker will work"
echo "❌ If both fail → Backend is not publicly reachable"
echo "   → Fix: Backend must listen on 0.0.0.0, port 3002 must be open"
