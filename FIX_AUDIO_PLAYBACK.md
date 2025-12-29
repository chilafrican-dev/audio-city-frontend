# Fix Audio Playback Error

## Error:
"The element has no supported sources"

## Possible Causes:

### 1. R2 CORS Not Configured (Most Likely)
R2 buckets need CORS headers to allow audio playback from browser.

**Fix in Cloudflare Dashboard:**
1. Go to: https://dash.cloudflare.com
2. R2 → audio-city-tracks bucket
3. Settings → CORS Policy
4. Add CORS policy:
```json
[
  {
    "AllowedOrigins": ["*"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

### 2. R2 Public URL Not Set
Check if R2_PUBLIC_URL is configured in backend .env

### 3. Audio URL Format Issue
The URL might be relative or malformed.

**Check:**
- Open browser console (F12)
- Look for trackData.audio_url value
- Try opening that URL directly in browser

### 4. Audio File Doesn't Exist
The file might not have been uploaded to R2.

**Check:**
- Verify file exists in R2 bucket
- Check if URL is accessible

## Quick Test:

1. Open browser console (F12)
2. Check trackData.audio_url value
3. Try: `new Audio(trackData.audio_url).play()`
4. Check for CORS errors in console

## Most Likely Fix:

Configure CORS on R2 bucket to allow audio playback.

