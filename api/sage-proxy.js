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
    
    // Calculate expiry time
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

  const { endpoint, method = 'GET', body, businessId, action } = req.body || {};

  // ── createContact action ──────────────────────────────────────────────────
  if (action === 'createContact') {
    const { contactType, name, email, address, city, postcode, vatNumber, creditLimit, creditDays, mainContact } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Contact name is required' });
    }

    try {
      // ── Step 0: Get valid access token ───────────────────────────────────
      let accessToken = null;

      if (
        tokenCache.accessToken &&
        tokenCache.lastFetched &&
        (Date.now() - tokenCache.lastFetched) < 300000 &&
        !isTokenExpired(tokenCache.expiresAt)
      ) {
        accessToken = tokenCache.accessToken;
      } else {
        const { data: tokenData, error: tokenError } = await supabase
          .from('company_settings')
          .select('setting_name, setting_value')
          .in('setting_name', ['sage_access_token', 'sage_refresh_token', 'sage_token_expires_at']);

        if (tokenError || !tokenData || tokenData.length === 0) {
          return res.status(401).json({ error: 'No Sage connection found. Please connect to Sage.', code: 'NO_TOKENS' });
        }

        const tokens = tokenData.reduce((acc, row) => { acc[row.setting_name] = row.setting_value; return acc; }, {});

        if (isTokenExpired(tokens.sage_token_expires_at)) {
          if (!tokens.sage_refresh_token) {
            return res.status(401).json({ error: 'Sage session expired. Please reconnect.', code: 'NO_REFRESH_TOKEN' });
          }
          accessToken = await refreshAccessToken(tokens.sage_refresh_token);
        } else {
          accessToken = tokens.sage_access_token;
          tokenCache = {
            accessToken: tokens.sage_access_token,
            refreshToken: tokens.sage_refresh_token,
            expiresAt: tokens.sage_token_expires_at,
            lastFetched: Date.now()
          };
        }
      }

      // Fetch business ID
      const { data: bizData } = await supabase
        .from('company_settings')
        .select('setting_value')
        .eq('setting_name', 'sage_business_id')
        .single();

      const sageHeaders = {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...(bizData?.setting_value && { 'X-Business': bizData.setting_value })
      };

      const sageRequest = async (endpoint, payload, method = 'POST') => {
        const r = await fetch(`https://api.accounting.sage.com/v3.1/${endpoint}`, {
          method,
          headers: sageHeaders,
          body: JSON.stringify(payload)
        });
        const data = await r.json();
        if (!r.ok) {
          console.error(`[Sage Proxy] ${method} ${endpoint} failed:`, JSON.stringify(data));
          throw { status: r.status, data };
        }
        console.log(`[Sage Proxy] ${method} ${endpoint} response:`, JSON.stringify(data).substring(0, 500));
        return data;
      };

      // ── Step 1: Create the contact ───────────────────────────────────────
      const hasAddress = !!(address || postcode || city);
      console.log('[Sage Proxy] Step 1 — creating contact:', { name, contactType, hasAddress });
      const contactObj = {
        name,
        contact_type_ids: [contactType === 'SUPPLIER' ? 'SUPPLIER' : 'CUSTOMER'],
      };
      if (email)                                        contactObj.email        = email;
      if (creditLimit && parseFloat(creditLimit) > 0)  contactObj.credit_limit = parseFloat(creditLimit);
      if (creditDays  && parseInt(creditDays)   > 0)   contactObj.credit_days  = parseInt(creditDays);

      const contactData = await sageRequest('contacts', { contact: contactObj });
      // Sage returns the contact object directly with id at top level
      const sage_id = contactData?.id;
      if (!sage_id) throw { status: 500, data: { message: 'Sage did not return a contact ID', response: contactData } };
      console.log('[Sage Proxy] Step 1 complete — sage_id:', sage_id);

      // ── Step 2: Create the address linked to the contact ─────────────────
      if (hasAddress) {
        console.log('[Sage Proxy] Step 2 — creating address for contact:', sage_id);
        const addressObj = {
          address: {
            contact_id: sage_id,
            name: 'Main Address',
            address_type_id: 'ACCOUNTS',
            is_main_address: true,
            country_id: 'GB',
          }
        };
        if (address)  addressObj.address.address_line_1 = address;
        if (city)     addressObj.address.city           = city;
        if (postcode) addressObj.address.postal_code    = postcode;

        try {
          const addrData = await sageRequest('addresses', addressObj);
          console.log('[Sage Proxy] Step 2 complete — address created, id:', addrData?.id);
        } catch (addrErr) {
          // Log but don't fail — contact was created
          console.warn('[Sage Proxy] Step 2 — address creation failed:', addrErr?.data);
        }
      }

      // ── Step 3: Create a main contact person ─────────────────────────────
      console.log('[Sage Proxy] Step 3 — creating contact person');
      const contactPersonObj = {
        contact_person: {
          contact_id: sage_id,
          name: mainContact?.name || name,
          is_main_contact: true,
          is_preferred_contact: true,
          contact_person_types: [{ id: 'ACCOUNTS' }],
        }
      };
      if (mainContact?.email || email)    contactPersonObj.contact_person.email     = mainContact?.email || email;
      if (mainContact?.telephone)         contactPersonObj.contact_person.telephone = mainContact.telephone;
      if (mainContact?.mobile)            contactPersonObj.contact_person.mobile    = mainContact.mobile;
      try {
        const cpData = await sageRequest('contact_persons', contactPersonObj);
        // Sage returns the contact_person object directly with id at top level
        const contact_person_id = cpData?.id;
        console.log('[Sage Proxy] Step 3 complete — contact person created, id:', contact_person_id);

        // ── Step 4: Set preferred_contact_person on the contact ──────────────
        if (contact_person_id) {
          try {
            await sageRequest(`contacts/${sage_id}`, {
              contact: {
                main_contact_person_id: contact_person_id,
                preferred_contact_person_id: contact_person_id
              }
            }, 'PUT');
            console.log('[Sage Proxy] Step 4 complete — preferred_contact set');
          } catch (pcErr) {
            console.warn('[Sage Proxy] Step 4 — preferred_contact set failed:', pcErr?.data);
            // Try alternative format — nested object
            try {
              await sageRequest(`contacts/${sage_id}`, {
                contact: {
                  main_contact_person: { id: contact_person_id },
                  preferred_contact_person: { id: contact_person_id }
                }
              }, 'PUT');
              console.log('[Sage Proxy] Step 4 complete (alt format) — preferred_contact set');
            } catch (pcErr2) {
              console.warn('[Sage Proxy] Step 4 — preferred_contact alt format also failed:', pcErr2?.data);
            }
          }
        }
      } catch (cpErr) {
        // Non-fatal — contact and address already created successfully
        console.warn('[Sage Proxy] Step 3 — contact person creation failed:', cpErr?.data);
      }

      return res.status(200).json({ sage_id, contactData });

    } catch (err) {
      console.error('[Sage Proxy] createContact error:', err);
      if (err.data) {
        return res.status(err.status || 500).json({
          error: 'Sage rejected the contact creation',
          details: err.data
        });
      }
      return res.status(500).json({ error: err.message || 'Unknown error' });
    }
  }
  // ── end createContact ─────────────────────────────────────────────────────

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
        accessToken = tokens.sage_access_token;
        
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
      
      if (tokenCache.refreshToken && !req.body._retryCount) {
        try {
          const newAccessToken = await refreshAccessToken(tokenCache.refreshToken);
          
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
