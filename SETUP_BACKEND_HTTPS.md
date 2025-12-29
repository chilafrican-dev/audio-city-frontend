# Setup Backend with HTTPS

## Current Issue:
- Worker is trying to reach: https://api.audiocity-ug.com
- Backend is not deployed there yet
- Result: 522 Connection Timeout

## Solution Options:

### Option 1: Deploy Backend to VPS with HTTPS (Best)

1. **Deploy backend to VPS:**
   ```bash
   # On VPS (168.119.241.59)
   cd /opt/backend
   # Upload api-server.js
   npm install
   pm2 start api-server.js --name api -- --port 3002
   ```

2. **Set up Nginx with SSL:**
   ```bash
   # Install Nginx
   apt-get install nginx certbot python3-certbot-nginx
   
   # Configure Nginx
   # Create /etc/nginx/sites-available/api.audiocity-ug.com
   # (See nginx-config.example)
   
   # Get SSL certificate
   certbot --nginx -d api.audiocity-ug.com
   ```

3. **Update DNS:**
   - Point api.audiocity-ug.com A record to VPS IP (168.119.241.59)

### Option 2: Use Cloudflare Tunnel (Easier)

1. **Install cloudflared:**
   ```bash
   # On machine running backend (localhost:3002)
   brew install cloudflared  # macOS
   # or download from: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/
   ```

2. **Create tunnel:**
   ```bash
   cloudflared tunnel create audio-city-backend
   cloudflared tunnel route dns audio-city-backend api.audiocity-ug.com
   cloudflared tunnel run audio-city-backend --url http://localhost:3002
   ```

3. **Update worker BACKEND_URL:**
   - Keep as: https://api.audiocity-ug.com
   - Tunnel will route to localhost:3002

### Option 3: Temporary - Use ngrok (Quick Test)

1. **Install ngrok:**
   ```bash
   brew install ngrok  # or download from ngrok.com
   ```

2. **Start tunnel:**
   ```bash
   ngrok http 3002
   # Copy HTTPS URL (e.g., https://abc123.ngrok.io)
   ```

3. **Update worker BACKEND_URL:**
   ```bash
   NODE_TLS_REJECT_UNAUTHORIZED=0 npx wrangler secret put BACKEND_URL --name audio-city-api-proxy
   # Enter: https://abc123.ngrok.io
   ```

## Recommended: Option 2 (Cloudflare Tunnel)
- Free
- Secure
- Works with your existing setup
- No VPS deployment needed initially

