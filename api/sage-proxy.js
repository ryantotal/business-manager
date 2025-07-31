import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Token cache to reduce database calls
let tokenCache = {
  accessToken: null,
  refreshToken: null,
  expiresAt: null,
  companyId: null,
  lastFetched: null
};

// Helper function to check if token is expired
function isTokenExpired(expiresAt) {
  if (!expiresAt) return true;
  // Add 30 second buffer before expiry
  return new Date().getTime() > (new Date(expiresAt).getTime() - 30000);
}

// Helper function to refresh the access token
async function refreshAccessToken(refreshToken) {
  console.log('[Sage Proxy] Attempting to refresh access token...');
  
  try {
    // Get client credentials from environment
    const clientId = process.env.SAGE_CLIENT_ID;
    const clientSecret = process.env.SAGE_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      throw new Error('Missing Sage client credentials in environment variables');
    }

    // Make refresh token request
    const response = await fetch('https://oauth.accounting.sage.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error('[Sage Proxy] Token refresh failed:', data);
      throw new Error(data.error || 'Failed to refresh token');
    }

    console.log('[Sage Proxy] Token refreshed successfully');
    
    // Calculate expiry time (5 minutes from now)
    const expiresAt = new Date(Date.now() + (data.expires_in * 1000)).toISOString();
    
    // Update database with new tokens
    const { error: updateError } = await supabase
      .from('company_settings')
      .upsert([
        {
          setting_name: 'sage_access_token',
          setting_value: data.access_token,
          updated_at: new Date().toISOString()
        },
        {
          setting_name: 'sage_refresh_token',
          setting_value: data.refresh_token,
          updated_at: new Date().toISOString()
        },
        {
          setting_name: 'sage_token_expires_at',
          setting_value: expiresAt,
          updated_at: new Date().toISOString()
        }
      ], { onConflict: 'setting_name' });

    if (updateError) {
      console.error('[Sage Proxy] Failed to update tokens in database:', updateError);
      throw updateError;
    }

    // Update cache
    tokenCache = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: expiresAt,
      lastFetched: Date.now()
    };

    return data.access_token;
  } catch (error) {
    console.error('[Sage Proxy] Error refreshing token:', error);
    throw error;
  }
}

// Main handler function
export default async function handler(req, res) {
  console.log('[Sage Proxy] Request received:', {
    method: req.method,
    endpoint: req.body?.endpoint,
    hasBody: !!req.body?.body
  });

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Business');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { endpoint, method = 'GET', body, businessId } = req.body || {};

  if (!endpoint) {
    console.error('[Sage Proxy] No endpoint provided');
    return res.status(400).json({ error: 'Endpoint is required' });
  }

  try {
    let accessToken = null;

    // Check cache first (5 minute cache)
    if (tokenCache.accessToken && 
        tokenCache.lastFetched && 
        (Date.now() - tokenCache.lastFetched) < 300000 &&
        !isTokenExpired(tokenCache.expiresAt)) {
      console.log('[Sage Proxy] Using cached token');
      accessToken = tokenCache.accessToken;
    } else {
      console.log('[Sage Proxy] Fetching tokens from database...');
      
      // Fetch all token-related data from database
      const { data: tokenData, error: tokenError } = await supabase
        .from('company_settings')
        .select('setting_name, setting_value')
        .in('setting_name', ['sage_access_token', 'sage_refresh_token', 'sage_token_expires_at']);

      if (tokenError) {
        console.error('[Sage Proxy] Database error:', tokenError);
        return res.status(500).json({ error: 'Failed to fetch tokens from database' });
      }

      if (!tokenData || tokenData.length === 0) {
        console.error('[Sage Proxy] No tokens found in database');
        return res.status(401).json({ 
          error: 'No Sage connection found. Please connect to Sage.',
          code: 'NO_TOKENS'
        });
      }

      // Extract tokens from result
      const tokens = tokenData.reduce((acc, row) => {
        acc[row.setting_name] = row.setting_value;
        return acc;
      }, {});

      console.log('[Sage Proxy] Tokens found:', {
        hasAccessToken: !!tokens.sage_access_token,
        hasRefreshToken: !!tokens.sage_refresh_token,
        hasExpiresAt: !!tokens.sage_token_expires_at,
        expiresAt: tokens.sage_token_expires_at
      });

      // Check if token is expired
      if (isTokenExpired(tokens.sage_token_expires_at)) {
        console.log('[Sage Proxy] Token is expired, refreshing...');
        
        if (!tokens.sage_refresh_token) {
          console.error('[Sage Proxy] No refresh token available');
          return res.status(401).json({ 
            error: 'Sage session expired and no refresh token available. Please reconnect to Sage.',
            code: 'NO_REFRESH_TOKEN'
          });
        }

        try {
          accessToken = await refreshAccessToken(tokens.sage_refresh_token);
        } catch (refreshError) {
          console.error('[Sage Proxy] Token refresh failed:', refreshError);
          return res.status(401).json({ 
            error: 'Failed to refresh Sage token. Please reconnect to Sage.',
            code: 'REFRESH_FAILED',
            details: refreshError.message
          });
        }
      } else {
        // Token is still valid
        accessToken = tokens.sage_access_token;
        
        // Update cache
        tokenCache = {
          accessToken: tokens.sage_access_token,
          refreshToken: tokens.sage_refresh_token,
          expiresAt: tokens.sage_token_expires_at,
          lastFetched: Date.now()
        };
      }
    }

    if (!accessToken) {
      console.error('[Sage Proxy] No access token available after all attempts');
      return res.status(401).json({ 
        error: 'No valid Sage access token available',
        code: 'NO_ACCESS_TOKEN'
      });
    }

    // Make request to Sage API
    console.log('[Sage Proxy] Making request to Sage API:', {
      url: `https://api.accounting.sage.com/v3.1/${endpoint}`,
      method: method,
      hasBusinessId: !!businessId
    });

    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };

    // Add optional X-Business header if provided
    if (businessId) {
      headers['X-Business'] = businessId;
    }

    const sageResponse = await fetch(`https://api.accounting.sage.com/v3.1/${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });

    const responseText = await sageResponse.text();
    let data;
    
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      console.error('[Sage Proxy] Failed to parse response as JSON:', responseText);
      data = { error: 'Invalid response from Sage API', response: responseText };
    }

    console.log('[Sage Proxy] Sage API response:', {
      status: sageResponse.status,
      ok: sageResponse.ok,
      hasData: !!data,
      errorMessage: data?.error || data?.message
    });
    
    // Handle 401 Unauthorized - token might be expired despite our checks
    if (sageResponse.status === 401) {
      console.log('[Sage Proxy] Received 401, attempting token refresh...');
      
      // Try to refresh token if we haven't already
      if (tokenCache.refreshToken && !req.body._retryCount) {
        try {
          const newAccessToken = await refreshAccessToken(tokenCache.refreshToken);
          
          // Retry the request with new token
          console.log('[Sage Proxy] Retrying request with new token...');
          req.body._retryCount = 1;
          return handler(req, res);
        } catch (refreshError) {
          console.error('[Sage Proxy] Token refresh failed on 401:', refreshError);
          return res.status(401).json({ 
            error: 'Sage authentication failed. Please reconnect to Sage.',
            code: 'AUTH_FAILED',
            details: data 
          });
        }
      }
      
      return res.status(401).json({ 
        error: 'Sage authentication failed. Please reconnect to Sage.',
        code: 'AUTH_FAILED',
        details: data 
      });
    }

    // Return the response with the same status code
    res.status(sageResponse.status).json(data);
    
  } catch (error) {
    console.error('[Sage Proxy] Unexpected error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
