/**
 * Cloudflare Worker for Audio City
 * 
 * This worker proxies API and authentication requests to the VPS backend
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // CORS headers - Allow DELETE method
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
      'Access-Control-Max-Age': '86400',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    // Proxy function for API and auth routes
    const proxyRequest = async (pathPrefix) => {
      // Use backend URL from environment
      // NOTE: Cloudflare Workers can only connect to HTTPS endpoints
      // If backend is HTTP-only, use Cloudflare Tunnel or deploy with HTTPS
      const backendUrl = env.BACKEND_URL || 'https://api.audiocity-ug.com';
      
      // Ensure backend URL doesn't end with a slash
      const cleanBackendUrl = backendUrl.replace(/\/$/, '');
      const proxyUrl = `${cleanBackendUrl}${url.pathname}${url.search}`;
      
      try {
        // Clone request headers but remove host
        const headers = new Headers();
        for (const [key, value] of request.headers.entries()) {
          if (key.toLowerCase() !== 'host') {
            headers.set(key, value);
          }
        }
        
        // Handle body - preserve FormData for file uploads
        let body = null;
        const contentType = request.headers.get('content-type') || '';
        
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          if (contentType.includes('multipart/form-data')) {
            // For FormData, clone the request body
            body = request.body;
          } else {
            // For JSON/text, read as text
            body = await request.text();
          }
        }
        
        const response = await fetch(proxyUrl, {
          method: request.method,
          headers: headers,
          body: body,
        });

        // For redirects (like OAuth), pass through the Location header
        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get('Location');
          if (location) {
            return Response.redirect(location, response.status);
          }
        }

        const data = await response.text();
        
        // If we get a 404, the backend route doesn't exist
        // Return empty/mock data instead of 404 to prevent frontend errors
        if (response.status === 404) {
          // Return empty arrays/objects for common endpoints to prevent frontend crashes
          if (url.pathname === '/api/tracks' || url.pathname.startsWith('/api/tracks')) {
            return new Response(JSON.stringify([]), {
              status: 200,
              headers: {
                ...corsHeaders,
                'Content-Type': 'application/json',
              },
            });
          }
          
          if (url.pathname.startsWith('/api/users/')) {
            // Return minimal user object to prevent auth loops
            const userId = url.pathname.split('/api/users/')[1];
            return new Response(JSON.stringify({
              id: userId,
              username: 'user',
              name: 'User',
              avatar_url: null,
              profile_image: null,
              followers_count: 0,
              following_count: 0,
              tracks_count: 0
            }), {
              status: 200,
              headers: {
                ...corsHeaders,
                'Content-Type': 'application/json',
              },
            });
          }
          
          if (url.pathname === '/api/feed/trending-artists') {
            return new Response(JSON.stringify([]), {
              status: 200,
              headers: {
                ...corsHeaders,
                'Content-Type': 'application/json',
              },
            });
          }
          
          // For other 404s, return the error but with helpful message
          return new Response(JSON.stringify({
            error: 'Not Found',
            message: `Backend endpoint ${url.pathname} not found`,
            backendUrl: cleanBackendUrl,
            hint: 'Backend may not be running or BACKEND_URL is incorrect. Check: ' + proxyUrl
          }), {
            status: 404,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
            },
          });
        }
        
        return new Response(data, {
          status: response.status,
          headers: {
            ...corsHeaders,
            'Content-Type': response.headers.get('Content-Type') || 'application/json',
          },
        });
      } catch (error) {
        // If backend is completely unavailable, return empty data instead of error
        // This prevents frontend from crashing
        if (url.pathname === '/api/tracks' || url.pathname.startsWith('/api/tracks')) {
          return new Response(JSON.stringify([]), {
            status: 200,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
            },
          });
        }
        
        if (url.pathname.startsWith('/api/users/')) {
          const userId = url.pathname.split('/api/users/')[1];
          return new Response(JSON.stringify({
            id: userId,
            username: 'user',
            name: 'User',
            avatar_url: null
          }), {
            status: 200,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
            },
          });
        }
        
        if (url.pathname === '/api/feed/trending-artists') {
          return new Response(JSON.stringify([]), {
            status: 200,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
            },
          });
        }
        
        // For other errors, return proper error
        return new Response(JSON.stringify({ 
          error: 'Backend unavailable',
          message: error.message,
          backendUrl: cleanBackendUrl,
          requestedPath: url.pathname,
          hint: 'Backend is not accessible. Check that BACKEND_URL is set and backend is running.'
        }), {
          status: 503,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        });
      }
    };

    // Proxy API requests to VPS backend
    if (url.pathname.startsWith('/api/')) {
      return proxyRequest('/api/');
    }

    // Proxy authentication routes (OAuth, etc.)
    if (url.pathname.startsWith('/auth/')) {
      return proxyRequest('/auth/');
    }

    // Debug endpoint to check worker configuration
    if (url.pathname === '/debug' || url.pathname === '/worker/debug') {
      const backendUrl = env.BACKEND_URL || 'https://api.audiocity-ug.com';
      return new Response(JSON.stringify({
        worker: 'audio-city-api-proxy',
        backendUrl: backendUrl,
        backendUrlSet: !!env.BACKEND_URL,
        timestamp: new Date().toISOString(),
        hint: 'Test backend: curl ' + backendUrl + '/api/health'
      }), {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      });
    }

    // Health check endpoint - proxy to backend
    if (url.pathname === '/health' || url.pathname === '/api/health') {
      const backendUrl = env.BACKEND_URL || 'https://api.audiocity-ug.com';
      const cleanBackendUrl = backendUrl.replace(/\/$/, '');
      const proxyUrl = `${cleanBackendUrl}/api/health`;
      
      try {
        const response = await fetch(proxyUrl, {
          method: 'GET',
          signal: AbortSignal.timeout(5000), // 5 second timeout
        });
        
        if (response.ok) {
          const data = await response.text();
          return new Response(data, {
            status: 200,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
            },
          });
        } else {
          return new Response(JSON.stringify({
            status: 'error',
            service: 'audio-city-worker',
            message: 'Backend health check failed',
            backendUrl: cleanBackendUrl,
            statusCode: response.status,
            timestamp: new Date().toISOString(),
          }), {
            status: response.status,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
            },
          });
        }
      } catch (error) {
        // Fallback if backend is unavailable
        return new Response(JSON.stringify({
          status: 'error',
          service: 'audio-city-worker',
          message: 'Backend unavailable',
          backendUrl: cleanBackendUrl,
          error: error.message,
          timestamp: new Date().toISOString(),
        }), {
          status: 503,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        });
      }
    }

    // Default response
    return new Response('Audio City Worker - API Proxy', {
      headers: corsHeaders,
    });
  },
};
