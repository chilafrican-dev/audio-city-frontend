===========================================
ALBUM ART EMBEDDING - QUICK START
===========================================

✅ CODE IS READY - api-server.js has been updated!

📋 WHAT TO DO ON YOUR HOSTKEY VPS:

1. Install ffmpeg:
   sudo apt update && sudo apt install -y ffmpeg

2. Run deployment script:
   cd deploy-package
   ./DEPLOY_TO_HOSTKEY.sh

3. Add logo file:
   Upload nico-city-logo.jpg to: deploy-package/assets/nico-city-logo.jpg

4. Restart server:
   pm2 restart api-server

🧪 TESTING:

1. Upload a new MP3 track
2. Check logs: pm2 logs api-server
3. Look for: "✅ Album art embedded successfully"
4. Download track and verify album art appears

📁 SUPPORTED LOGO FILES:
- assets/nico-city-logo.jpg (recommended)
- assets/nico-city-logo.png
- assets/NICO-CITY-LOGO.jpg
- assets/NICO-CITY-LOGO.png

✅ WHAT'S ALREADY DONE:
- Code updated in api-server.js
- Directories created (assets/, temp/)
- Error handling added
- Multiple logo path fallbacks

🎯 RESULT:
All new MP3 uploads will automatically have Nico City logo 
embedded as album art!
