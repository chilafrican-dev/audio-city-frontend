# Fix 530 Error - Tunnel Routing Issue

## Problem:
- Error 1033 = Tunnel routing error
- DNS record exists but not linked to tunnel
- Tunnel is running but Cloudflare doesn't route to it

## Solution:

### Step 1: Delete Existing DNS Record
1. Go to: https://dash.cloudflare.com
2. Domain: audiocity-ug.com → DNS → Records
3. Find: **api** (any type - A, CNAME, etc.)
4. **DELETE it** (click trash icon)
5. Wait 30 seconds

### Step 2: Create Tunnel Route
After deleting, run:
```bash
cloudflared tunnel route dns audio-city-backend api.audiocity-ug.com
```

This will:
- Create a CNAME record
- Link it to the tunnel
- Enable proper routing

### Step 3: Verify
Wait 1-2 minutes, then test:
```bash
curl -k https://api.audiocity-ug.com/api/health
```

Should return: `{"status":"ok",...}`

## Alternative: Manual CNAME
If CLI doesn't work:
1. Add DNS record manually:
   - Type: CNAME
   - Name: api
   - Target: `8088831e-1f60-4f56-a029-e9fe49c9d700.cfargotunnel.com`
   - Proxy: Proxied ✅
2. Then verify tunnel is routing in Cloudflare Dashboard

## After Fix:
✅ 530 errors will be gone
✅ Worker can reach backend
✅ Site will work!

