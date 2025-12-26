/**
 * Cloudflare Worker for Audio City
 * 
 * NOTE: This worker CANNOT run the full backend API because:
 * - Workers cannot install FFmpeg
 * - Workers cannot execute shell commands
 * - Workers have limited file system access
 * 
 * This worker can be used for:
 * - API proxy/routing
 * - Static file serving
 * - CORS handling
 * - Request forwarding to VPS backend
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

    // Proxy API requests to VPS backend
    if (url.pathname.startsWith('/api/')) {
      // Use VM backend URL (hardcoded since env vars may not be set)
      // NOTE: Cloudflare Workers can only connect to HTTPS endpoints
      // If backend is HTTP-only, use a tunnel (Cloudflare Tunnel, ngrok, etc.)
      const backendUrl = env.BACKEND_URL || 'http://168.119.241.59:3002';
      const proxyUrl = `${backendUrl}${url.pathname}${url.search}`;
      
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

        const data = await response.text();
        
        return new Response(data, {
          status: response.status,
          headers: {
            ...corsHeaders,
            'Content-Type': response.headers.get('Content-Type') || 'application/json',
          },
        });
      } catch (error) {
        return new Response(JSON.stringify({ 
          error: 'Backend unavailable',
          message: error.message 
        }), {
          status: 503,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        });
      }
    }

    // Health check endpoint - proxy to backend
    if (url.pathname === '/health' || url.pathname === '/api/health') {
      const backendUrl = env.BACKEND_URL || 'http://168.119.241.59:3002';
      const proxyUrl = `${backendUrl}/api/health`;
      
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
        }
      } catch (error) {
        // Fallback if backend is unavailable
      }
      
      // Fallback response if backend is down
      return new Response(JSON.stringify({
        status: 'error',
        service: 'audio-city-worker',
        message: 'Backend unavailable',
        timestamp: new Date().toISOString(),
      }), {
        status: 503,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      });
    }

    // Default response
    return new Response('Audio City Worker - API Proxy', {
      headers: corsHeaders,
    });
  },
};


