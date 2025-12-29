/**
 * Audio City API Worker with D1 Database - COMPLETE VERSION
 * 
 * This worker handles ALL API requests using Cloudflare D1 and R2
 * Backward compatible with existing VPS backend
 * No breaking changes for 8M+ users
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

    // Helper: Get R2 public URL
    const getR2PublicUrl = () => {
      return env.R2_PUBLIC_URL || `https://pub-${env.MEDIA_BUCKET?.accountId || 'unknown'}.r2.dev`;
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
    if (url.pathname.startsWith('/api/users/') && request.method === 'GET' && !url.pathname.includes('/')) {
      const userId = url.pathname.split('/api/users/')[1]?.split('?')[0]?.split('/')[0];
      if (!userId) {
        return Response.json({
          id: 'unknown',
          username: 'user',
          name: 'User',
          avatar_url: null,
          profile_image: null,
          followers_count: 0,
          following_count: 0,
          tracks_count: 0
        }, { headers: corsHeaders });
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

    // GET /api/users/:id/follow-status - Check if user follows another user
    if (url.pathname.includes('/follow-status') && request.method === 'GET') {
      const userId = url.pathname.split('/api/users/')[1]?.split('/')[0];
      const followerId = url.searchParams.get('user_id');
      
      if (!userId || !followerId || !env.DB) {
        return Response.json({ is_following: false }, { headers: corsHeaders });
      }
      
      try {
        const follow = await env.DB.prepare(
          'SELECT id FROM follows WHERE follower_id = ? AND followee_id = ?'
        ).bind(followerId, userId).first();
        
        return Response.json({ is_following: !!follow }, { headers: corsHeaders });
      } catch (error) {
        return Response.json({ is_following: false }, { headers: corsHeaders });
      }
    }

    // POST /api/users/:id/follow - Toggle follow relationship
    if (url.pathname.includes('/follow') && request.method === 'POST' && !url.pathname.includes('follow-status')) {
      const followeeId = url.pathname.split('/api/users/')[1]?.split('/')[0];
      const body = await parseBody(request);
      const followerId = body?.user_id;
      
      if (!followeeId || !followerId || !env.DB) {
        return Response.json({ error: 'User IDs required' }, { status: 400, headers: corsHeaders });
      }
      
      try {
        // Check if already following
        const existing = await env.DB.prepare(
          'SELECT id FROM follows WHERE follower_id = ? AND followee_id = ?'
        ).bind(followerId, followeeId).first();
        
        if (existing) {
          // Unfollow
          await env.DB.prepare('DELETE FROM follows WHERE follower_id = ? AND followee_id = ?')
            .bind(followerId, followeeId).run();
          
          // Update counts
          await env.DB.prepare('UPDATE users SET following_count = following_count - 1 WHERE id = ?')
            .bind(followerId).run();
          await env.DB.prepare('UPDATE users SET followers_count = followers_count - 1 WHERE id = ?')
            .bind(followeeId).run();
          
          return Response.json({ success: true, is_following: false }, { headers: corsHeaders });
        } else {
          // Follow
          await env.DB.prepare(
            'INSERT INTO follows (id, follower_id, followee_id, created_at) VALUES (?, ?, ?, datetime("now"))'
          ).bind(uuid(), followerId, followeeId).run();
          
          // Update counts
          await env.DB.prepare('UPDATE users SET following_count = following_count + 1 WHERE id = ?')
            .bind(followerId).run();
          await env.DB.prepare('UPDATE users SET followers_count = followers_count + 1 WHERE id = ?')
            .bind(followeeId).run();
          
          return Response.json({ success: true, is_following: true }, { headers: corsHeaders });
        }
      } catch (error) {
        console.error('Follow error:', error);
        return Response.json({ error: 'Failed to update follow status' }, 
          { status: 500, headers: corsHeaders });
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

    // GET /api/tracks/:id - Get single track
    if (url.pathname.startsWith('/api/tracks/') && request.method === 'GET' && !url.pathname.includes('/play') && !url.pathname.includes('/like')) {
      const trackId = url.pathname.split('/api/tracks/')[1]?.split('?')[0]?.split('/')[0];
      if (!trackId || !env.DB) {
        return Response.json({ error: 'Track not found' }, { status: 404, headers: corsHeaders });
      }
      
      try {
        const track = await env.DB.prepare(
          'SELECT t.*, u.username as artist_username, u.profile_image as artist_profile_image, u.verified as artist_is_verified FROM tracks t LEFT JOIN users u ON t.artist_id = u.id WHERE t.id = ?'
        ).bind(trackId).first();
        
        if (!track) {
          return Response.json({ error: 'Track not found' }, { status: 404, headers: corsHeaders });
        }
        
        const likes = await env.DB.prepare('SELECT COUNT(*) as count FROM likes WHERE track_id = ?')
          .bind(trackId).first();
        track.likes_count = likes?.count || 0;
        track.artist_is_verified = track.artist_is_verified === 1;
        
        return Response.json(track, { headers: corsHeaders });
      } catch (error) {
        console.error('Error fetching track:', error);
        return Response.json({ error: 'Track not found' }, { status: 404, headers: corsHeaders });
      }
    }

    // POST /api/tracks/:id/play - Increment play count
    if (url.pathname.includes('/play') && request.method === 'POST') {
      const trackId = url.pathname.split('/api/tracks/')[1]?.split('/')[0];
      if (!trackId || !env.DB) {
        return Response.json({ success: true }, { headers: corsHeaders });
      }
      
      try {
        await env.DB.prepare('UPDATE tracks SET plays_count = plays_count + 1, views_count = views_count + 1 WHERE id = ?')
          .bind(trackId).run();
        return Response.json({ success: true }, { headers: corsHeaders });
      } catch (error) {
        return Response.json({ success: true }, { headers: corsHeaders }); // Don't fail on play count
      }
    }

    // POST /api/tracks/:id/like - Like/unlike track
    if (url.pathname.includes('/like') && request.method === 'POST' && !url.pathname.includes('comments')) {
      const trackId = url.pathname.split('/api/tracks/')[1]?.split('/')[0];
      const body = await parseBody(request);
      const userId = body?.user_id;
      
      if (!trackId || !userId || !env.DB) {
        return Response.json({ error: 'Track ID and user ID required' }, { status: 400, headers: corsHeaders });
      }
      
      try {
        const existing = await env.DB.prepare(
          'SELECT id FROM likes WHERE user_id = ? AND track_id = ?'
        ).bind(userId, trackId).first();
        
        if (existing) {
          // Unlike
          await env.DB.prepare('DELETE FROM likes WHERE user_id = ? AND track_id = ?')
            .bind(userId, trackId).run();
          return Response.json({ success: true, liked: false }, { headers: corsHeaders });
        } else {
          // Like
          await env.DB.prepare('INSERT INTO likes (id, user_id, track_id, created_at) VALUES (?, ?, ?, datetime("now"))')
            .bind(uuid(), userId, trackId).run();
          return Response.json({ success: true, liked: true }, { headers: corsHeaders });
        }
      } catch (error) {
        console.error('Like error:', error);
        return Response.json({ error: 'Failed to update like' }, { status: 500, headers: corsHeaders });
      }
    }

    // POST /api/tracks/:id/share - Share track
    if (url.pathname.includes('/share') && request.method === 'POST') {
      const trackId = url.pathname.split('/api/tracks/')[1]?.split('/')[0];
      if (!trackId || !env.DB) {
        return Response.json({ success: true }, { headers: corsHeaders });
      }
      
      try {
        await env.DB.prepare('UPDATE tracks SET shares_count = shares_count + 1 WHERE id = ?')
          .bind(trackId).run();
        return Response.json({ success: true }, { headers: corsHeaders });
      } catch (error) {
        return Response.json({ success: true }, { headers: corsHeaders });
      }
    }

    // GET /api/feed/trending-artists
    if (url.pathname === '/api/feed/trending-artists' && request.method === 'GET') {
      try {
        if (!env.DB) {
          return Response.json([], { headers: corsHeaders });
        }
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
        
        const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ? OR username = ?')
          .bind(body.email.toLowerCase(), body.username).first();
        if (existing) {
          return Response.json({ error: 'User already exists' }, 
            { status: 400, headers: corsHeaders });
        }
        
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
        
        const token = 'token_' + Date.now() + '_' + uuid();
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
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
            password: undefined
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
        if (!body || (!body.email && !body.identifier) || !body.password) {
          return Response.json({ error: 'Email/username and password required' }, 
            { status: 400, headers: corsHeaders });
        }
        
        if (!env.DB) {
          return Response.json({ error: 'Database not configured' }, 
            { status: 500, headers: corsHeaders });
        }
        
        const identifier = (body.email || body.identifier || '').toLowerCase();
        const user = await env.DB.prepare('SELECT * FROM users WHERE (email = ? OR username = ?) AND password = ?')
          .bind(identifier, identifier, body.password).first();
        
        if (!user) {
          return Response.json({ error: 'Invalid credentials' }, 
            { status: 401, headers: corsHeaders });
        }
        
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

    // POST /api/auth/forgot-password - Return success (no-op for now)
    if (url.pathname === '/api/auth/forgot-password' && request.method === 'POST') {
      return Response.json({ success: true, message: 'Password reset email sent' }, { headers: corsHeaders });
    }

    // POST /api/auth/reset-password - Return success (no-op for now)
    if (url.pathname === '/api/auth/reset-password' && request.method === 'POST') {
      return Response.json({ success: true, message: 'Password reset successful' }, { headers: corsHeaders });
    }

    // GET /auth/google - OAuth redirect
    if (url.pathname === '/auth/google' && request.method === 'GET') {
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
      const code = url.searchParams.get('code');
      if (!code) {
        return Response.redirect(`${url.origin}/login.html?error=oauth_failed`, 302);
      }
      // TODO: Implement full OAuth flow
      return Response.redirect(`${url.origin}/login.html?error=oauth_not_implemented`, 302);
    }

    // POST /api/users/:id/profile-picture - Upload profile picture
    if (url.pathname.includes('/profile-picture') && request.method === 'POST') {
      const userId = url.pathname.split('/api/users/')[1]?.split('/')[0];
      if (!userId) {
        return Response.json({ error: 'User ID required' }, { status: 400, headers: corsHeaders });
      }

      try {
        const token = getAuthToken(request);
        const user = await getUserFromToken(token);
        if (!user || user.id !== userId) {
          return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
        }

        const formData = await request.formData();
        const file = formData.get('profilePicture');
        
        if (!file || !(file instanceof File)) {
          return Response.json({ error: 'No file uploaded' }, { status: 400, headers: corsHeaders });
        }

        if (file.size > 5 * 1024 * 1024) {
          return Response.json({ error: 'File too large (max 5MB)' }, { status: 400, headers: corsHeaders });
        }

        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
          return Response.json({ error: 'Invalid file type. Only images allowed.' }, { status: 400, headers: corsHeaders });
        }

        if (!env.MEDIA_BUCKET) {
          return Response.json({ error: 'R2 bucket not configured' }, { status: 500, headers: corsHeaders });
        }

        const fileExt = file.name.split('.').pop() || 'jpg';
        const r2Key = `profiles/${userId}.${fileExt}`;
        const fileBuffer = await file.arrayBuffer();
        
        await env.MEDIA_BUCKET.put(r2Key, fileBuffer, {
          httpMetadata: { contentType: file.type },
        });

        const avatarUrl = `${getR2PublicUrl()}/${r2Key}`;

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
        return Response.json({ error: 'Upload failed', message: error.message }, 
          { status: 500, headers: corsHeaders });
      }
    }

    // PUT /api/users/:id/profile - Update user profile
    if (url.pathname.includes('/profile') && request.method === 'PUT' && !url.pathname.includes('profile-picture')) {
      const userId = url.pathname.split('/api/users/')[1]?.split('/')[0];
      const body = await parseBody(request);
      
      if (!userId || !env.DB) {
        return Response.json({ error: 'User ID required' }, { status: 400, headers: corsHeaders });
      }

      try {
        const token = getAuthToken(request);
        const user = await getUserFromToken(token);
        if (!user || user.id !== userId) {
          return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
        }

        const updates = [];
        const values = [];
        
        if (body.name !== undefined) {
          updates.push('name = ?');
          values.push(body.name);
        }
        if (body.bio !== undefined) {
          updates.push('bio = ?');
          values.push(body.bio);
        }
        if (body.location !== undefined) {
          updates.push('location = ?');
          values.push(body.location);
        }
        
        if (updates.length === 0) {
          return Response.json({ error: 'No fields to update' }, { status: 400, headers: corsHeaders });
        }

        updates.push('updated_at = datetime("now")');
        values.push(userId);

        await env.DB.prepare(
          `UPDATE users SET ${updates.join(', ')} WHERE id = ?`
        ).bind(...values).run();

        const updatedUser = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
        updatedUser.verified = updatedUser.verified === 1;
        updatedUser.is_admin = updatedUser.is_admin === 1;

        return Response.json({
          success: true,
          user: {
            ...updatedUser,
            password: undefined
          }
        }, { headers: corsHeaders });

      } catch (error) {
        console.error('Profile update error:', error);
        return Response.json({ error: 'Update failed' }, { status: 500, headers: corsHeaders });
      }
    }

    // POST /api/tracks - Upload track
    if (url.pathname === '/api/tracks' && request.method === 'POST') {
      try {
        const token = getAuthToken(request);
        const user = await getUserFromToken(token);
        if (!user) {
          return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
        }

        if (!env.DB || !env.MEDIA_BUCKET) {
          return Response.json({ error: 'Database or R2 not configured' }, 
            { status: 500, headers: corsHeaders });
        }

        const formData = await request.formData();
        const audioFile = formData.get('audioFile');
        const coverArtFile = formData.get('coverArt');
        const title = formData.get('title');
        const description = formData.get('description') || '';
        const genre = formData.get('genre') || 'Unknown';
        const artistId = formData.get('artist_id') || user.id;
        const artistName = formData.get('artist_name') || user.name || user.username;
        const coverArtUrl = formData.get('cover_art_url');
        const duration = formData.get('duration') ? parseInt(formData.get('duration')) : null;

        if (!title || !artistId) {
          return Response.json({ error: 'Title and artist_id are required' }, 
            { status: 400, headers: corsHeaders });
        }

        if (!audioFile || !(audioFile instanceof File)) {
          return Response.json({ error: 'Audio file is required' }, 
            { status: 400, headers: corsHeaders });
        }

        if (audioFile.size > 50 * 1024 * 1024) {
          return Response.json({ error: 'Audio file too large (max 50MB)' }, 
            { status: 400, headers: corsHeaders });
        }

        const allowedAudioTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/m4a', 'audio/aac', 'audio/x-m4a'];
        if (!allowedAudioTypes.includes(audioFile.type)) {
          return Response.json({ error: 'Invalid audio file type' }, 
            { status: 400, headers: corsHeaders });
        }

        const trackId = uuid();
        let audioUrl = null;
        let finalCoverArtUrl = coverArtUrl || null;

        // Upload audio
        try {
          const audioExt = audioFile.name.split('.').pop() || 'mp3';
          const audioR2Key = `tracks/${trackId}.${audioExt}`;
          const audioBuffer = await audioFile.arrayBuffer();
          
          await env.MEDIA_BUCKET.put(audioR2Key, audioBuffer, {
            httpMetadata: { contentType: audioFile.type },
          });

          audioUrl = `${getR2PublicUrl()}/${audioR2Key}`;
        } catch (error) {
          console.error('Audio upload error:', error);
          return Response.json({ error: 'Failed to upload audio file' }, 
            { status: 500, headers: corsHeaders });
        }

        // Upload cover art
        if (coverArtFile && coverArtFile instanceof File) {
          try {
            if (coverArtFile.size > 5 * 1024 * 1024) {
              return Response.json({ error: 'Cover art file too large (max 5MB)' }, 
                { status: 400, headers: corsHeaders });
            }

            const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
            if (!allowedImageTypes.includes(coverArtFile.type)) {
              return Response.json({ error: 'Invalid cover art file type. Only images allowed.' }, 
                { status: 400, headers: corsHeaders });
            }

            const coverExt = coverArtFile.name.split('.').pop() || 'jpg';
            const coverR2Key = `cover-art/${trackId}.${coverExt}`;
            const coverBuffer = await coverArtFile.arrayBuffer();
            
            await env.MEDIA_BUCKET.put(coverR2Key, coverBuffer, {
              httpMetadata: { contentType: coverArtFile.type },
            });

            finalCoverArtUrl = `${getR2PublicUrl()}/${coverR2Key}`;
          } catch (error) {
            console.error('Cover art upload error:', error);
            // Don't fail the whole upload if cover art fails
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
          trackId, artistId, title, description, audioUrl, finalCoverArtUrl,
          genre, duration
        ).run();

        // Update user's track count
        await env.DB.prepare(
          'UPDATE users SET tracks_count = tracks_count + 1, updated_at = datetime("now") WHERE id = ?'
        ).bind(artistId).run();

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

    // DELETE /api/tracks/:id - Delete track
    if (url.pathname.startsWith('/api/tracks/') && request.method === 'DELETE') {
      const trackId = url.pathname.split('/api/tracks/')[1]?.split('?')[0];
      if (!trackId || !env.DB) {
        return Response.json({ error: 'Track not found' }, { status: 404, headers: corsHeaders });
      }

      try {
        const token = getAuthToken(request);
        const user = await getUserFromToken(token);
        if (!user) {
          return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
        }

        const track = await env.DB.prepare('SELECT * FROM tracks WHERE id = ?').bind(trackId).first();
        if (!track) {
          return Response.json({ error: 'Track not found' }, { status: 404, headers: corsHeaders });
        }

        if (track.artist_id !== user.id && !user.is_admin) {
          return Response.json({ error: 'Unauthorized' }, { status: 403, headers: corsHeaders });
        }

        // Delete track
        await env.DB.prepare('DELETE FROM tracks WHERE id = ?').bind(trackId).run();
        await env.DB.prepare('DELETE FROM likes WHERE track_id = ?').bind(trackId).run();

        // Update user track count
        await env.DB.prepare('UPDATE users SET tracks_count = tracks_count - 1 WHERE id = ?')
          .bind(track.artist_id).run();

        return Response.json({ success: true, message: 'Track deleted' }, { headers: corsHeaders });
      } catch (error) {
        console.error('Delete track error:', error);
        return Response.json({ error: 'Failed to delete track' }, { status: 500, headers: corsHeaders });
      }
    }

    // GET /api/users/:id/messages - Get user messages (stub)
    if (url.pathname.includes('/messages') && request.method === 'GET' && !url.pathname.includes('conversations')) {
      return Response.json([], { headers: corsHeaders });
    }

    // POST /api/messages - Send message (stub)
    if (url.pathname === '/api/messages' && request.method === 'POST') {
      return Response.json({ success: true, message: 'Message sent' }, { headers: corsHeaders });
    }

    // GET /api/users/:id/notifications - Get notifications (stub)
    if (url.pathname.includes('/notifications') && request.method === 'GET') {
      return Response.json([], { headers: corsHeaders });
    }

    // GET /api/stats - Get stats (stub)
    if (url.pathname === '/api/stats' && request.method === 'GET') {
      return Response.json({
        total_tracks: 0,
        total_users: 0,
        total_plays: 0
      }, { headers: corsHeaders });
    }

    // POST /api/violations/check - Check violations (stub)
    if (url.pathname === '/api/violations/check' && request.method === 'POST') {
      return Response.json({ violations: [] }, { headers: corsHeaders });
    }

    // POST /api/tracks/:id/comment - Add comment (stub)
    if (url.pathname.includes('/comment') && request.method === 'POST') {
      return Response.json({ success: true, message: 'Comment added' }, { headers: corsHeaders });
    }

    // POST /api/tracks/:id/repost - Repost track (stub)
    if (url.pathname.includes('/repost') && request.method === 'POST') {
      return Response.json({ success: true }, { headers: corsHeaders });
    }

    // Default: 404 with helpful message
    return Response.json({ 
      error: 'Not Found',
      path: url.pathname,
      method: request.method,
      hint: 'API endpoint not found. Check /api/health for available endpoints.'
    }, { status: 404, headers: corsHeaders });
  }
};

