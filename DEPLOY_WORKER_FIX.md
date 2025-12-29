# Fix 530 Errors - Worker Deployment Guide

## Current Status
- ✅ Worker code is correct (uses tunnel URL)
- ❌ Worker deployed but getting 530 errors
- ❌ Tunnel URL not resolvable: `8088831e-1f60-4f56-a029-e9fe49c9d700.cfargotunnel.com`

## Problem
The Cloudflare Worker cannot reach the backend because:
1. The tunnel URL doesn't resolve (tunnel not running or wrong URL)
2. OR the BACKEND_URL environment variable is not set in Cloudflare Workers

## Solution Options

### Option 1: Set Up Cloudflare Tunnel (Recommended)

On your backend server (168.119.241.59):

```bash
# Install cloudflared
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared

# Login to Cloudflare
cloudflared tunnel login

# Create tunnel (if not exists)
cloudflared tunnel create audio-city-backend

# Run tunnel pointing to your backend
cloudflared tunnel --url http://localhost:3002
```

Then get the tunnel URL and set it in Cloudflare Workers.

### Option 2: Use Direct HTTPS Backend

If your backend has HTTPS set up at `https://api.audiocity-ug.com`:

1. Go to Cloudflare Dashboard
2. Workers & Pages → audio-city-api-proxy
3. Settings → Variables
4. Set `BACKEND_URL` = `https://api.audiocity-ug.com`
5. Save and redeploy

### Option 3: Use IP with HTTPS (If Available)

If you have HTTPS on the IP:
- Set `BACKEND_URL` = `https://168.119.241.59` (if HTTPS is configured)

## Immediate Fix Steps

1. **Check if tunnel is running on backend server:**
   ```bash
   ssh root@168.119.241.59
   ps aux | grep cloudflared
   ```

2. **If tunnel is running, get the correct URL:**
   - Check Cloudflare Dashboard → Zero Trust → Networks → Tunnels
   - Find your tunnel and copy the URL

3. **Set BACKEND_URL in Cloudflare Workers:**
   - Dashboard → Workers & Pages → audio-city-api-proxy
   - Settings → Variables
   - Add/Update: `BACKEND_URL` = `[tunnel URL or HTTPS backend URL]`
   - Save

4. **Redeploy worker:**
   - Copy updated `worker.js` code
   - Deploy

## Test After Fix

```bash
curl https://audio-city-api-proxy.chilafrican.workers.dev/api/health
```

Should return JSON, not 530 error.

## Current Worker Code
The worker is configured to use:
- Default: `https://8088831e-1f60-4f56-a029-e9fe49c9d700.cfargotunnel.com`
- Or: `env.BACKEND_URL` if set

**Action Required:** Set `BACKEND_URL` in Cloudflare Workers dashboard to a working HTTPS endpoint.
