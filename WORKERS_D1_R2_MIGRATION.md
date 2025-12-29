# 🚀 Move API to Cloudflare Workers + D1 + R2

## ✅ What This Achieves
- **Zero servers** - No VPS needed
- **Global edge** - Low latency worldwide
- **Auto-scaling** - Handles traffic automatically
- **Cost-effective** - Pay per request
- **No maintenance** - No SSH, no updates

## ⚠️ Critical Limitation: Audio Mastering

**Workers CANNOT run FFmpeg**
- Your mastering requires FFmpeg (native binary)
- Workers have no shell access
- Workers cannot execute external processes

**Solution Options:**
1. **Hybrid**: Keep mastering on VPS, move everything else to Workers
2. **External API**: Use third-party mastering service (expensive)
3. **Skip mastering**: Remove mastering feature (not recommended)

## 📋 Migration Plan

### Phase 1: Setup Infrastructure

#### 1.1 Create D1 Database
```bash
npx wrangler d1 create audio-city-db
```

#### 1.2 Create R2 Buckets
```bash
# Tracks bucket
npx wrangler r2 bucket create audio-city-tracks

# Uploads bucket (avatars, etc.)
npx wrangler r2 bucket create audio-city-uploads

# Output bucket (mastered files)
npx wrangler r2 bucket create audio-city-output
```

#### 1.3 Update wrangler.toml
```toml
name = "audio-city-api"
main = "worker.js"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "audio-city-db"
database_id = "YOUR_D1_DATABASE_ID"

[[r2_buckets]]
binding = "TRACKS_BUCKET"
bucket_name = "audio-city-tracks"

[[r2_buckets]]
binding = "UPLOADS_BUCKET"
bucket_name = "audio-city-uploads"

[[r2_buckets]]
binding = "OUTPUT_BUCKET"
bucket_name = "audio-city-output"
```

### Phase 2: Database Schema (D1)

```sql
-- Users table
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  username TEXT,
  display_name TEXT,
  profile_image_url TEXT,
  is_verified INTEGER DEFAULT 0,
  is_admin INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

-- Tracks table
CREATE TABLE tracks (
  id TEXT PRIMARY KEY,
  artist_id TEXT NOT NULL,
  title TEXT NOT NULL,
  audio_url TEXT NOT NULL,
  cover_art_url TEXT,
  genre TEXT,
  description TEXT,
  views_count INTEGER DEFAULT 0,
  likes_count INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (artist_id) REFERENCES users(id)
);

-- Follows table
CREATE TABLE follows (
  follower_id TEXT NOT NULL,
  following_id TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  PRIMARY KEY (follower_id, following_id),
  FOREIGN KEY (follower_id) REFERENCES users(id),
  FOREIGN KEY (following_id) REFERENCES users(id)
);

-- Messages table
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  sender_id TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  content TEXT NOT NULL,
  is_read INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (sender_id) REFERENCES users(id),
  FOREIGN KEY (recipient_id) REFERENCES users(id)
);

-- Stats table
CREATE TABLE stats (
  key TEXT PRIMARY KEY,
  value INTEGER DEFAULT 0,
  updated_at INTEGER DEFAULT (unixepoch())
);

-- Indexes
CREATE INDEX idx_tracks_artist ON tracks(artist_id);
CREATE INDEX idx_tracks_created ON tracks(created_at DESC);
CREATE INDEX idx_follows_follower ON follows(follower_id);
CREATE INDEX idx_follows_following ON follows(following_id);
CREATE INDEX idx_messages_recipient ON messages(recipient_id, created_at DESC);
```

### Phase 3: Worker Structure

```javascript
// worker.js
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Route handlers
    if (url.pathname.startsWith('/api/users')) {
      return handleUsers(request, env, url);
    }
    if (url.pathname.startsWith('/api/tracks')) {
      return handleTracks(request, env, url);
    }
    if (url.pathname.startsWith('/api/feed')) {
      return handleFeed(request, env, url);
    }
    // ... more routes

    return new Response('Not Found', { status: 404, headers: corsHeaders });
  }
};
```

### Phase 4: Implement Core Handlers

