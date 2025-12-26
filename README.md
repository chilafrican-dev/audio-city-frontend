# 🎵 Audio City

Uganda's music community platform with professional mastering tools.

## Design System

**Theme:** Dark purple/cyan gradient
- Primary: `#8b5cf6` (Purple)
- Secondary: `#06b6d4` (Cyan)
- Background: `#0a0a0f`
- Cards: Glassmorphism with blur

## Pages

| Page | Description |
|------|-------------|
| `index.html` | Landing page |
| `feed.html` | Main feed (entry point) |
| `login.html` | Sign in |
| `signup.html` | Create account |
| `profile.html` | User profile |
| `discover.html` | Discover content |
| `artists.html` | Browse artists |
| `artist-profile.html` | Artist profile |
| `artist-corner.html` | Upload tracks |
| `producer-profile.html` | Producer profile |
| `producers-store.html` | Beat marketplace |
| `mastering.html` | **Pro mastering tool** |
| Cover Art Maker | Integrated in upload page (artist-corner.html) |
| `inbox.html` | Messages |
| `settings.html` | Settings |
| `news.html` | Updates |
| `track.html` | Track view |

## Quick Start

```bash
# Frontend
cd "online master"
python3 -m http.server 8000

# Mastering Backend
cd backend && npm install && node server.js
```

Open: `http://localhost:8000`

## Mastering Presets

| Preset | LUFS | Style |
|--------|------|-------|
| Kidandali | -9 | Warm, punchy |
| Banger | -9 | Loud, aggressive |
| Afrobeat | -10 | Balanced |
| Amapiano | -8 | Bass-heavy |
| Hip-Hop | -9 | Hard-hitting |
| Pop | -11 | Streaming-ready |
| EDM | -7 | Maximum loudness |

## Tech Stack

- **Frontend:** HTML, CSS, JavaScript
- **Backend:** Node.js, Express, FFmpeg
- **Audio:** ebur128 LUFS analysis, compression, limiting
