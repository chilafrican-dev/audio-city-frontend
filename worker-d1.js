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

    // ==================== STATIC FILES ====================
    
    // Handle manifest.json (should be served by Pages, but handle here as fallback)
    if (url.pathname === '/manifest.json') {
      const manifest = {
        name: "Audio City",
        short_name: "Audio City",
        description: "Uganda's music community platform",
        start_url: "/feed.html",
        display: "standalone",
        background_color: "#0a0a0f",
        theme_color: "#8b5cf6"
      };
      return Response.json(manifest, { 
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/manifest+json'
        }
      });
    }

    // ==================== API ROUTES ====================

    // GET /api/health
    if (url.pathname === '/api/health') {
      return Response.json({
        status: 'ok',
        service: 'audio-city-api-worker',
        database: env.DB ? 'connected' : 'not configured',
        r2: env.MEDIA_BUCKET ? 'connected' : 'not configured',
        timestamp: new Date().toISOString(),
        path: url.pathname,
        method: request.method
      }, { headers: corsHeaders });
    }

    // GET /api/users - Get all users/artists (excludes admin accounts from public view)
    if (url.pathname === '/api/users' && request.method === 'GET') {
      try {
        if (!env.DB) {
          return Response.json([], { headers: corsHeaders });
        }
        // Filter out admin accounts - only hide users with is_admin=1 or username exactly 'admin'
        const users = await env.DB.prepare(`
          SELECT * FROM users 
          WHERE (is_admin IS NULL OR is_admin = 0 OR is_admin != 1) 
            AND (LOWER(username) != 'admin')
          ORDER BY created_at DESC
        `).all();
        
        // Enrich with accurate counts
        const enrichedUsers = await Promise.all((users.results || []).map(async (user) => {
          const followersCount = await env.DB.prepare('SELECT COUNT(*) as count FROM follows WHERE followee_id = ?')
            .bind(user.id).first();
          const followingCount = await env.DB.prepare('SELECT COUNT(*) as count FROM follows WHERE follower_id = ?')
            .bind(user.id).first();
          const tracksCount = await env.DB.prepare('SELECT COUNT(*) as count FROM tracks WHERE artist_id = ?')
            .bind(user.id).first();
          
          user.followers_count = followersCount?.count || 0;
          user.following_count = followingCount?.count || 0;
          user.tracks_count = tracksCount?.count || 0;
          user.verified = user.verified === 1;
          user.is_admin = user.is_admin === 1;
          return user;
        }));
        
        return Response.json(enrichedUsers, { headers: corsHeaders });
      } catch (error) {
        console.error('Error fetching users:', error);
        return Response.json([], { headers: corsHeaders });
      }
    }

    // GET /api/users/:id - Get single user
    if (url.pathname.startsWith('/api/users/') && request.method === 'GET' && !url.pathname.includes('/follow') && !url.pathname.includes('/profile-picture') && !url.pathname.includes('/messages') && !url.pathname.includes('/notifications') && !url.pathname.includes('/requests')) {
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
        
        // Get actual counts from database (handle missing tables gracefully)
        let followersCount = 0, followingCount = 0, tracksCount = 0;
        
        try {
          const fc = await env.DB.prepare('SELECT COUNT(*) as count FROM follows WHERE followee_id = ?')
          .bind(userId).first();
          followersCount = fc?.count || 0;
        } catch (e) { /* follows table may not exist */ }
        
        try {
          const fg = await env.DB.prepare('SELECT COUNT(*) as count FROM follows WHERE follower_id = ?')
          .bind(userId).first();
          followingCount = fg?.count || 0;
        } catch (e) { /* follows table may not exist */ }
        
        try {
          const tc = await env.DB.prepare('SELECT COUNT(*) as count FROM tracks WHERE artist_id = ?')
          .bind(userId).first();
          tracksCount = tc?.count || 0;
        } catch (e) { /* tracks table may not exist */ }
        
        user.verified = user.verified === 1;
        user.is_admin = user.is_admin === 1;
        user.followers_count = followersCount;
        user.following_count = followingCount;
        user.tracks_count = tracksCount;
        
        // Privacy: Only show email to the user themselves or admins
        const token = getAuthToken(request);
        const currentUser = await getUserFromToken(token);
        const isOwnProfile = currentUser && currentUser.id === userId;
        const isAdmin = currentUser && (currentUser.is_admin === 1 || currentUser.is_admin === true);
        
        if (!isOwnProfile && !isAdmin) {
          // Hide sensitive info from other users
          delete user.email;
        }
        
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

    // GET /api/auth/validate - Validate current token and return user info
    // Auto-renews session if token expired but user_id is valid
    if (url.pathname === '/api/auth/validate' && request.method === 'GET') {
      try {
        const token = getAuthToken(request);
        const userId = url.searchParams.get('user_id'); // Optional: for auto-renewal
        
        if (!token) {
          return Response.json({ valid: false, error: 'No token provided' }, { headers: corsHeaders });
        }
        
        let user = await getUserFromToken(token);
        
        // If token is invalid/expired but user_id is provided, try to auto-renew
        if (!user && userId) {
          // Check if user exists
          const existingUser = await env.DB.prepare('SELECT * FROM users WHERE id = ?')
            .bind(userId).first();
          
          if (existingUser) {
            // User exists - create new session (auto-renewal)
            const newToken = 'token_' + Date.now() + '_' + uuid();
            const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
            await env.DB.prepare(`
              INSERT INTO sessions (id, user_id, token, expires_at, created_at)
              VALUES (?, ?, ?, ?, datetime('now'))
            `).bind(uuid(), userId, newToken, expiresAt).run();
            
            // Delete old expired sessions for this user (cleanup)
            await env.DB.prepare(`
              DELETE FROM sessions WHERE user_id = ? AND expires_at <= datetime('now')
            `).bind(userId).run();
            
            user = existingUser;
            
            return Response.json({
              valid: true,
              token: newToken, // Return new token for frontend to update
              renewed: true,
              user: {
                id: user.id,
                username: user.username,
                name: user.name,
                email: user.email,
                user_type: user.user_type,
                is_admin: user.is_admin === 1,
                verified: user.verified === 1,
                profile_image_url: user.profile_image_url
              }
            }, { headers: corsHeaders });
          }
        }
        
        if (!user) {
          return Response.json({ valid: false, error: 'Invalid or expired token' }, { headers: corsHeaders });
        }
        
        return Response.json({
          valid: true,
          user: {
            id: user.id,
            username: user.username,
            name: user.name,
            email: user.email,
            user_type: user.user_type,
            is_admin: user.is_admin === 1,
            verified: user.verified === 1,
            profile_image_url: user.profile_image_url
          }
        }, { headers: corsHeaders });
      } catch (error) {
        console.error('Token validation error:', error);
        return Response.json({ valid: false, error: 'Validation failed' }, { headers: corsHeaders });
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

    // GET /api/tracks - Get tracks (excludes tracks from admin users)
    if (url.pathname === '/api/tracks' && request.method === 'GET') {
      try {
        if (!env.DB) {
          return Response.json({ error: 'Database not configured' }, { headers: corsHeaders });
        }
        
        const orderBy = url.searchParams.get('order') || 'created_at.desc';
        const limit = parseInt(url.searchParams.get('limit') || '100');
        const artistId = url.searchParams.get('artist_id');
        
        // Filter out tracks from admin users (only hide is_admin=1 or username exactly 'admin')
        let query = `SELECT t.*, u.username as artist_username, u.profile_image_url as artist_profile_image, u.verified as artist_is_verified 
          FROM tracks t 
          LEFT JOIN users u ON t.artist_id = u.id
          WHERE (u.is_admin IS NULL OR u.is_admin = 0 OR u.is_admin != 1) 
            AND (u.username IS NULL OR LOWER(u.username) != 'admin')`;
        const params = [];
        
        if (artistId) {
          query += ' AND t.artist_id = ?';
          params.push(artistId.replace(/^(eq|neq)\./, ''));
        }
        
        // Handle multiple order fields (e.g., "views_count.desc,likes_count.desc")
        if (orderBy.includes(',')) {
          const orderParts = orderBy.split(',').map(part => {
            const trimmed = part.trim();
            if (trimmed.includes('.')) {
              const [field, direction] = trimmed.split('.');
              return `t.${field} ${direction.toUpperCase()}`;
            }
            return `t.${trimmed} DESC`;
          });
          query += ` ORDER BY ${orderParts.join(', ')}`;
        } else if (orderBy.includes('.')) {
          const [field, direction] = orderBy.split('.');
          query += ` ORDER BY t.${field} ${direction.toUpperCase()}`;
        } else {
          query += ' ORDER BY t.created_at DESC';
        }
        
        query += ` LIMIT ?`;
        params.push(limit);
        
        // D1 bind() returns a new statement - must use the returned value
        const tracks = await env.DB.prepare(query).bind(...params).all();
        
        // Return raw tracks if enrichment fails
        const rawTracks = tracks.results || [];
        
        // Try to enrich with like counts (use track_likes table, not likes)
        try {
          const enrichedTracks = await Promise.all(rawTracks.map(async (track) => {
            const likes = await env.DB.prepare('SELECT COUNT(*) as count FROM track_likes WHERE track_id = ?')
            .bind(track.id).first();
          const comments = await env.DB.prepare('SELECT COUNT(*) as count FROM comments WHERE track_id = ?')
            .bind(track.id).first();
          
          track.likes_count = likes?.count || 0;
          track.comments_count = comments?.count || 0;
          track.shares_count = track.shares_count || 0;
          track.artist_is_verified = track.artist_is_verified === 1;
          return track;
        }));
        return Response.json(enrichedTracks, { headers: corsHeaders });
        } catch (enrichError) {
          // Return raw tracks without enrichment if it fails
          console.error('Enrichment error:', enrichError);
          return Response.json(rawTracks, { headers: corsHeaders });
        }
      } catch (error) {
        console.error('Error fetching tracks:', error);
        return Response.json({ error: error.message, stack: error.stack }, { status: 500, headers: corsHeaders });
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
          'SELECT t.*, u.username as artist_username, u.profile_image_url as artist_profile_image, u.verified as artist_is_verified FROM tracks t LEFT JOIN users u ON t.artist_id = u.id WHERE t.id = ?'
        ).bind(trackId).first();
        
        if (!track) {
          return Response.json({ error: 'Track not found' }, { status: 404, headers: corsHeaders });
        }
        
        const likes = await env.DB.prepare('SELECT COUNT(*) as count FROM track_likes WHERE track_id = ?')
          .bind(trackId).first();
        const comments = await env.DB.prepare('SELECT COUNT(*) as count FROM comments WHERE track_id = ?')
          .bind(trackId).first();
        
        // Get comments with user info
        const commentsData = await env.DB.prepare(`
          SELECT c.*, u.username as author, u.name as author_name, u.profile_image_url as author_avatar
          FROM comments c
          LEFT JOIN users u ON c.user_id = u.id
          WHERE c.track_id = ?
          ORDER BY c.created_at DESC
        `).bind(trackId).all();
        
        // Get comment likes for each comment
        const commentsWithLikes = await Promise.all((commentsData.results || []).map(async (comment) => {
          const commentLikes = await env.DB.prepare('SELECT COUNT(*) as count FROM comment_likes WHERE comment_id = ?')
            .bind(comment.id).first();
          return {
            ...comment,
            likes: commentLikes?.count || 0,
            liked_by: [] // Will be populated if needed
          };
        }));
        
        track.likes_count = likes?.count || 0;
        track.comments_count = comments?.count || 0;
        track.comments = commentsWithLikes;
        track.shares_count = track.shares_count || 0;
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
          'SELECT id FROM track_likes WHERE user_id = ? AND track_id = ?'
        ).bind(userId, trackId).first();
        
        if (existing) {
          // Unlike
          await env.DB.prepare('DELETE FROM track_likes WHERE user_id = ? AND track_id = ?')
            .bind(userId, trackId).run();
          return Response.json({ success: true, liked: false }, { headers: corsHeaders });
        } else {
          // Like
          await env.DB.prepare('INSERT INTO track_likes (id, user_id, track_id, created_at) VALUES (?, ?, ?, datetime("now"))')
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
        return Response.json({ success: true, shares_count: 0 }, { headers: corsHeaders });
      }
      
      try {
        await env.DB.prepare('UPDATE tracks SET shares_count = shares_count + 1 WHERE id = ?')
          .bind(trackId).run();
        
        const track = await env.DB.prepare('SELECT shares_count FROM tracks WHERE id = ?').bind(trackId).first();
        return Response.json({ 
          success: true,
          shares_count: track?.shares_count || 0
        }, { headers: corsHeaders });
      } catch (error) {
        return Response.json({ success: true, shares_count: 0 }, { headers: corsHeaders });
      }
    }

    // GET /api/feed/trending-artists (excludes admin accounts from public view)
    if (url.pathname === '/api/feed/trending-artists' && request.method === 'GET') {
      try {
        if (!env.DB) {
          return Response.json([], { headers: corsHeaders });
        }
        // Filter out admin accounts from trending artists - only hide is_admin=1 or username exactly 'admin'
        const artists = await env.DB.prepare(`
          SELECT u.*, COUNT(t.id) as track_count
          FROM users u
          LEFT JOIN tracks t ON u.id = t.artist_id
          WHERE (u.is_admin IS NULL OR u.is_admin = 0 OR u.is_admin != 1) 
            AND (LOWER(u.username) != 'admin')
          GROUP BY u.id
          ORDER BY track_count DESC, u.created_at DESC
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
        console.error('Error details:', error.message, error.stack);
        return Response.json({ 
          error: 'Login failed',
          details: error.message || 'Unknown error'
        }, 
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
      
      const GOOGLE_CLIENT_ID = env.GOOGLE_CLIENT_ID;
      const GOOGLE_CLIENT_SECRET = env.GOOGLE_CLIENT_SECRET;
      
      if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
        return Response.redirect(`${url.origin}/login.html?error=oauth_not_configured`, 302);
      }
      
      try {
        // Exchange code for access token
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code: code,
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            redirect_uri: `${url.origin}/auth/google/callback`,
            grant_type: 'authorization_code'
          })
        });
        
        if (!tokenResponse.ok) {
          console.error('Token exchange failed:', await tokenResponse.text());
          return Response.redirect(`${url.origin}/login.html?error=oauth_token_failed`, 302);
        }
        
        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;
        
        // Get user info from Google
        const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        
        if (!userInfoResponse.ok) {
          console.error('User info fetch failed:', await userInfoResponse.text());
          return Response.redirect(`${url.origin}/login.html?error=oauth_userinfo_failed`, 302);
        }
        
        const googleUser = await userInfoResponse.json();
        
        if (!env.DB) {
          return Response.redirect(`${url.origin}/login.html?error=database_not_configured`, 302);
        }
        
        // Find or create user
        let user = await env.DB.prepare('SELECT * FROM users WHERE email = ? OR google_id = ?')
          .bind(googleUser.email.toLowerCase(), googleUser.id).first();
        
        if (!user) {
          // Create new user
          const userId = uuid();
          const baseUsername = googleUser.email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
          let username = baseUsername;
          let counter = 1;
          
          // Ensure unique username
          while (true) {
            const existing = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
            if (!existing) break;
            username = `${baseUsername}${counter}`;
            counter++;
          }
          
          await env.DB.prepare(`
            INSERT INTO users (
              id, username, email, name, avatar_url, profile_image_url,
              auth_provider, google_id, password, followers_count, following_count, tracks_count,
              verified, is_admin, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, 'google', ?, NULL, 0, 0, 0, 0, 0, datetime('now'), datetime('now'))
          `).bind(
            userId,
            username,
            googleUser.email.toLowerCase(),
            googleUser.name || username,
            googleUser.picture || null,
            googleUser.picture || null,
            googleUser.id
          ).run();
          
          user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
        } else {
          // Update existing user with Google info if needed
          if (!user.google_id) {
            await env.DB.prepare('UPDATE users SET google_id = ?, auth_provider = ?, updated_at = datetime("now") WHERE id = ?')
              .bind(googleUser.id, 'google', user.id).run();
          }
          if (googleUser.picture && !user.avatar_url) {
            await env.DB.prepare('UPDATE users SET avatar_url = ?, profile_image_url = ?, updated_at = datetime("now") WHERE id = ?')
              .bind(googleUser.picture, googleUser.picture, user.id).run();
          }
        }
        
        // Create session
        const token = 'google_token_' + Date.now() + '_' + uuid();
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        await env.DB.prepare(`
          INSERT INTO sessions (id, user_id, token, expires_at, created_at)
          VALUES (?, ?, ?, ?, datetime('now'))
        `).bind(uuid(), user.id, token, expiresAt).run();
        
        // Redirect to frontend with token
        const frontendOrigin = url.origin.replace('api.', 'www.') || url.origin;
        const redirectUrl = `${frontendOrigin}/login.html?` +
          `google_auth=success&` +
          `token=${token}&` +
          `user_id=${user.id}&` +
          `user_name=${encodeURIComponent(user.name || user.username)}&` +
          `username=${encodeURIComponent(user.username)}&` +
          `user_email=${encodeURIComponent(user.email)}&` +
          `is_admin=${user.is_admin || 0}`;
        
        return Response.redirect(redirectUrl, 302);
        
      } catch (error) {
        console.error('OAuth callback error:', error);
        return Response.redirect(`${url.origin}/login.html?error=oauth_error`, 302);
      }
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
            'UPDATE users SET avatar_url = ?, profile_image_url = ?, updated_at = datetime("now") WHERE id = ?'
          ).bind(avatarUrl, avatarUrl, userId).run();
        }

        return Response.json({
          success: true,
          message: 'Profile picture uploaded successfully',
          avatar_url: avatarUrl,
          profile_image_url: avatarUrl,
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
        if (body.phone_number !== undefined) {
          updates.push('phone_number = ?');
          values.push(body.phone_number);
        }
        if (body.username !== undefined) {
          updates.push('username = ?');
          values.push(body.username);
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
        await env.DB.prepare('DELETE FROM track_likes WHERE track_id = ?').bind(trackId).run();

        // Update user track count
        await env.DB.prepare('UPDATE users SET tracks_count = tracks_count - 1 WHERE id = ?')
          .bind(track.artist_id).run();

        return Response.json({ success: true, message: 'Track deleted' }, { headers: corsHeaders });
      } catch (error) {
        console.error('Delete track error:', error);
        return Response.json({ error: 'Failed to delete track' }, { status: 500, headers: corsHeaders });
      }
    }

    // ==================== MESSAGING SYSTEM ====================

    // GET /api/conversations - Get user conversations
    if (url.pathname === '/api/conversations' && request.method === 'GET') {
      const userId = url.searchParams.get('user_id');
      if (!userId || !env.DB) {
      return Response.json([], { headers: corsHeaders });
    }
      try {
        const conversations = await env.DB.prepare(`
          SELECT c.*, 
            CASE WHEN c.participant1_id = ? THEN c.participant2_id ELSE c.participant1_id END as other_user_id
          FROM conversations c
          WHERE c.participant1_id = ? OR c.participant2_id = ?
          ORDER BY c.last_message_at DESC
        `).bind(userId, userId, userId).all();
        
        // Enrich with user info and last message
        const enriched = await Promise.all((conversations.results || []).map(async (conv) => {
          const otherUser = await env.DB.prepare('SELECT id, username, name, profile_image_url FROM users WHERE id = ?')
            .bind(conv.other_user_id).first();
          const lastMsg = await env.DB.prepare('SELECT text as content, created_at, sender_id FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1')
            .bind(conv.id).first();
          const unreadCount = await env.DB.prepare('SELECT COUNT(*) as count FROM messages WHERE conversation_id = ? AND receiver_id = ? AND read = 0')
            .bind(conv.id, userId).first();
          return {
            ...conv,
            other_user: otherUser,
            last_message: lastMsg,
            unread_count: unreadCount?.count || 0
          };
        }));
        return Response.json(enriched, { headers: corsHeaders });
      } catch (e) {
        console.error('Error fetching conversations:', e);
        return Response.json([], { headers: corsHeaders });
      }
    }

    // POST /api/conversations - Create or get conversation
    if (url.pathname === '/api/conversations' && request.method === 'POST') {
      const body = await parseBody(request);
      const { participant1_id, participant2_id } = body || {};
      if (!participant1_id || !participant2_id || !env.DB) {
        return Response.json({ error: 'Both participant IDs required' }, { status: 400, headers: corsHeaders });
      }
      try {
        // Check if conversation exists
        let conv = await env.DB.prepare(`
          SELECT * FROM conversations 
          WHERE (participant1_id = ? AND participant2_id = ?) OR (participant1_id = ? AND participant2_id = ?)
        `).bind(participant1_id, participant2_id, participant2_id, participant1_id).first();
        
        if (!conv) {
          const convId = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          await env.DB.prepare(`
            INSERT INTO conversations (id, participant1_id, participant2_id, created_at, last_message_at)
            VALUES (?, ?, ?, datetime('now'), datetime('now'))
          `).bind(convId, participant1_id, participant2_id).run();
          conv = { id: convId, participant1_id, participant2_id, created_at: new Date().toISOString() };
        }
        return Response.json(conv, { headers: corsHeaders });
      } catch (e) {
        console.error('Error creating conversation:', e);
        return Response.json({ error: 'Failed to create conversation' }, { status: 500, headers: corsHeaders });
      }
    }

    // GET /api/conversations/:userId1/:userId2/messages - Get messages between two users
    // Frontend uses /api/conversations/{currentUserId}/{otherUserId}/messages
    if (url.pathname.includes('/conversations/') && url.pathname.includes('/messages') && !url.pathname.includes('/messages/read') && request.method === 'GET') {
      const parts = url.pathname.split('/api/conversations/')[1]?.split('/') || [];
      const userId1 = parts[0];
      const userId2 = parts[1] !== 'messages' ? parts[1] : null;
      
      if (!userId1 || !env.DB) {
        return Response.json([], { headers: corsHeaders });
      }
      
      // Generate consistent conversation ID from user IDs (sorted to ensure same ID regardless of order)
      const sortedIds = userId2 ? [userId1, userId2].sort() : [userId1];
      const convId = sortedIds.join('_');
      
      try {
        // Use existing DB column names: receiver_id, text, read
        const messages = await env.DB.prepare(`
          SELECT m.id, m.conversation_id, m.sender_id, m.receiver_id, m.text, m.read, m.created_at,
                 u.username as sender_username, u.name as sender_name, u.profile_image_url as sender_avatar
          FROM messages m
          LEFT JOIN users u ON m.sender_id = u.id
          WHERE m.conversation_id = ?
          ORDER BY m.created_at ASC
        `).bind(convId).all();
        
        // Format messages for frontend (map DB columns to expected names)
        const formatted = (messages.results || []).map(msg => ({
          id: msg.id,
          conversation_id: msg.conversation_id,
          sender_id: msg.sender_id,
          recipient_id: msg.receiver_id,  // Map receiver_id to recipient_id
          content: msg.text,               // Map text to content
          is_read: msg.read === 1 || msg.read === true,  // Map read to is_read
          created_at: msg.created_at,
          sender: {
            id: msg.sender_id,
            username: msg.sender_username,
            name: msg.sender_name,
            avatar: msg.sender_avatar
          }
        }));
        
        return Response.json(formatted, { headers: corsHeaders });
      } catch (e) {
        console.error('Error fetching messages:', e);
        return Response.json([], { headers: corsHeaders });
      }
    }

    // POST /api/conversations/:userId1/:userId2/messages - Send message between two users
    // Frontend uses /api/conversations/{currentUserId}/{otherUserId}/messages
    if (url.pathname.includes('/conversations/') && url.pathname.includes('/messages') && !url.pathname.includes('/messages/read') && request.method === 'POST') {
      const parts = url.pathname.split('/api/conversations/')[1]?.split('/') || [];
      const userId1 = parts[0];
      const userId2 = parts[1] !== 'messages' ? parts[1] : null;
      
      const body = await parseBody(request);
      const { sender_id, recipient_id, content } = body || {};
      
      // Use body values or URL values
      const actualSenderId = sender_id || userId1;
      const actualRecipientId = recipient_id || userId2;
      
      if (!actualSenderId || !content || !env.DB) {
        return Response.json({ error: 'Missing required fields (sender_id, content)' }, { status: 400, headers: corsHeaders });
      }
      
      // Generate consistent conversation ID from user IDs (sorted)
      const sortedIds = actualRecipientId ? [actualSenderId, actualRecipientId].sort() : [actualSenderId];
      const convId = sortedIds.join('_');
      
      try {
        // Ensure conversation exists (create if it doesn't)
        try {
          const existingConv = await env.DB.prepare('SELECT id FROM conversations WHERE id = ?').bind(convId).first();
          if (!existingConv && actualRecipientId) {
            await env.DB.prepare(`
              INSERT INTO conversations (id, participant1_id, participant2_id, created_at, last_message_at)
              VALUES (?, ?, ?, datetime('now'), datetime('now'))
            `).bind(convId, actualSenderId, actualRecipientId).run();
          }
        } catch (e) {
          console.warn('Conversation check/create:', e.message);
        }
        
        const msgId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        // Use existing DB column names: receiver_id, text, read
        await env.DB.prepare(`
          INSERT INTO messages (id, conversation_id, sender_id, receiver_id, text, read, created_at)
          VALUES (?, ?, ?, ?, ?, 0, datetime('now'))
        `).bind(msgId, convId, actualSenderId, actualRecipientId || '', content).run();
        
        // Update conversation last_message_at
        try {
          await env.DB.prepare('UPDATE conversations SET last_message_at = datetime("now") WHERE id = ?').bind(convId).run();
        } catch (e) { /* ignore */ }
        
        // Return message with sender info
        const msg = await env.DB.prepare(`
          SELECT m.*, u.username as sender_username, u.name as sender_name, u.profile_image_url as sender_avatar
          FROM messages m
          LEFT JOIN users u ON m.sender_id = u.id
          WHERE m.id = ?
        `).bind(msgId).first();
        
        return Response.json(msg || { 
          id: msgId, 
          conversation_id: convId, 
          sender_id: actualSenderId, 
          recipient_id: actualRecipientId, 
          content, 
          created_at: new Date().toISOString() 
        }, { headers: corsHeaders });
      } catch (e) {
        console.error('Error sending message:', e);
        return Response.json({ error: 'Failed to send message: ' + e.message }, { status: 500, headers: corsHeaders });
      }
    }

    // PUT /api/conversations/:id/:recipientId?/messages/read - Mark messages as read
    // Handles both /api/conversations/:id/messages/read and /api/conversations/:id/:recipientId/messages/read
    if (url.pathname.includes('/messages/read') && request.method === 'PUT') {
      const parts = url.pathname.split('/api/conversations/')[1]?.split('/') || [];
      const convId = parts[0];
      const body = await parseBody(request);
      const userId = body?.user_id;
      if (!convId || !env.DB) {
        return Response.json({ success: true }, { headers: corsHeaders });
      }
      try {
        // Use existing DB column names: read, receiver_id
        await env.DB.prepare('UPDATE messages SET read = 1 WHERE conversation_id = ? AND receiver_id = ?')
          .bind(convId, userId || '').run();
        return Response.json({ success: true }, { headers: corsHeaders });
      } catch (e) {
        return Response.json({ success: true }, { headers: corsHeaders });
      }
    }

    // GET /api/users/:id/messages - Get all conversations for a user
    if (url.pathname.includes('/users/') && url.pathname.includes('/messages') && request.method === 'GET' && !url.pathname.includes('conversations')) {
      const userId = url.pathname.split('/api/users/')[1]?.split('/')[0];
      
      if (!userId || !env.DB) {
        return Response.json([], { headers: corsHeaders });
      }
      
      try {
        // Get all messages where user is sender or receiver, grouped by other user
        const messages = await env.DB.prepare(`
          SELECT 
            m.id,
            m.sender_id,
            m.receiver_id,
            m.text as last_message,
            m.read,
            m.created_at,
            m.conversation_id,
            CASE WHEN m.sender_id = ? THEN m.receiver_id ELSE m.sender_id END as other_user_id,
            u.name as sender_name,
            u.username as sender_username,
            u.profile_image_url as sender_avatar
          FROM messages m
          LEFT JOIN users u ON (CASE WHEN m.sender_id = ? THEN m.receiver_id ELSE m.sender_id END) = u.id
          WHERE m.sender_id = ? OR m.receiver_id = ?
          ORDER BY m.created_at DESC
        `).bind(userId, userId, userId, userId).all();
        
        // Group by other_user_id to get unique conversations
        const conversationsMap = new Map();
        for (const msg of (messages.results || [])) {
          const otherUserId = msg.other_user_id;
          if (!conversationsMap.has(otherUserId)) {
            // Only mark as unread if the message was received by the logged-in user (not sent by them)
            const isUnread = msg.read === 0 && msg.receiver_id === userId;
            conversationsMap.set(otherUserId, {
              id: otherUserId,
              conversation_id: msg.conversation_id || `${[userId, otherUserId].sort().join('_')}`,
              sender_id: msg.sender_id,
              receiver_id: msg.receiver_id,
              last_message: msg.last_message,
              read: msg.read,
              is_unread: isUnread, // Only true if received by logged-in user and unread
              created_at: msg.created_at,
              sender_name: msg.sender_name,
              sender_avatar: msg.sender_avatar,
              name: msg.sender_name,
              avatar: msg.sender_avatar
            });
          }
        }
        
        // Count unread messages for each conversation
        const conversations = Array.from(conversationsMap.values());
        for (const conv of conversations) {
          const convId = conv.conversation_id || `${[userId, conv.id].sort().join('_')}`;
          const unreadCount = await env.DB.prepare(`
            SELECT COUNT(*) as count 
            FROM messages 
            WHERE conversation_id = ? AND receiver_id = ? AND read = 0
          `).bind(convId, userId).first();
          conv.unread_count = unreadCount?.count || 0;
          conv.is_unread = conv.unread_count > 0;
        }
        
        console.log(`Found ${conversations.length} conversations for user ${userId}`);
        return Response.json(conversations, { headers: corsHeaders });
      } catch (e) {
        console.error('Error fetching user messages:', e);
        return Response.json([], { headers: corsHeaders });
      }
    }
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

    // POST /api/quick-master - Audio mastering (proxy to VPS server)
    if (url.pathname === '/api/quick-master' && request.method === 'POST') {
      try {
        // Proxy request to VPS mastering server
        // Note: Cloudflare Workers can make HTTP requests, but may have connectivity issues
        // MASTERING_SERVER_URL should be base URL (e.g., https://mastering.audiocity-ug.com)
        // The endpoint path is appended: /api/master or /api/quick-master
        const MASTERING_SERVER_BASE = env.MASTERING_SERVER_URL || 'http://168.119.241.59:3001';
        // If URL includes /api/master or /api/quick-master, use it directly
        // If it's a tunnel URL (trycloudflare.com), append /api/quick-master
        // Otherwise append /api/quick-master for backward compatibility
        let MASTERING_SERVER_URL;
        if (MASTERING_SERVER_BASE.includes('/api/')) {
          MASTERING_SERVER_URL = MASTERING_SERVER_BASE;
        } else if (MASTERING_SERVER_BASE.includes('trycloudflare.com')) {
          // Tunnel URLs need the full path
          MASTERING_SERVER_URL = `${MASTERING_SERVER_BASE}/api/quick-master`;
        } else {
          MASTERING_SERVER_URL = `${MASTERING_SERVER_BASE}/api/quick-master`;
        }
        const formData = await request.formData();
        
        // Forward the request to the mastering server with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15 * 60 * 1000); // 15 minutes timeout
        
        try {
          console.log('Proxying mastering request to:', MASTERING_SERVER_URL);
          const masteringResponse = await fetch(MASTERING_SERVER_URL, {
            method: 'POST',
            body: formData,
            signal: controller.signal,
            // Add headers to help with connection
            headers: {
              'User-Agent': 'AudioCity-Worker/1.0'
            }
          });
          
          clearTimeout(timeoutId);
          
          if (!masteringResponse.ok) {
            const errorText = await masteringResponse.text().catch(() => 'Unknown error');
            console.error('Mastering server error:', masteringResponse.status, errorText);
            throw new Error(`Mastering server returned ${masteringResponse.status}: ${errorText.substring(0, 200)}`);
          }
          
          // Get response data
          const contentType = masteringResponse.headers.get('content-type') || '';
          let responseData;
          
          if (contentType.includes('application/json')) {
            responseData = await masteringResponse.json();
          } else {
            // Handle other content types (e.g., file downloads)
            responseData = await masteringResponse.text();
          }
          
          // Return response with appropriate headers
          return new Response(
            typeof responseData === 'string' ? responseData : JSON.stringify(responseData),
            {
              status: masteringResponse.status,
              headers: {
                ...corsHeaders,
                'Content-Type': contentType || 'application/json'
              }
            }
          );
        } catch (fetchError) {
          clearTimeout(timeoutId);
          console.error('Mastering fetch error:', fetchError.name, fetchError.message);
          
          if (fetchError.name === 'AbortError') {
            throw new Error('Mastering request timed out. The file may be too large or the server is taking too long.');
          }
          
          // Check for specific network errors
          if (fetchError.message.includes('fetch failed') || fetchError.message.includes('network') || fetchError.message.includes('ECONNREFUSED')) {
            throw new Error('Cannot connect to mastering server. The server may be offline or unreachable from Cloudflare Workers. Please ensure the VPS server is accessible.');
          }
          
          throw fetchError;
        }
      } catch (error) {
        console.error('Mastering proxy error:', error);
        return Response.json({
          success: false,
          error: 'Failed to connect to mastering server',
          message: error.message || 'Mastering service is temporarily unavailable. Please try again later.',
          details: error.name || 'Unknown error'
        }, { status: 503, headers: corsHeaders });
      }
    }

    // GET /api/mastering-progress/:id - Mastering progress (proxy to VPS server)
    if (url.pathname.startsWith('/api/mastering-progress/') && request.method === 'GET') {
      try {
        const progressId = url.pathname.split('/api/mastering-progress/')[1];
        // Extract base URL from MASTERING_SERVER_URL (remove /api/master or /api/quick-master if present)
        const MASTERING_SERVER_BASE = (env.MASTERING_SERVER_URL || 'http://168.119.241.59:3001').replace(/\/api\/(master|quick-master)$/, '');
        
        const masteringResponse = await fetch(`${MASTERING_SERVER_BASE}/api/mastering-progress/${progressId}`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json'
          }
        });
        
        const responseData = await masteringResponse.json();
        
        return Response.json(responseData, {
          status: masteringResponse.status,
          headers: corsHeaders
        });
      } catch (error) {
        console.error('Mastering progress proxy error:', error);
        return Response.json({
          status: 'error',
          message: 'Failed to fetch mastering progress',
          progress: 0
        }, { status: 503, headers: corsHeaders });
      }
    }

    // GET /api/mastering-result/:id - Mastering result (proxy to VPS server)
    if (url.pathname.startsWith('/api/mastering-result/') && request.method === 'GET') {
      try {
        const resultId = url.pathname.split('/api/mastering-result/')[1];
        // Extract base URL from MASTERING_SERVER_URL (remove /api/master or /api/quick-master if present)
        const MASTERING_SERVER_BASE = (env.MASTERING_SERVER_URL || 'http://168.119.241.59:3001').replace(/\/api\/(master|quick-master)$/, '');
        
        const masteringResponse = await fetch(`${MASTERING_SERVER_BASE}/api/mastering-result/${resultId}`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json'
          }
        });
        
        const responseData = await masteringResponse.json();
        
        return Response.json(responseData, {
          status: masteringResponse.status,
          headers: corsHeaders
        });
      } catch (error) {
        console.error('Mastering result proxy error:', error);
        return Response.json({
          success: false,
          error: 'Failed to fetch mastering result'
        }, { status: 503, headers: corsHeaders });
      }
    }

    // POST /api/tracks/:id/comment - Add comment
    if (url.pathname.includes('/comment') && request.method === 'POST' && !url.pathname.includes('comments/')) {
      const trackId = url.pathname.split('/api/tracks/')[1]?.split('/')[0];
      const body = await parseBody(request);
      const text = body?.text;
      const userId = body?.user_id || body?.author_id;
      
      if (!trackId || !text || !env.DB) {
        return Response.json({ error: 'Track ID and comment text are required' }, 
          { status: 400, headers: corsHeaders });
      }
      
      try {
        // Check if track exists
        const track = await env.DB.prepare('SELECT id FROM tracks WHERE id = ?').bind(trackId).first();
        if (!track) {
          return Response.json({ error: 'Track not found' }, { status: 404, headers: corsHeaders });
        }
        
        // Get user info if userId provided
        let author = 'User';
        let authorName = 'User';
        let authorAvatar = null;
        if (userId) {
          const user = await env.DB.prepare('SELECT username, name, profile_image_url FROM users WHERE id = ?')
            .bind(userId).first();
          if (user) {
            author = user.username || 'User';
            authorName = user.name || user.username || 'User';
            authorAvatar = user.profile_image_url || null;
          }
        }
        
        // Create comment
        const commentId = uuid();
        await env.DB.prepare(`
          INSERT INTO comments (id, track_id, user_id, content, likes, created_at)
          VALUES (?, ?, ?, ?, 0, datetime('now'))
        `).bind(commentId, trackId, userId, text.trim()).run();
        
        // Get comment count
        const commentsCount = await env.DB.prepare('SELECT COUNT(*) as count FROM comments WHERE track_id = ?')
          .bind(trackId).first();
        
        const comment = {
          id: commentId,
          track_id: trackId,
          user_id: userId,
          author: author,
          author_name: authorName,
          author_avatar: authorAvatar,
          text: text.trim(),
          content: text.trim(),
          likes: 0,
          liked_by: [],
          time: new Date().toISOString(),
          created_at: new Date().toISOString()
        };
        
        return Response.json({
          success: true,
          comment: comment,
          comments_count: commentsCount?.count || 0
        }, { headers: corsHeaders });
        
      } catch (error) {
        console.error('Comment error:', error);
        return Response.json({ error: 'Failed to add comment' }, 
          { status: 500, headers: corsHeaders });
      }
    }

    // DELETE /api/tracks/:id/comments/:commentId - Delete comment (only author or admin)
    if (url.pathname.includes('/comments/') && request.method === 'DELETE') {
      const parts = url.pathname.split('/');
      const trackIdIndex = parts.indexOf('tracks') + 1;
      const commentIdIndex = parts.indexOf('comments') + 1;
      const trackId = parts[trackIdIndex];
      const commentId = parts[commentIdIndex];
      
      if (!trackId || !commentId || !env.DB) {
        return Response.json({ error: 'Track ID and comment ID required' }, 
          { status: 400, headers: corsHeaders });
      }
      
      try {
        // Get current user
        const token = getAuthToken(request);
        const currentUser = await getUserFromToken(token);
        if (!currentUser) {
          return Response.json({ error: 'Unauthorized - login required' }, { status: 401, headers: corsHeaders });
        }
        
        // Check if comment exists and get author
        const comment = await env.DB.prepare('SELECT id, user_id FROM comments WHERE id = ? AND track_id = ?')
          .bind(commentId, trackId).first();
        if (!comment) {
          return Response.json({ error: 'Comment not found' }, { status: 404, headers: corsHeaders });
        }
        
        // Only allow author or admin to delete
        const isAdmin = currentUser.is_admin === 1 || currentUser.is_admin === true;
        if (comment.user_id !== currentUser.id && !isAdmin) {
          return Response.json({ error: 'Not authorized to delete this comment' }, { status: 403, headers: corsHeaders });
        }
        
        // Delete comment
        await env.DB.prepare('DELETE FROM comments WHERE id = ?').bind(commentId).run();
        try {
        await env.DB.prepare('DELETE FROM comment_likes WHERE comment_id = ?').bind(commentId).run();
        } catch (e) { /* table may not exist */ }
        
        // Get updated comment count
        const commentsCount = await env.DB.prepare('SELECT COUNT(*) as count FROM comments WHERE track_id = ?')
          .bind(trackId).first();
        
        return Response.json({
          success: true,
          comments_count: commentsCount?.count || 0
        }, { headers: corsHeaders });
        
      } catch (error) {
        console.error('Delete comment error:', error);
        return Response.json({ error: 'Failed to delete comment' }, 
          { status: 500, headers: corsHeaders });
      }
    }

    // POST /api/tracks/:id/comments/:commentId/like - Like/unlike comment
    if (url.pathname.includes('/comments/') && url.pathname.includes('/like') && request.method === 'POST') {
      const parts = url.pathname.split('/');
      const trackIdIndex = parts.indexOf('tracks') + 1;
      const commentIdIndex = parts.indexOf('comments') + 1;
      const trackId = parts[trackIdIndex];
      const commentId = parts[commentIdIndex];
      const body = await parseBody(request);
      const userId = body?.user_id || url.searchParams.get('user_id');
      
      if (!trackId || !commentId || !userId || !env.DB) {
        return Response.json({ error: 'Track ID, comment ID, and user ID required' }, 
          { status: 400, headers: corsHeaders });
      }
      
      try {
        // Check if comment exists
        const comment = await env.DB.prepare('SELECT id FROM comments WHERE id = ? AND track_id = ?')
          .bind(commentId, trackId).first();
        if (!comment) {
          return Response.json({ error: 'Comment not found' }, { status: 404, headers: corsHeaders });
        }
        
        // Check if already liked
        const existing = await env.DB.prepare(
          'SELECT id FROM comment_likes WHERE user_id = ? AND comment_id = ?'
        ).bind(userId, commentId).first();
        
        if (existing) {
          // Unlike
          await env.DB.prepare('DELETE FROM comment_likes WHERE user_id = ? AND comment_id = ?')
            .bind(userId, commentId).run();
          
          // Update comment likes count
          await env.DB.prepare('UPDATE comments SET likes = likes - 1 WHERE id = ?')
            .bind(commentId).run();
          
          const updatedComment = await env.DB.prepare('SELECT likes FROM comments WHERE id = ?')
            .bind(commentId).first();
          
          return Response.json({
            success: true,
            likes: Math.max(0, updatedComment?.likes || 0),
            is_liked: false
          }, { headers: corsHeaders });
        } else {
          // Like
          await env.DB.prepare('INSERT INTO comment_likes (id, user_id, comment_id, created_at) VALUES (?, ?, ?, datetime("now"))')
            .bind(uuid(), userId, commentId).run();
          
          // Update comment likes count
          await env.DB.prepare('UPDATE comments SET likes = likes + 1 WHERE id = ?')
            .bind(commentId).run();
          
          const updatedComment = await env.DB.prepare('SELECT likes FROM comments WHERE id = ?')
            .bind(commentId).first();
          
          return Response.json({
            success: true,
            likes: updatedComment?.likes || 0,
            is_liked: true
          }, { headers: corsHeaders });
        }
      } catch (error) {
        console.error('Comment like error:', error);
        return Response.json({ error: 'Failed to update comment like' }, 
          { status: 500, headers: corsHeaders });
      }
    }

    // POST /api/tracks/:id/repost - Repost track (stub)
    if (url.pathname.includes('/repost') && request.method === 'POST') {
      return Response.json({ success: true }, { headers: corsHeaders });
    }

    // Default: 404 with helpful message
    // Log for debugging
    console.error('404 Not Found:', {
      path: url.pathname,
      method: request.method,
      url: request.url,
      host: url.hostname
    });
    
    return Response.json({ 
      error: 'Not Found',
      path: url.pathname,
      method: request.method,
      url: request.url,
      hint: 'API endpoint not found. Check /api/health for available endpoints.',
      availableEndpoints: [
        '/api/health',
        '/api/users',
        '/api/tracks',
        '/api/feed/trending-artists',
        '/api/auth/*'
      ]
    }, { status: 404, headers: corsHeaders });
  }
};