#### Users Handler
```javascript
async function handleUsers(request, env, url) {
  const { DB } = env;
  
  if (request.method === 'GET') {
    if (url.pathname === '/api/users') {
      // Get all users
      const users = await DB.prepare('SELECT * FROM users').all();
      return Response.json(users.results, { headers: corsHeaders });
    }
    
    // Get single user
    const userId = url.pathname.split('/').pop();
    const user = await DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
    return Response.json(user, { headers: corsHeaders });
  }
  
  if (request.method === 'POST') {
    // Create user
    const data = await request.json();
    const id = crypto.randomUUID();
    await DB.prepare(`
      INSERT INTO users (id, email, username, display_name)
      VALUES (?, ?, ?, ?)
    `).bind(id, data.email, data.username, data.display_name).run();
    return Response.json({ id, ...data }, { headers: corsHeaders });
  }
  
  // ... PUT, DELETE
}
```

#### Tracks Handler
```javascript
async function handleTracks(request, env, url) {
  const { DB, TRACKS_BUCKET } = env;
  
  if (request.method === 'GET') {
    const params = new URLSearchParams(url.search);
    const limit = params.get('limit') || 20;
    const order = params.get('order') || 'created_at DESC';
    
    const tracks = await DB.prepare(`
      SELECT * FROM tracks 
      ORDER BY ${order} 
      LIMIT ?
    `).bind(limit).all();
    
    return Response.json(tracks.results, { headers: corsHeaders });
  }
  
  if (request.method === 'POST') {
    // Handle file upload to R2
    const formData = await request.formData();
    const audioFile = formData.get('audio');
    
    // Upload to R2
    const objectKey = `tracks/${crypto.randomUUID()}.mp3`;
    await TRACKS_BUCKET.put(objectKey, audioFile);
    
    // Save metadata to D1
    const trackId = crypto.randomUUID();
    const audioUrl = `/tracks/${objectKey}`;
    
    await DB.prepare(`
      INSERT INTO tracks (id, artist_id, title, audio_url)
      VALUES (?, ?, ?, ?)
    `).bind(trackId, formData.get('artist_id'), formData.get('title'), audioUrl).run();
    
    return Response.json({ id: trackId, audio_url: audioUrl }, { headers: corsHeaders });
  }
}
```

### Phase 5: File Serving from R2

```javascript
// Serve files from R2
if (url.pathname.startsWith('/tracks/') || 
    url.pathname.startsWith('/uploads/') || 
    url.pathname.startsWith('/output/')) {
  
  const bucketName = url.pathname.startsWith('/tracks/') ? 'TRACKS_BUCKET' :
                     url.pathname.startsWith('/uploads/') ? 'UPLOADS_BUCKET' :
                     'OUTPUT_BUCKET';
  
  const objectKey = url.pathname.slice(1); // Remove leading /
  const object = await env[bucketName].get(objectKey);
  
  if (!object) {
    return new Response('Not Found', { status: 404 });
  }
  
  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
      ...corsHeaders,
    },
  });
}
```

## 🔄 Migration Steps

### Step 1: Export Current Data
```javascript
// Script to export JSON files to SQL
// Convert users.json, tracks.json, etc. to SQL INSERT statements
```

### Step 2: Import to D1
```bash
npx wrangler d1 execute audio-city-db --file=schema.sql
npx wrangler d1 execute audio-city-db --file=data.sql
```

### Step 3: Migrate Files to R2
```javascript
// Script to upload all files from backend/uploads to R2
```

### Step 4: Deploy Worker
```bash
npx wrangler deploy
```

## ⚠️ What You'll Need to Rewrite

1. **All API endpoints** (~50+ routes)
2. **Authentication** (OAuth flow)
3. **File upload/download** (R2 instead of filesystem)
4. **Database queries** (D1 instead of JSON files)
5. **Business logic** (all Express.js code)

## 💰 Cost Estimate

- **Workers**: $5/month (10M requests free)
- **D1**: $5/month (5GB storage free)
- **R2**: $0.015/GB storage + $0.36/GB egress
- **Total**: ~$10-20/month (vs $5-10 VPS)

## 🎯 Recommended: Hybrid Approach

**Best of both worlds:**

1. **Workers + D1 + R2** for:
   - User management
   - Track metadata
   - Feed/Discovery
   - Comments/Likes
   - File storage

2. **VPS (minimal)** for:
   - Audio mastering only (FFmpeg)
   - Single endpoint: `/api/quick-master`

This gives you:
- ✅ Most features on edge (fast, scalable)
- ✅ Mastering still works (FFmpeg on VPS)
- ✅ Minimal VPS cost (just mastering)
- ✅ Best performance

## 📝 Next Steps

If you want to proceed:

1. I can help design the D1 schema
2. Create migration scripts
3. Rewrite API endpoints
4. Set up R2 buckets
5. Deploy everything

**Estimated time**: 2-4 weeks of development

**Recommendation**: Start with hybrid approach, then migrate fully later if needed.
