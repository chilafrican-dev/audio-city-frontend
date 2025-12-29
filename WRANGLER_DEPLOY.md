# Deploy with Wrangler - Using API Token

## Step 1: Get Cloudflare API Token

1. Go to: https://dash.cloudflare.com/profile/api-tokens
2. Click "Create Token"
3. Use "Edit Cloudflare Workers" template
4. Or create custom token with permissions:
   - Account: Cloudflare Workers:Edit
   - Zone: Zone:Read (if using custom domain)
5. Copy the token

## Step 2: Set Token and Deploy

```bash
# Set the API token
export CLOUDFLARE_API_TOKEN="your-token-here"

# Deploy the worker
npx wrangler deploy --config wrangler.workers.toml
```

## Step 3: Set Backend URL

After deployment:

```bash
# Set backend URL as secret
npx wrangler secret put BACKEND_URL
# Enter: https://api.audiocity-ug.com
```

Or via dashboard:
- Workers & Pages → audio-city-api-proxy
- Settings → Variables → Add BACKEND_URL

## Alternative: Use Wrangler Config File

Create `~/.wrangler/config/default.toml`:
```toml
api_token = "your-token-here"
```

Then deploy:
```bash
npx wrangler deploy --config wrangler.workers.toml
```

