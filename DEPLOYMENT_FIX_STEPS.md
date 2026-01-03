# Deployment Fix Steps

## Problem: Changes not showing after manual upload

## Step 1: Verify what's deployed
1. Go to: audiocity.pages.dev/admin-upload.html
2. View Page Source (Ctrl+U / Cmd+U)
3. Search for: "Artist Profile Information"
4. Result: FOUND = file is correct, NOT FOUND = wrong file

## Step 2: Check deployment structure
When uploading to Cloudflare Pages:
- ✅ CORRECT: Upload the "cloudflare-frontend" FOLDER directly
- ❌ WRONG: Upload files FROM inside cloudflare-frontend
- ❌ WRONG: Upload root folder containing cloudflare-frontend

## Step 3: Clear Cloudflare cache
1. Go to Cloudflare Dashboard
2. Caching → Configuration → Purge Everything
3. Wait 1-2 minutes

## Step 4: Verify file structure in deployment
After upload, files should be accessible at:
- audiocity.pages.dev/admin-upload.html (not in a subdirectory)

## Step 5: Try Wrangler CLI (Alternative)
```bash
cd "/Users/nicopan/online master"
npx wrangler pages deploy cloudflare-frontend --project-name=audiocity
```

