/**
 * Audio City API Worker with D1 Database
 * 
 * This worker handles all API requests using Cloudflare D1 and R2
 * No VPS needed for the main API - only for mastering (FFmpeg)
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
      'Access-Control-Max-Age': '86400',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Helper: Generate UUID
    const uuid = () => {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    };

    // Helper: Parse JSON body
    const parseBody = async (request) => {
      try {
        return await request.json();
      } catch {
        return null;
      }
    };

    // Helper: Get auth token from request
    const getAuthToken = (request) => {
      const authHeader = request.headers.get('Authorization');
      if (authHeader?.startsWith('Bearer ')) {
        return authHeader.substring(7);
      }
      const urlParams = new URL(request.url).searchParams;
      return urlParams.get('token') || null;
    };

    // Helper: Get user from token
    const getUserFromToken = async (token) => {
      if (!token || !env.DB) return null;
      try {
        const session = await env.DB.prepare(
          'SELECT user_id FROM sessions WHERE token = ? AND expires_at > datetime("now")'
        ).bind(token).first();
        if (session) {
          const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?')
            .bind(session.user_id).first();
          return user;
        }
      } catch (error) {
        console.error('Error getting user from token:', error);
      }
      return null;
    };

    // ==================== API ROUTES ====================

    // GET /api/health
    if (url.pathname === '/api/health') {
      return Response.json({
        status: 'ok',
        service: 'audio-city-api-worker',
        database: env.DB ? 'connected' : 'not configured',
        r2: env.MEDIA_BUCKET ? 'connected' : 'not configured',
        timestamp: new Date().toISOString()
      }, { headers: corsHeaders });
    }

    // GET /api/users - Get all users/artists
    if (url.pathname === '/api/users' && request.method === 'GET') {
      try {
        if (!env.DB) {
          return Response.json([], { headers: corsHeaders });
        }
        const users = await env.DB.prepare('SELECT * FROM users ORDER BY created_at DESC').all();
        return Response.json(users.results || [], { headers: corsHeaders });
      } catch (error) {
        console.error('Error fetching users:', error);
        return Response.json([], { headers: corsHeaders });
      }
    }

    // GET /api/users/:id - Get single user
    if (url.pathname.startsWith('/api/users/') && request.method === 'GET') {
      const userId = url.pathname.split('/api/users/')[1]?.split('?')[0];
      if (!userId) {
        return Response.json({ error: 'User ID required' }, { status: 400, headers: corsHeaders });
      }
      try {
        if (!env.DB) {
          return Response.json({
            id: userId,
            username: 'user',
            name: 'User',
            avatar_url: null,
            profile_image: null,
            followers_count: 0,
            following_count: 0,
            tracks_count: 0
          }, { headers: corsHeaders });
        }
        const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
        if (!user) {
          return Response.json({
            id: userId,
            username: 'user',
            name: 'User',
            avatar_url: null,
            profile_image: null,
            followers_count: 0,
            following_count: 0,
            tracks_count: 0
          }, { headers: corsHeaders });
        }
        // Convert integer booleans to actual booleans
        user.verified = user.verified === 1;
        user.is_admin = user.is_admin === 1;
        return Response.json(user, { headers: corsHeaders });
      } catch (error) {
        console.error('Error fetching user:', error);
        return Response.json({
          id: userId,
          username: 'user',
          name: 'User',
          avatar_url: null
        }, { headers: corsHeaders });
      }
    }

    // GET /api/tracks - Get tracks
    if (url.pathname === '/api/tracks' && request.method === 'GET') {
      try {
        if (!env.DB) {
          return Response.json([], { headers: corsHeaders });
        }
        
        const orderBy = url.searchParams.get('order') || 'created_at.desc';
        const limit = parseInt(url.searchParams.get('limit') || '100');
        const artistId = url.searchParams.get('artist_id');
        
        let query = 'SELECT t.*, u.username as artist_username, u.profile_image as artist_profile_image, u.verified as artist_is_verified FROM tracks t LEFT JOIN users u ON t.artist_id = u.id';
        const params = [];
        
        if (artistId) {
          query += ' WHERE t.artist_id = ?';
          params.push(artistId.replace(/^(eq|neq)\./, ''));
        }
        
        if (orderBy.includes('.')) {
          const [field, direction] = orderBy.split('.');
          query += ` ORDER BY t.${field} ${direction.toUpperCase()}`;
        } else {
          query += ' ORDER BY t.created_at DESC';
        }
        
        query += ` LIMIT ?`;
        params.push(limit);
        
        const stmt = env.DB.prepare(query);
        if (params.length > 0) {
          stmt.bind(...params);
        }
        const tracks = await stmt.all();
        
        // Enrich with like counts
        const enrichedTracks = await Promise.all((tracks.results || []).map(async (track) => {
          const likes = await env.DB.prepare('SELECT COUNT(*) as count FROM likes WHERE track_id = ?')
            .bind(track.id).first();
          track.likes_count = likes?.count || 0;
          track.artist_is_verified = track.artist_is_verified === 1;
          return track;
        }));
        
        return Response.json(enrichedTracks, { headers: corsHeaders });
      } catch (error) {
        console.error('Error fetching tracks:', error);
        return Response.json([], { headers: corsHeaders });
      }
    }

    // GET /api/feed/trending-artists
    if (url.pathname === '/api/feed/trending-artists' && request.method === 'GET') {
      try {
        if (!env.DB) {
          return Response.json([], { headers: corsHeaders });
        }
        // Get artists with most tracks
        const artists = await env.DB.prepare(`
          SELECT u.*, COUNT(t.id) as track_count
          FROM users u
          LEFT JOIN tracks t ON u.id = t.artist_id
          GROUP BY u.id
          ORDER BY track_count DESC, u.followers_count DESC
          LIMIT 10
        `).all();
        
        const results = (artists.results || []).map(artist => ({
          ...artist,
          verified: artist.verified === 1,
          is_admin: artist.is_admin === 1,
          tracks_count: artist.track_count || 0
        }));
        
        return Response.json(results, { headers: corsHeaders });
      } catch (error) {
        console.error('Error fetching trending artists:', error);
        return Response.json([], { headers: corsHeaders });
      }
    }

    // POST /api/auth/signup
    if (url.pathname === '/api/auth/signup' && request.method === 'POST') {
      try {
        const body = await parseBody(request);
        if (!body || !body.email || !body.password || !body.username) {
          return Response.json({ error: 'Email, username, and password required' }, 
            { status: 400, headers: corsHeaders });
        }
        
        if (!env.DB) {
          return Response.json({ error: 'Database not configured' }, 
            { status: 500, headers: corsHeaders });
        }
        
        // Check if user exists
        const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ? OR username = ?')
          .bind(body.email.toLowerCase(), body.username).first();
        if (existing) {
          return Response.json({ error: 'User already exists' }, 
            { status: 400, headers: corsHeaders });
        }
        
        // Create user (in production, hash the password!)
        const userId = uuid();
        await env.DB.prepare(`
          INSERT INTO users (id, username, email, name, password, auth_provider, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 'local', datetime('now'), datetime('now'))
        `).bind(
          userId,
          body.username,
          body.email.toLowerCase(),
          body.name || body.username,
          body.password // TODO: Hash password in production!
        ).run();
        
        // Create session
        const token = 'token_' + Date.now() + '_' + uuid();
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days
        await env.DB.prepare(`
          INSERT INTO sessions (id, user_id, token, expires_at, created_at)
          VALUES (?, ?, ?, ?, datetime('now'))
        `).bind(uuid(), userId, token, expiresAt).run();
        
        const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
        user.verified = user.verified === 1;
        user.is_admin = user.is_admin === 1;
        
        return Response.json({
          success: true,
          token,
          user: {
            ...user,
            password: undefined // Don't send password back
          }
        }, { headers: corsHeaders });
      } catch (error) {
        console.error('Signup error:', error);
        return Response.json({ error: 'Signup failed' }, 
          { status: 500, headers: corsHeaders });
      }
    }

    // POST /api/auth/login
    if (url.pathname === '/api/auth/login' && request.method === 'POST') {
      try {
        const body = await parseBody(request);
        if (!body || !body.email || !body.password) {
          return Response.json({ error: 'Email and password required' }, 
            { status: 400, headers: corsHeaders });
        }
        
        if (!env.DB) {
          return Response.json({ error: 'Database not configured' }, 
            { status: 500, headers: corsHeaders });
        }
        
        const user = await env.DB.prepare('SELECT * FROM users WHERE email = ? AND password = ?')
          .bind(body.email.toLowerCase(), body.password).first();
        
        if (!user) {
          return Response.json({ error: 'Invalid credentials' }, 
            { status: 401, headers: corsHeaders });
        }
        
        // Create session
        const token = 'token_' + Date.now() + '_' + uuid();
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        await env.DB.prepare(`
          INSERT INTO sessions (id, user_id, token, expires_at, created_at)
          VALUES (?, ?, ?, ?, datetime('now'))
        `).bind(uuid(), user.id, token, expiresAt).run();
        
        user.verified = user.verified === 1;
        user.is_admin = user.is_admin === 1;
        
        return Response.json({
          success: true,
          token,
          user: {
            ...user,
            password: undefined
          }
        }, { headers: corsHeaders });
      } catch (error) {
        console.error('Login error:', error);
        return Response.json({ error: 'Login failed' }, 
          { status: 500, headers: corsHeaders });
      }
    }

    // GET /auth/google - OAuth redirect (simplified - redirects to Google)
    if (url.pathname === '/auth/google' && request.method === 'GET') {
      // This is a simplified version - in production, you'd use proper OAuth flow
      const GOOGLE_CLIENT_ID = env.GOOGLE_CLIENT_ID;
      if (!GOOGLE_CLIENT_ID) {
        return Response.json({ error: 'Google OAuth not configured' }, 
          { status: 500, headers: corsHeaders });
      }
      
      const redirectUri = `${url.origin}/auth/google/callback`;
      const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${GOOGLE_CLIENT_ID}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `response_type=code&` +
        `scope=profile email`;
      
      return Response.redirect(googleAuthUrl, 302);
    }

    // GET /auth/google/callback - Handle OAuth callback
    if (url.pathname === '/auth/google/callback' && request.method === 'GET') {
      // Simplified - in production, exchange code for token, get user info, create session
      const code = url.searchParams.get('code');
      if (!code) {
        return Response.redirect(`${url.origin}/login.html?error=oauth_failed`, 302);
      }
      
      // TODO: Exchange code for access token, get user profile, create/update user, create session
      // For now, redirect to login with error
      return Response.redirect(`${url.origin}/login.html?error=oauth_not_implemented`, 302);
    }

    // POST /api/tracks - Upload/create a new track (with audio file and optional cover art)
    if (url.pathname === '/api/tracks' && request.method === 'POST') {
      try {
        // Check authentication
        const token = getAuthToken(request);
        const user = await getUserFromToken(token);
        if (!user) {
          return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
        }

        if (!env.DB || !env.MEDIA_BUCKET) {
          return Response.json({ error: 'Database or R2 not configured' }, 
            { status: 500, headers: corsHeaders });
        }

        // Parse multipart form data
        const formData = await request.formData();
        const audioFile = formData.get('audioFile');
        const coverArtFile = formData.get('coverArt');
        const title = formData.get('title');
        const description = formData.get('description') || '';
        const genre = formData.get('genre') || 'Unknown';
        const artistId = formData.get('artist_id') || user.id;
        const artistName = formData.get('artist_name') || user.name || user.username;
        const coverArtUrl = formData.get('cover_art_url'); // Existing URL (from frontend)
        const duration = formData.get('duration') ? parseInt(formData.get('duration')) : null;

        if (!title || !artistId) {
          return Response.json({ error: 'Title and artist_id are required' }, 
            { status: 400, headers: corsHeaders });
        }

        if (!audioFile || !(audioFile instanceof File)) {
          return Response.json({ error: 'Audio file is required' }, 
            { status: 400, headers: corsHeaders });
        }

        // Check audio file size (50MB limit)
        if (audioFile.size > 50 * 1024 * 1024) {
          return Response.json({ error: 'Audio file too large (max 50MB)' }, 
            { status: 400, headers: corsHeaders });
        }

        // Check audio file type
        const allowedAudioTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/m4a', 'audio/aac', 'audio/x-m4a'];
        if (!allowedAudioTypes.includes(audioFile.type)) {
          return Response.json({ error: 'Invalid audio file type' }, 
            { status: 400, headers: corsHeaders });
        }

        const trackId = uuid();
        let audioUrl = null;
        let finalCoverArtUrl = coverArtUrl || null;

        // Upload audio file to R2
        try {
          const audioExt = audioFile.name.split('.').pop() || 'mp3';
          const audioR2Key = `tracks/${trackId}.${audioExt}`;
          const audioBuffer = await audioFile.arrayBuffer();
          
          await env.MEDIA_BUCKET.put(audioR2Key, audioBuffer, {
            httpMetadata: {
              contentType: audioFile.type,
            },
          });

          const r2PublicUrl = env.R2_PUBLIC_URL || `https://pub-${env.MEDIA_BUCKET.accountId}.r2.dev`;
          audioUrl = `${r2PublicUrl}/${audioR2Key}`;
        } catch (error) {
          console.error('Audio upload error:', error);
          return Response.json({ error: 'Failed to upload audio file' }, 
            { status: 500, headers: corsHeaders });
        }

        // Upload cover art file to R2 (if provided as file)
        if (coverArtFile && coverArtFile instanceof File) {
          try {
            // Check cover art file size (5MB limit)
            if (coverArtFile.size > 5 * 1024 * 1024) {
              return Response.json({ error: 'Cover art file too large (max 5MB)' }, 
                { status: 400, headers: corsHeaders });
            }

            // Check cover art file type
            const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
            if (!allowedImageTypes.includes(coverArtFile.type)) {
              return Response.json({ error: 'Invalid cover art file type. Only images allowed.' }, 
                { status: 400, headers: corsHeaders });
            }

            const coverExt = coverArtFile.name.split('.').pop() || 'jpg';
            const coverR2Key = `cover-art/${trackId}.${coverExt}`;
            const coverBuffer = await coverArtFile.arrayBuffer();
            
            await env.MEDIA_BUCKET.put(coverR2Key, coverBuffer, {
              httpMetadata: {
                contentType: coverArtFile.type,
              },
            });

            const r2PublicUrl = env.R2_PUBLIC_URL || `https://pub-${env.MEDIA_BUCKET.accountId}.r2.dev`;
            finalCoverArtUrl = `${r2PublicUrl}/${coverR2Key}`;
          } catch (error) {
            console.error('Cover art upload error:', error);
            // Don't fail the whole upload if cover art fails, just log it
          }
        }

        // Create track in database
        await env.DB.prepare(`
          INSERT INTO tracks (
            id, artist_id, title, description, audio_url, cover_art_url,
            genre, duration, views_count, likes_count, shares_count, plays_count,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, datetime('now'), datetime('now'))
        `).bind(
          trackId,
          artistId,
          title,
          description,
          audioUrl,
          finalCoverArtUrl,
          genre,
          duration
        ).run();

        // Update user's track count
        await env.DB.prepare(
          'UPDATE users SET tracks_count = tracks_count + 1, updated_at = datetime("now") WHERE id = ?'
        ).bind(artistId).run();

        // Get the created track
        const track = await env.DB.prepare('SELECT * FROM tracks WHERE id = ?').bind(trackId).first();

        return Response.json({
          success: true,
          message: 'Track uploaded successfully',
          track: track
        }, { headers: corsHeaders });

      } catch (error) {
        console.error('Track upload error:', error);
        return Response.json({ 
          error: 'Upload failed',
          message: error.message 
        }, { status: 500, headers: corsHeaders });
      }
    }

    // POST /api/users/:id/profile-picture - Upload profile picture to R2
    if (url.pathname.startsWith('/api/users/') && url.pathname.endsWith('/profile-picture') && request.method === 'POST') {
      const userId = url.pathname.split('/api/users/')[1]?.replace('/profile-picture', '');
      if (!userId) {
        return Response.json({ error: 'User ID required' }, { status: 400, headers: corsHeaders });
      }

      try {
        // Check authentication
        const token = getAuthToken(request);
        const user = await getUserFromToken(token);
        if (!user || user.id !== userId) {
          return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
        }

        // Parse multipart form data
        const formData = await request.formData();
        const file = formData.get('profilePicture');
        
        if (!file || !(file instanceof File)) {
          return Response.json({ error: 'No file uploaded' }, { status: 400, headers: corsHeaders });
        }

        // Check file size (5MB limit)
        if (file.size > 5 * 1024 * 1024) {
          return Response.json({ error: 'File too large (max 5MB)' }, { status: 400, headers: corsHeaders });
        }

        // Check file type
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
          return Response.json({ error: 'Invalid file type. Only images allowed.' }, { status: 400, headers: corsHeaders });
        }

        // Upload to R2
        if (!env.MEDIA_BUCKET) {
          return Response.json({ error: 'R2 bucket not configured' }, { status: 500, headers: corsHeaders });
        }

        const fileExt = file.name.split('.').pop() || 'jpg';
        const r2Key = `profiles/${userId}.${fileExt}`;
        const fileBuffer = await file.arrayBuffer();
        
        // Upload to R2
        await env.MEDIA_BUCKET.put(r2Key, fileBuffer, {
          httpMetadata: {
            contentType: file.type,
          },
        });

        // Get public URL (assuming R2 public URL is configured)
        // If you have a custom domain for R2, use that. Otherwise, use the R2 public URL
        const r2PublicUrl = env.R2_PUBLIC_URL || `https://pub-${env.MEDIA_BUCKET.accountId}.r2.dev`;
        const avatarUrl = `${r2PublicUrl}/${r2Key}`;

        // Update user in database
        if (env.DB) {
          await env.DB.prepare(
            'UPDATE users SET avatar_url = ?, profile_image = ?, updated_at = datetime("now") WHERE id = ?'
          ).bind(avatarUrl, avatarUrl, userId).run();
        }

        return Response.json({
          success: true,
          message: 'Profile picture uploaded successfully',
          avatar_url: avatarUrl,
          profile_image: avatarUrl,
        }, { headers: corsHeaders });

      } catch (error) {
        console.error('Profile picture upload error:', error);
        return Response.json({ 
          error: 'Upload failed',
          message: error.message 
        }, { status: 500, headers: corsHeaders });
      }
    }

    // Default: 404
    return Response.json({ 
      error: 'Not Found',
      path: url.pathname,
      hint: 'API endpoint not found. Check /api/health for available endpoints.'
    }, { status: 404, headers: corsHeaders });
  }
};

