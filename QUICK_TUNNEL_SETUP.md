# 🚀 Quick Tunnel Setup on Backend Server

## ⚠️ IMPORTANT
Run these commands **ON THE BACKEND SERVER** (168.119.241.59), NOT on your Mac!

## Step-by-Step Instructions

### 1. Connect to Backend Server
```bash
ssh root@168.119.241.59
```

### 2. Install cloudflared
```bash
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared
```

### 3. Login to Cloudflare
```bash
cloudflared tunnel login
```
This will show a URL - open it in a browser and authenticate.

### 4. Create Named Tunnel
```bash
cloudflared tunnel create audio-city-backend
```

### 5. Run Tunnel (Test First)
```bash
cloudflared tunnel --url http://localhost:3002
```
You'll see output like:
```
https://[random-id].cfargotunnel.com
```
**Copy this URL!**

### 6. Set Tunnel URL in Cloudflare Workers
1. Go to: https://dash.cloudflare.com
2. **Workers & Pages** → **audio-city-api-proxy**
3. **Settings** → **Variables**
4. Add/Update: `BACKEND_URL` = `https://[tunnel-url].cfargotunnel.com`
5. **Save**

### 7. Keep Tunnel Running (Use PM2)
Press `Ctrl+C` to stop the test tunnel, then:

```bash
# Install PM2 if not already installed
npm install -g pm2

# Start tunnel with PM2 (keeps running)
pm2 start cloudflared --name tunnel -- tunnel --url http://localhost:3002

# Save PM2 configuration
pm2 save

# Enable PM2 to start on boot
pm2 startup
```

## ✅ Verification

### Test 1: Check tunnel is running
```bash
pm2 status
# Should show "tunnel" as "online"
```

### Test 2: Test worker
```bash
curl https://audio-city-api-proxy.chilafrican.workers.dev/api/health
# Should return JSON, not 530 error
```

### Test 3: Test from browser
Visit your site - should work without 530 errors!

## 🎯 Result

Once set up:
- ✅ Tunnel runs on backend server 24/7
- ✅ Site works even when your Mac is off
- ✅ No need to keep terminal open
- ✅ Auto-restarts if server reboots (PM2)

## 🔧 Troubleshooting

### Tunnel not running?
```bash
pm2 logs tunnel
# Check for errors
```

### Restart tunnel
```bash
pm2 restart tunnel
```

### Check backend is running
```bash
curl http://localhost:3002/api/health
# Should return JSON
```

## 📝 Summary

**Before**: Tunnel on Mac → Site breaks when Mac is off ❌
**After**: Tunnel on backend server → Site works 24/7 ✅
