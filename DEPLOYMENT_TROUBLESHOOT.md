# Deployment Troubleshooting Guide

## Current Status:
- ✅ Frontend deployed to: https://3ae563ee.audio-city-frontend.pages.dev
- ⚠️ Backend not accessible (522 errors)
- ⚠️ Site not working after deployment

## Issue: Site worked locally but not after deployment

### Most Likely Causes:

#### 1. Backend Not Accessible (522 Errors) ⚠️ MOST LIKELY
**Symptom:** All API calls return 522 or timeout
**Cause:** Worker can't reach https://api.audiocity-ug.com
**Solution:**
```bash
# Option A: Cloudflare Tunnel (Recommended)
cloudflared tunnel login
cloudflared tunnel create audio-city-backend
cloudflared tunnel route dns audio-city-backend api.audiocity-ug.com
cloudflared tunnel run audio-city-backend --url http://localhost:3002

# Option B: Deploy backend to VPS with HTTPS
# Deploy api-server.js to 168.119.241.59 with SSL
```

#### 2. Missing Environment Variables
**Symptom:** Features not working, API keys missing
**Check:** Cloudflare Pages → Settings → Environment Variables
**Add if needed:**
- API_BASE_URL
- Any other env vars your app needs

#### 3. Missing Assets/Files
**Symptom:** Images, CSS, JS not loading (404 errors)
**Check:** 
- Are assets/ folder files deployed?
- Check Network tab for 404s
**Fix:** Redeploy with all assets

#### 4. CORS Issues
**Symptom:** CORS errors in console
**Check:** Backend CORS settings
**Fix:** Ensure backend allows requests from your domain

#### 5. Case Sensitivity (Linux vs Mac)
**Symptom:** Some files not found
**Check:** File names match exactly (case-sensitive)
**Fix:** Ensure all imports use correct case

## Quick Diagnostic Steps:

### Step 1: Check Browser Console
1. Open deployed site
2. Press F12 → Console tab
3. Look for errors
4. Note: Error messages, which requests fail

### Step 2: Check Network Tab
1. F12 → Network tab
2. Reload page
3. Check which requests fail:
   - Red = Failed
   - 522 = Backend timeout
   - 404 = File not found
   - CORS = Cross-origin issue

### Step 3: Test Backend Connection
```bash
# Test if backend is reachable
curl https://api.audiocity-ug.com/api/health

# If fails, backend not deployed/accessible
```

### Step 4: Check Cloudflare Pages Logs
1. Go to Cloudflare Dashboard
2. Pages → audio-city-frontend
3. View deployment logs
4. Check for build/deployment errors

## Most Likely Fix:

Since you're getting 522 errors, the backend is not accessible.

**Quick Fix:**
1. Set up Cloudflare Tunnel (see above)
2. Or deploy backend to VPS with HTTPS
3. Or use ngrok temporarily for testing

## What to Tell Me:

1. What specific errors do you see in browser console?
2. Which requests are failing? (API calls, assets, etc.)
3. What was working locally that's not working now?
4. Any error messages in Cloudflare Pages logs?

