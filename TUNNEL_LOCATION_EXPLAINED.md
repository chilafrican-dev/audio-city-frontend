# ⚠️ CRITICAL: Tunnel Location Matters!

## ❌ WRONG: Tunnel on Your Mac
If you run the tunnel on your local Mac:
- ❌ Site stops working when your Mac is off
- ❌ Site stops working when you close terminal
- ❌ Tunnel dies when you disconnect
- ❌ Not suitable for production

## ✅ CORRECT: Tunnel on Backend Server
If you run the tunnel on the backend server (168.119.241.59):
- ✅ Site works 24/7 (even when your Mac is off)
- ✅ Tunnel runs independently
- ✅ Can run as a service (auto-restarts)
- ✅ Production-ready

## 🎯 What You Need to Do

### Step 1: Stop the Tunnel on Your Mac
Press `Ctrl+C` in the terminal where cloudflared is running on your Mac.

### Step 2: SSH to Backend Server
```bash
ssh root@168.119.241.59
```

### Step 3: Install cloudflared on Backend Server
```bash
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared
```

### Step 4: Login to Cloudflare (on backend server)
```bash
cloudflared tunnel login
```

### Step 5: Create Named Tunnel (on backend server)
```bash
cloudflared tunnel create audio-city-backend
```

### Step 6: Run Tunnel as Service (on backend server)
This keeps it running even after you disconnect:

```bash
# Install as systemd service
cloudflared service install

# Run the tunnel
cloudflared tunnel run audio-city-backend
```

Or use PM2 to keep it running:
```bash
npm install -g pm2
pm2 start cloudflared --name tunnel -- tunnel --url http://localhost:3002
pm2 save
pm2 startup
```

## ✅ Result
Once tunnel is running on backend server:
- ✅ Site works 24/7
- ✅ Works even when your Mac is off
- ✅ Works even when you're not connected
- ✅ Auto-restarts if server reboots

## 🧪 Test
After setting up on backend server:
1. Close your Mac
2. Wait a few minutes
3. Visit your site
4. ✅ Should still work!

## 📝 Summary
- **Tunnel on Mac** = Site breaks when Mac is off ❌
- **Tunnel on Backend Server** = Site works 24/7 ✅
