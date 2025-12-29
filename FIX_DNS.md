# Fix DNS for Cloudflare Tunnel

## Problem:
- DNS for api.audiocity-ug.com points to VPS IP (168.119.241.59)
- Should point to Cloudflare Tunnel
- This causes 522 errors

## Solution: Update DNS in Cloudflare Dashboard

### Option 1: Delete and Let Tunnel Create (Easiest)

1. Go to: https://dash.cloudflare.com
2. Select domain: **audiocity-ug.com**
3. Go to: **DNS → Records**
4. Find record: **api** (Type: A, pointing to 168.119.241.59)
5. Click **Delete**
6. Wait 1-2 minutes
7. Run: `cloudflared tunnel route dns audio-city-backend api.audiocity-ug.com`

### Option 2: Manual CNAME (If Option 1 doesn't work)

1. Go to: **DNS → Records**
2. Delete the **A** record for **api**
3. Click **Add record**
4. Set:
   - **Type**: CNAME
   - **Name**: api
   - **Target**: `8088831e-1f60-4f56-a029-e9fe49c9d700.cfargotunnel.com`
   - **Proxy status**: Proxied (orange cloud) ✅
5. Save

### Option 3: Use CLI to Overwrite

```bash
# Delete existing DNS record first (via dashboard)
# Then run:
cloudflared tunnel route dns audio-city-backend api.audiocity-ug.com
```

## After Fixing DNS:

1. Wait 1-2 minutes for DNS propagation
2. Test: `curl https://api.audiocity-ug.com/api/health`
3. Should return backend health check
4. 522 errors should be gone!

## Verify:

```bash
# Check DNS
dig api.audiocity-ug.com

# Should show CNAME to cfargotunnel.com (not A record to VPS IP)
```

