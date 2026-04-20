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
        const fetchOpts = {
          method,
          headers: sageHeaders,
        };
        if (payload && method !== 'GET') {
          fetchOpts.body = JSON.stringify(payload);
        }
        const r = await fetch(`https://api.accounting.sage.com/v3.1/${endpoint}`, fetchOpts);
        const data = await r.json();
        if (!r.ok) {
          console.error(`[Sage Proxy] ${method} ${endpoint} failed:`, JSON.stringify(data));
          throw { status: r.status, data };
        }
        console.log(`[Sage Proxy] ${method} ${endpoint} response:`, JSON.stringify(data).substring(0, 500));
        return data;
      };

      // ── Step 1: Create the contact ───────────────────────────────────────
      const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
      const hasAddress = !!(address || postcode || city);
      console.log('[Sage Proxy] Step 1 — creating contact:', { name, contactType, hasAddress });
      const contactObj = {
        name,
        contact_type_ids: [contactType === 'SUPPLIER' ? 'SUPPLIER' : 'CUSTOMER'],
      };
      if (email && isValidEmail(email))                     contactObj.email        = email;
      if (creditLimit && parseFloat(creditLimit) > 0)       contactObj.credit_limit = parseFloat(creditLimit);
      if (creditDays  && parseInt(creditDays)   > 0)        contactObj.credit_days  = parseInt(creditDays);

      const contactData = await sageRequest('contacts', { contact: contactObj });
      // Sage returns the contact object directly with id at top level
      const sage_id = contactData?.id;
      if (!sage_id) throw { status: 500, data: { message: 'Sage did not return a contact ID', response: contactData } };
      console.log('[Sage Proxy] Step 1 complete — sage_id:', sage_id);

      // ── Step 2: Create the address linked to the contact ─────────────────
      let address_id = null;
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
          address_id = addrData?.id;
          console.log('[Sage Proxy] Step 2 complete — address created, id:', address_id);
        } catch (addrErr) {
          console.warn('[Sage Proxy] Step 2 — address creation failed:', addrErr?.data);
        }
      }

      // If we didn't create an address, try to fetch the default one Sage auto-created
      if (!address_id) {
        try {
          const addrList = await sageRequest(`addresses?contact_id=${sage_id}`, null, 'GET');
          const items = addrList?.$items || addrList?.items || addrList;
          if (Array.isArray(items) && items.length > 0) {
            address_id = items[0].id;
            console.log('[Sage Proxy] Found existing address for contact:', address_id);
          }
        } catch (e) {
          console.warn('[Sage Proxy] Could not fetch addresses for contact:', e?.data || e?.message);
        }
      }

      // ── Step 3: Create a main contact person ─────────────────────────────
      console.log('[Sage Proxy] Step 3 — creating contact person, address_id:', address_id);
      const contactPersonObj = {
        contact_person: {
          contact_id: sage_id,
          name: mainContact?.name || name,
          is_main_contact: true,
          is_preferred_contact: true,
          contact_person_type_ids: ['ACCOUNTS'],
        }
      };
      if (address_id) contactPersonObj.contact_person.address_id = address_id;
      const cpEmail = mainContact?.email || email;
      if (cpEmail && isValidEmail(cpEmail))   contactPersonObj.contact_person.email     = cpEmail;
      if (mainContact?.telephone)             contactPersonObj.contact_person.telephone = mainContact.telephone;
      if (mainContact?.mobile)                contactPersonObj.contact_person.mobile    = mainContact.mobile;
      try {
        const cpData = await sageRequest('contact_persons', contactPersonObj);
        // Sage returns the contact_person object directly with id at top level
        const contact_person_id = cpData?.id;
        console.log('[Sage Proxy] Step 3 complete — contact person created, id:', contact_person_id);

        // ── Step 4: Set preferred_contact_person on the contact ──────────────
        // Sage's Options tab crashes if preferred_contact_person is null.
        // Try multiple approaches to ensure it gets set.
        if (contact_person_id) {
          const cpDisplayName = mainContact?.name || name;
          
          // Approach A: PUT with nested object including displayed_as (matches working Sage structure)
          try {
            await sageRequest(`contacts/${sage_id}`, {
              contact: {
                main_contact_person: { id: contact_person_id, displayed_as: cpDisplayName },
                preferred_contact_person: { id: contact_person_id, displayed_as: cpDisplayName }
              }
            }, 'PUT');
            console.log('[Sage Proxy] Step 4 complete (approach A) — preferred_contact set');
          } catch (pcErrA) {
            console.warn('[Sage Proxy] Step 4 approach A failed:', pcErrA?.data);
            
            // Approach B: PUT with flat _id fields
            try {
              await sageRequest(`contacts/${sage_id}`, {
                contact: {
                  main_contact_person_id: contact_person_id,
                  preferred_contact_person_id: contact_person_id
                }
              }, 'PUT');
              console.log('[Sage Proxy] Step 4 complete (approach B) — preferred_contact set');
            } catch (pcErrB) {
              console.warn('[Sage Proxy] Step 4 approach B failed:', pcErrB?.data);
              
              // Approach C: PATCH instead of PUT
              try {
                await sageRequest(`contacts/${sage_id}`, {
                  contact: {
                    main_contact_person: { id: contact_person_id },
                    preferred_contact_person: { id: contact_person_id }
                  }
                }, 'PATCH');
                console.log('[Sage Proxy] Step 4 complete (approach C/PATCH) — preferred_contact set');
              } catch (pcErrC) {
                console.warn('[Sage Proxy] Step 4 all approaches failed. Last error:', pcErrC?.data);
              }
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

  // ── manageContactPerson action ────────────────────────────────────────────
  // CRUD for individual contact persons on an existing Sage contact.
  // Called from the Named Contacts tab in the portal.
  if (action === 'manageContactPerson') {
    const { sageContactId, sageContactPersonId, operation, contactPerson } = req.body;
    // operation: 'create' | 'update' | 'delete' | 'list'

    if (!sageContactId && operation !== 'delete') {
      return res.status(400).json({ error: 'sageContactId is required (customer must be linked to Sage first)' });
    }

    try {
      // ── Get valid access token (reuse same pattern) ──────────────────────
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
          return res.status(401).json({ error: 'No Sage connection found.', code: 'NO_TOKENS' });
        }
        const tokens = tokenData.reduce((acc, row) => { acc[row.setting_name] = row.setting_value; return acc; }, {});
        if (isTokenExpired(tokens.sage_token_expires_at)) {
          if (!tokens.sage_refresh_token) return res.status(401).json({ error: 'Sage session expired.', code: 'NO_REFRESH_TOKEN' });
          accessToken = await refreshAccessToken(tokens.sage_refresh_token);
        } else {
          accessToken = tokens.sage_access_token;
          tokenCache = { accessToken: tokens.sage_access_token, refreshToken: tokens.sage_refresh_token, expiresAt: tokens.sage_token_expires_at, lastFetched: Date.now() };
        }
      }

      const { data: bizData } = await supabase.from('company_settings').select('setting_value').eq('setting_name', 'sage_business_id').single();
      const sageHeaders = {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...(bizData?.setting_value && { 'X-Business': bizData.setting_value })
      };

      const sageFetch = async (endpoint, method = 'GET', payload = null) => {
        const opts = { method, headers: sageHeaders };
        if (payload && method !== 'GET') opts.body = JSON.stringify(payload);
        const r = await fetch(`https://api.accounting.sage.com/v3.1/${endpoint}`, opts);
        if (method === 'DELETE' && r.status === 204) return { deleted: true };
        const data = await r.json();
        if (!r.ok) { console.error(`[Sage Proxy] ${method} ${endpoint} failed:`, JSON.stringify(data)); throw { status: r.status, data }; }
        return data;
      };

      const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

      // ── LIST ─────────────────────────────────────────────────────────────
      if (operation === 'list') {
        console.log('[Sage Proxy] Listing contact persons for:', sageContactId);
        const result = await sageFetch(`contact_persons?contact_id=${sageContactId}`);
        const items = result?.$items || result?.items || (Array.isArray(result) ? result : []);
        
        // Deduplicate by id — Sage can return the same person under multiple addresses
        const seen = new Set();
        const uniqueItems = [];
        for (const item of items) {
          if (!item?.id || seen.has(item.id)) continue;
          seen.add(item.id);
          // Fetch full details for each contact person (list endpoint only returns summary)
          try {
            const full = await sageFetch(`contact_persons/${item.id}`, 'GET');
            uniqueItems.push({
              id: full.id || item.id,
              name: full.name || full.displayed_as || item.name || item.displayed_as || 'Unknown',
              email: full.email || '',
              telephone: full.telephone || '',
              mobile: full.mobile || '',
              is_main_contact: full.is_main_contact || false,
              is_preferred_contact: full.is_preferred_contact || false,
              displayed_as: full.displayed_as || item.displayed_as || '',
            });
          } catch (e) {
            // Fallback to summary data
            uniqueItems.push({
              id: item.id,
              name: item.name || item.displayed_as || 'Unknown',
              email: item.email || '',
              telephone: item.telephone || '',
              mobile: item.mobile || '',
              is_main_contact: item.is_main_contact || false,
              displayed_as: item.displayed_as || '',
            });
          }
        }
        console.log('[Sage Proxy] Returning', uniqueItems.length, 'unique contact persons');
        return res.status(200).json({ contact_persons: uniqueItems });
      }

      // ── CREATE ───────────────────────────────────────────────────────────
      if (operation === 'create') {
        console.log('[Sage Proxy] Creating contact person on:', sageContactId);

        // Get an address_id — Sage requires it
        let address_id = null;
        try {
          const addrList = await sageFetch(`addresses?contact_id=${sageContactId}`);
          const items = addrList?.$items || addrList?.items || (Array.isArray(addrList) ? addrList : []);
          if (items.length > 0) address_id = items[0].id;
        } catch (e) {
          console.warn('[Sage Proxy] Could not fetch addresses:', e?.data || e?.message);
        }

        const cpObj = {
          contact_person: {
            contact_id: sageContactId,
            name: contactPerson.name,
            contact_person_type_ids: ['ACCOUNTS'],
            is_main_contact: false,
            is_preferred_contact: false,
          }
        };
        if (address_id) cpObj.contact_person.address_id = address_id;
        if (contactPerson.email && isValidEmail(contactPerson.email)) cpObj.contact_person.email = contactPerson.email;
        if (contactPerson.telephone) cpObj.contact_person.telephone = contactPerson.telephone;
        if (contactPerson.mobile) cpObj.contact_person.mobile = contactPerson.mobile;

        const created = await sageFetch('contact_persons', 'POST', cpObj);
        console.log('[Sage Proxy] Contact person created:', created?.id);
        return res.status(200).json({ sage_contact_person_id: created?.id, data: created });
      }

      // ── UPDATE ───────────────────────────────────────────────────────────
      if (operation === 'update' && sageContactPersonId) {
        console.log('[Sage Proxy] Updating contact person:', sageContactPersonId);
        const cpObj = { contact_person: {} };
        if (contactPerson.name) cpObj.contact_person.name = contactPerson.name;
        if (contactPerson.email && isValidEmail(contactPerson.email)) cpObj.contact_person.email = contactPerson.email;
        else if (contactPerson.email === '') cpObj.contact_person.email = '';
        if (contactPerson.telephone !== undefined) cpObj.contact_person.telephone = contactPerson.telephone;
        if (contactPerson.mobile !== undefined) cpObj.contact_person.mobile = contactPerson.mobile;

        const updated = await sageFetch(`contact_persons/${sageContactPersonId}`, 'PUT', cpObj);
        return res.status(200).json({ data: updated });
      }

      // ── DELETE ───────────────────────────────────────────────────────────
      if (operation === 'delete' && sageContactPersonId) {
        console.log('[Sage Proxy] Deleting contact person:', sageContactPersonId);
        await sageFetch(`contact_persons/${sageContactPersonId}`, 'DELETE');
        return res.status(200).json({ deleted: true });
      }

      return res.status(400).json({ error: 'Invalid operation. Use: list, create, update, delete' });

    } catch (err) {
      console.error('[Sage Proxy] manageContactPerson error:', err);
      if (err.data) return res.status(err.status || 500).json({ error: 'Sage error', details: err.data });
      return res.status(500).json({ error: err.message || 'Unknown error' });
    }
  }
  // ── end manageContactPerson ───────────────────────────────────────────────

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
