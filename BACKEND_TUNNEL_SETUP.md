# Backend Tunnel Setup - CRITICAL

## ⚠️ Current Issue
You ran cloudflared on your **local Mac**, which tunnels `localhost:3002` on your Mac (not the backend server).

## ✅ Solution: Run Tunnel on Backend Server

### Step 1: SSH to Backend Server
```bash
ssh root@168.119.241.59
```

### Step 2: Install cloudflared on Backend Server
```bash
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared
```

### Step 3: Login to Cloudflare (on backend server)
```bash
cloudflared tunnel login
```
This will open a browser to authenticate.

### Step 4: Create Named Tunnel (on backend server)
```bash
cloudflared tunnel create audio-city-backend
```

### Step 5: Run Tunnel (on backend server)
```bash
cloudflared tunnel --url http://localhost:3002
```

### Step 6: Get Tunnel URL
The output will show a URL like:
```
https://[tunnel-id].cfargotunnel.com
```

### Step 7: Set in Cloudflare Workers
1. Go to: https://dash.cloudflare.com
2. Workers & Pages → audio-city-api-proxy
3. Settings → Variables
4. Set `BACKEND_URL` = `https://[tunnel-id].cfargotunnel.com`
5. Save

### Step 8: Keep Tunnel Running
Run tunnel as a service (on backend server):
```bash
# Install as systemd service
cloudflared service install
cloudflared tunnel run audio-city-backend
```

## 🧪 Test After Setup
```bash
curl https://audio-city-api-proxy.chilafrican.workers.dev/api/health
```

Should return JSON, not 530 error.

## ⚠️ Temporary Tunnel (For Testing Only)
The tunnel you created locally (`https://define-monroe-doll-duties.trycloudflare.com`) is:
- ✅ Good for immediate testing
- ❌ Temporary (will expire)
- ❌ Tunnels your local Mac, not production backend

**Use it for testing, but set up the proper tunnel on the backend server for production.**
