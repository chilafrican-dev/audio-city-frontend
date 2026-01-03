# Admin Upload Form - Troubleshooting Guide

## Problem: Changes not showing up, only delete button works

## ✅ Code Status:
- ✅ Biography field exists in HTML
- ✅ Artist Profile Information section exists
- ✅ Form submission handler exists
- ✅ Artist detection code exists
- ✅ All files synced to deployment folders

## 🔧 Solutions:

### 1. Clear Browser Cache (MOST IMPORTANT)
**Chrome/Edge:**
- Press `Ctrl+Shift+Delete` (Windows) or `Cmd+Shift+Delete` (Mac)
- Select "Cached images and files"
- Time range: "All time"
- Click "Clear data"
- Hard refresh: `Ctrl+F5` or `Cmd+Shift+R`

**Or:**
- Open DevTools (F12)
- Right-click refresh button → "Empty Cache and Hard Reload"

### 2. Check Which File is Being Loaded
Open browser console (F12) and check:
```javascript
// Check if form is visible
document.getElementById('formContainer').style.display

// Check if biography field exists
document.getElementById('artistBio')

// Check console for errors
// Look for: "[Admin Upload] Initializing..."
```

### 3. Verify Deployment
- Check if `cloudflare-frontend/admin-upload.html` is deployed
- Check Cloudflare Pages deployment logs
- Verify the deployed file has "Artist Profile Information"

### 4. Check for JavaScript Errors
Open browser console (F12) and look for:
- Red error messages
- Failed network requests
- Missing elements

### 5. Force Reload Without Cache
- Windows: `Ctrl + Shift + R`
- Mac: `Cmd + Shift + R`
- Or: `Ctrl + F5`

## 🎯 Quick Test:
1. Open admin-upload.html
2. Press F12 (open console)
3. Type: `document.getElementById('artistBio')`
4. Should return: `<textarea id="artistBio"...>`
5. If returns `null`, file is not updated

## 📋 What Should Be Visible:
1. "👤 Artist Profile Information" section at top
2. Artist Name field
3. Artist Profile Photo upload
4. Biography textarea (full width, 8 rows)
5. Track Details section below
6. Cover Art Designer section

