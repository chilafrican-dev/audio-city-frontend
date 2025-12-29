# Deploy Cloudflare Worker for API Proxy

## Quick Deploy

```bash
# Login to Cloudflare (if not already)
npx wrangler login

# Deploy the worker
npx wrangler deploy --config wrangler.workers.toml
```

## Set Backend URL

After deployment, set the backend URL:

```bash
# Option 1: Via CLI (as secret)
npx wrangler secret put BACKEND_URL
# Enter: https://api.audiocity-ug.com (or your backend URL)

# Option 2: Via Cloudflare Dashboard
# 1. Go to: https://dash.cloudflare.com
# 2. Workers & Pages → audio-city-api-proxy
# 3. Settings → Variables
# 4. Add: BACKEND_URL = https://your-backend-url.com
```

## Custom Domain (Optional)

To use api.audiocity-ug.com:

1. In Cloudflare Dashboard → Workers & Pages
2. Select your worker
3. Triggers → Custom Domains
4. Add: api.audiocity-ug.com

## Update Frontend

After deploying, update frontend to use worker URL:

```javascript
// In your HTML files, change:
const API_BASE_URL = 'https://audio-city-api-proxy.YOUR_SUBDOMAIN.workers.dev';
// Or if using custom domain:
const API_BASE_URL = 'https://api.audiocity-ug.com';
```

## Important Notes

⚠️ Workers can only connect to HTTPS endpoints
- If backend is HTTP, use Cloudflare Tunnel
- Or deploy backend with HTTPS (Let's Encrypt)

✅ Worker acts as proxy - backend still needs to run on VPS
- Worker forwards requests to backend
- Handles CORS automatically
- Supports file uploads

