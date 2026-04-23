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
// ── FIX: Helper to normalise VAT number for Sage ──────────────────────────
// Sage expects the numeric-only portion for UK VAT numbers.
// Users may enter "GB117223643" or just "117223643".
// Sage stores UK VAT numbers WITH the "GB" prefix (e.g. "GB 973631108").
// We normalise to digits-only for the modulus check, but send with prefix to Sage.
function normaliseTaxNumber(vatNumber) {
  if (!vatNumber) return '';
  let v = vatNumber.trim().toUpperCase();
  // Strip prefix for digit extraction
  let digits = v.startsWith('GB') ? v.slice(2) : v;
  digits = digits.replace(/[\s\-]/g, '');
  // Return 9-digit number only (no prefix) — Sage API may or may not want prefix
  return digits;
}

// Return the VAT number formatted for Sage API (with GB prefix)
function formatVatForSage(vatNumber) {
  if (!vatNumber) return '';
  const digits = normaliseTaxNumber(vatNumber);
  if (!digits) return '';
  return 'GB' + digits;
}

// ── UK VAT number validation ──────────────────────────────────────────────
// HMRC VAT numbers are 9 digits and must pass a modulus check.
// Sage rejects numbers that fail this check with "The tax number does not
// match the main address" — a misleading error that actually means the
// number itself is invalid for the UK tax scheme.
function isValidUkVatNumber(digits) {
  if (!digits || !/^\d{9}$/.test(digits)) return false;
  const d = digits.split('').map(Number);
  // Standard modulus 97 check (numbers 0–9 in first two digits)
  const sum97 = d[0]*8 + d[1]*7 + d[2]*6 + d[3]*5 + d[4]*4 + d[5]*3 + d[6]*2;
  const check97 = d[7]*10 + d[8];
  const remainder97 = sum97 % 97;
  if (remainder97 === 0 && check97 === 0) return true;
  if ((97 - remainder97) === check97) return true;
  // Modulus 9755 check (for numbers reissued after 2010, first two digits >= 10)
  const sum9755 = sum97 + 55;
  const remainder9755 = sum9755 % 97;
  if (remainder9755 === 0 && check97 === 0) return true;
  if ((97 - remainder9755) === check97) return true;
  return false;
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

// ── Cache for GB country_group_id lookup ───────────────────────────────────
let gbCountryGroupCache = null;

// Helper: discover the correct country_group_id for GB from Sage's API
// Sage uses different values across accounts — common ones are 'GBIE', 'UK',
// or a UUID.  We look up the /country_groups endpoint once and cache it.
async function getGBCountryGroupId(sageRequest) {
  if (gbCountryGroupCache) return gbCountryGroupCache;
  try {
    const groups = await sageRequest('country_groups?items_per_page=200', null, 'GET');
    const items = groups?.$items || groups?.items || (Array.isArray(groups) ? groups : []);
    console.log('[Sage Proxy] country_groups returned', items.length, 'items');
    // Find a group whose countries include GB
    for (const g of items) {
      const countries = g.countries || g.$items || [];
      const hasGB = countries.some(c =>
        (c.id === 'GB' || c.code === 'GB' || c.displayed_as === 'United Kingdom (GB)')
      );
      if (hasGB) {
        console.log('[Sage Proxy] Found GB country_group:', g.id, g.displayed_as);
        gbCountryGroupCache = g.id;
        return g.id;
      }
    }
    // If the list doesn't embed countries, try matching by name
    for (const g of items) {
      const name = (g.displayed_as || g.name || '').toLowerCase();
      if (name.includes('united kingdom') || name.includes('uk') || name === 'gb' || name === 'gbie') {
        console.log('[Sage Proxy] Found GB country_group by name:', g.id, g.displayed_as);
        gbCountryGroupCache = g.id;
        return g.id;
      }
    }
    // Last resort — log them all so the developer can spot the right one
    console.warn('[Sage Proxy] Could not auto-detect GB country_group.  Available groups:',
      items.map(g => `${g.id} (${g.displayed_as})`).join(', '));
    return null;
  } catch (e) {
    console.warn('[Sage Proxy] country_groups lookup failed:', e?.data || e?.message);
    return null;
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

  // ── diagnoseSageVat action ──────────────────────────────────────────────
  // Diagnostic: inspect a working contact in Sage to see what makes VAT work.
  // Call with: { action: 'diagnoseSageVat', sageContactId: '...' }
  // Or without sageContactId to just dump country_groups.
  if (action === 'diagnoseSageVat') {
    const { sageContactId } = req.body;
    try {
      // Get token (reuse pattern)
      let accessToken = null;
      const { data: tokenData } = await supabase
        .from('company_settings')
        .select('setting_name, setting_value')
        .in('setting_name', ['sage_access_token', 'sage_refresh_token', 'sage_token_expires_at']);
      if (!tokenData || tokenData.length === 0) {
        return res.status(401).json({ error: 'No Sage tokens' });
      }
      const tokens = tokenData.reduce((acc, row) => { acc[row.setting_name] = row.setting_value; return acc; }, {});
      if (isTokenExpired(tokens.sage_token_expires_at)) {
        accessToken = await refreshAccessToken(tokens.sage_refresh_token);
      } else {
        accessToken = tokens.sage_access_token;
      }
      const { data: bizData } = await supabase.from('company_settings').select('setting_value').eq('setting_name', 'sage_business_id').single();
      const sageHeaders = {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...(bizData?.setting_value && { 'X-Business': bizData.setting_value })
      };
      const sageFetch = async (ep) => {
        const r = await fetch(`https://api.accounting.sage.com/v3.1/${ep}`, { headers: sageHeaders });
        return r.json();
      };

      const result = {};

      // Dump country_groups
      const groups = await sageFetch('country_groups?items_per_page=200');
      result.country_groups = (groups?.$items || []).map(g => ({
        id: g.id, name: g.displayed_as, countries: (g.countries || []).map(c => c.id || c.displayed_as)
      }));

      // If a contact ID is provided, inspect it
      if (sageContactId) {
        result.contact = await sageFetch(`contacts/${sageContactId}`);
        const addrs = await sageFetch(`addresses?contact_id=${sageContactId}`);
        result.addresses = (addrs?.$items || []).map(a => ({
          id: a.id,
          name: a.name || a.displayed_as,
          type: a.address_type?.id || a.address_type_id,
          is_main: a.is_main_address,
          country: a.country,
          country_group: a.country_group,
          address_line_1: a.address_line_1,
          postal_code: a.postal_code,
        }));
        result.tax_number = result.contact?.tax_number;
        result.main_address = result.contact?.main_address;
      }

      return res.status(200).json(result);
    } catch (err) {
      return res.status(500).json({ error: err.message, data: err.data });
    }
  }

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
      // ── Step 1: Create the contact (WITHOUT tax_number) ────────────────
      const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
      const hasAddress = !!(address || postcode || city);
      const cleanVat = normaliseTaxNumber(vatNumber);
      const isCustomer = contactType !== 'SUPPLIER';
      console.log('[Sage Proxy] Step 1 — creating contact:', { name, contactType, hasAddress, cleanVat });
      
      const contactTypeId = contactType === 'SUPPLIER' ? 'VENDOR' : 'CUSTOMER';
      console.log('[Sage Proxy] Using contact type:', contactTypeId);
      const contactObj = {
        name,
        contact_type_ids: [contactTypeId],
      };
      if (email && isValidEmail(email))                     contactObj.email        = email;
      if (creditLimit && parseFloat(creditLimit) > 0)       contactObj.credit_limit = parseFloat(creditLimit);
      if (creditDays  && parseInt(creditDays)   > 0)        contactObj.credit_days  = parseInt(creditDays);
      
      console.log('[Sage Proxy] Step 1 — contact payload:', JSON.stringify({ contact: contactObj }));
      const contactData = await sageRequest('contacts', { contact: contactObj });
      const sage_id = contactData?.id;
      if (!sage_id) throw { status: 500, data: { message: 'Sage did not return a contact ID', response: contactData } };
      console.log('[Sage Proxy] Step 1 complete — sage_id:', sage_id);

      // ── Step 1b: Discover GB country_group_id for address & VAT ────────
      // We do this early so it's ready for Step 2.  The result is cached
      // so subsequent calls don't hit the API again.
      let gbGroupId = null;
      if (hasAddress || cleanVat) {
        gbGroupId = await getGBCountryGroupId(sageRequest);
        console.log('[Sage Proxy] Step 1b — GB country_group_id:', gbGroupId);
      }

      // ── Step 2: Create or update the address linked to the contact ────────
      // IMPORTANT: Sage auto-creates a blank "Delivery" address when a contact
      // is first created (Step 1).  If we blindly POST a second address we end
      // up with TWO addresses — the blank Delivery one (potentially missing
      // country_group) and our Accounts one.  Sage may validate tax_number
      // against the blank one and reject it.
      //
      // Strategy: fetch any auto-created addresses first.  If one exists,
      // UPDATE it with our data.  Only create a new one if none exist.
      let address_id = null;
      let allAddressIds = []; // track every address on this contact

      if (hasAddress) {
        console.log('[Sage Proxy] Step 2 — setting up address for contact:', sage_id);

        // 2a. Check for auto-created addresses
        let existingAddresses = [];
        try {
          const addrList = await sageRequest(`addresses?contact_id=${sage_id}`, null, 'GET');
          const items = addrList?.$items || addrList?.items || (Array.isArray(addrList) ? addrList : []);
          existingAddresses = items;
          allAddressIds = items.map(a => a.id).filter(Boolean);
          console.log('[Sage Proxy] Step 2a — found', existingAddresses.length, 'existing addresses:', allAddressIds);
        } catch (e) {
          console.log('[Sage Proxy] Step 2a — no existing addresses found');
        }

        const addressFields = {
          name: isCustomer ? 'Main Address' : 'Invoice Address',
          // FIX: Suppliers need PURCHASING, customers need SALES.
          // The Sage UI creates these types by default for each contact type.
          // Using ACCOUNTS for either type causes VAT validation to fail.
          address_type_id: isCustomer ? 'SALES' : 'PURCHASING',
          is_main_address: true,
          country_id: 'GB',
        };
        if (gbGroupId) addressFields.country_group_id = gbGroupId;
        if (address)   addressFields.address_line_1   = address;
        if (city)      addressFields.city              = city;
        if (postcode)  addressFields.postal_code       = postcode;

        if (existingAddresses.length > 0) {
          // 2b. Update the first existing address (the auto-created Delivery one)
          const existing = existingAddresses[0];
          address_id = existing.id;
          console.log('[Sage Proxy] Step 2b — updating existing address:', address_id);
          try {
            const addrData = await sageRequest(`addresses/${address_id}`, { address: addressFields }, 'PUT');
            console.log('[Sage Proxy] Step 2b complete — address updated:', JSON.stringify({
              id: addrData?.id,
              country: addrData?.country,
              country_group: addrData?.country_group,
              is_main_address: addrData?.is_main_address
            }));
          } catch (updateErr) {
            console.warn('[Sage Proxy] Step 2b — update failed:', JSON.stringify(updateErr?.data));
            // Retry without country_group_id
            try {
              delete addressFields.country_group_id;
              await sageRequest(`addresses/${address_id}`, { address: addressFields }, 'PUT');
              console.log('[Sage Proxy] Step 2b — update succeeded without country_group');
            } catch (updateErr2) {
              console.warn('[Sage Proxy] Step 2b — retry also failed:', JSON.stringify(updateErr2?.data));
            }
          }
        } else {
          // 2c. No existing addresses — create one
          console.log('[Sage Proxy] Step 2c — creating new address');
          const addressObj = { address: { ...addressFields, contact_id: sage_id } };
          try {
            const addrData = await sageRequest('addresses', addressObj);
            address_id = addrData?.id;
            if (address_id) allAddressIds.push(address_id);
            console.log('[Sage Proxy] Step 2c complete — address created:', JSON.stringify({
              id: addrData?.id,
              country: addrData?.country,
              country_group: addrData?.country_group,
              is_main_address: addrData?.is_main_address
            }));
          } catch (addrErr) {
            console.warn('[Sage Proxy] Step 2c — address creation failed:', JSON.stringify(addrErr?.data));
            try {
              delete addressObj.address.country_group_id;
              const addrData2 = await sageRequest('addresses', addressObj);
              address_id = addrData2?.id;
              if (address_id) allAddressIds.push(address_id);
              console.log('[Sage Proxy] Step 2c — created without country_group');
            } catch (addrErr2) {
              console.warn('[Sage Proxy] Step 2c — retry also failed:', JSON.stringify(addrErr2?.data));
            }
          }
        }

        // 2d. If there are OTHER addresses (e.g. a second auto-created one),
        // patch them all with correct country_group too — Sage may validate
        // tax_number against ANY address on the contact.
        if (gbGroupId && allAddressIds.length > 1) {
          for (const aid of allAddressIds) {
            if (aid === address_id) continue; // already patched above
            try {
              await sageRequest(`addresses/${aid}`, {
                address: { country_id: 'GB', country_group_id: gbGroupId }
              }, 'PUT');
              console.log('[Sage Proxy] Step 2d — patched extra address:', aid);
            } catch (e) {
              console.warn('[Sage Proxy] Step 2d — could not patch address', aid, ':', e?.data?.message || e?.message);
            }
          }
        }
      }
      // If we still don't have an address_id, try to fetch one
      if (!address_id) {
        try {
          const addrList = await sageRequest(`addresses?contact_id=${sage_id}`, null, 'GET');
          const items = addrList?.$items || addrList?.items || addrList;
          if (Array.isArray(items) && items.length > 0) {
            address_id = items[0].id;
            allAddressIds = items.map(a => a.id).filter(Boolean);
            console.log('[Sage Proxy] Found existing address for contact:', address_id);
          }
        } catch (e) {
          console.warn('[Sage Proxy] Could not fetch addresses for contact:', e?.data || e?.message);
        }
      }
      // ── Step 3: Create a main contact person ─────────────────────────────
      console.log('[Sage Proxy] Step 3 — creating contact person, address_id:', address_id);
      console.log('[Sage Proxy] Step 3 — mainContact data:', JSON.stringify(mainContact));
      console.log('[Sage Proxy] Step 3 — email from request:', email);
      const contactPersonObj = {
        contact_person: {
          contact_id: sage_id,
          name: mainContact?.name || name,
          is_main_contact: true,
          ...(isCustomer && { is_preferred_contact: true }),
          contact_person_type_ids: ['ACCOUNTS'],
        }
      };
      if (address_id) contactPersonObj.contact_person.address_id = address_id;
      const cpEmail = mainContact?.email || email;
      if (cpEmail && isValidEmail(cpEmail))   contactPersonObj.contact_person.email     = cpEmail;
      if (mainContact?.telephone)             contactPersonObj.contact_person.telephone = mainContact.telephone;
      if (mainContact?.mobile)                contactPersonObj.contact_person.mobile    = mainContact.mobile;
      console.log('[Sage Proxy] Step 3 — contact person payload:', JSON.stringify(contactPersonObj));
      try {
        const cpData = await sageRequest('contact_persons', contactPersonObj);
        const contact_person_id = cpData?.id;
        console.log('[Sage Proxy] Step 3 complete — contact person created, id:', contact_person_id);
        // ── Step 4: Set main/preferred contact_person on the contact ────────
        if (contact_person_id) {
          const cpDisplayName = mainContact?.name || name;
          const contactUpdate = {
            main_contact_person: { id: contact_person_id, displayed_as: cpDisplayName },
          };
          if (isCustomer) {
            contactUpdate.preferred_contact_person = { id: contact_person_id, displayed_as: cpDisplayName };
          }
          
          try {
            await sageRequest(`contacts/${sage_id}`, { contact: contactUpdate }, 'PUT');
            console.log('[Sage Proxy] Step 4 complete — main_contact_person set');
          } catch (pcErr) {
            console.warn('[Sage Proxy] Step 4 failed:', pcErr?.data);
            try {
              const fallback = { main_contact_person_id: contact_person_id };
              if (isCustomer) fallback.preferred_contact_person_id = contact_person_id;
              await sageRequest(`contacts/${sage_id}`, { contact: fallback }, 'PUT');
              console.log('[Sage Proxy] Step 4 complete (fallback) — main_contact_person set');
            } catch (pcErr2) {
              console.warn('[Sage Proxy] Step 4 fallback also failed:', pcErr2?.data);
            }
          }
        }
      } catch (cpErr) {
        console.warn('[Sage Proxy] Step 3 — contact person creation failed:', cpErr?.data);
      }

      // ── Step 5: Now apply tax_number via PUT ─────────────────────────────
      // From comparing working vs broken contacts in Sage:
      //   Working: address_type = "Purchasing", VAT shown as "GB 973631108"
      //   Broken:  address_type = "Accounts", VAT not set
      //
      // Two fixes applied:
      //   1. Step 2 now uses PURCHASING for suppliers (done above)
      //   2. Try tax_number both with and without "GB" prefix
      //
      // Sage's error "does not match the main address" can mean:
      //   a) The VAT format doesn't match the country's tax scheme
      //   b) The address type doesn't support VAT for that contact type
      //   c) The VAT number itself is invalid
      const vatWithPrefix = formatVatForSage(vatNumber);  // "GB291386772"
      const vatWithoutPrefix = cleanVat;                   // "291386772"
      
      if (cleanVat && address_id) {
        const vatIsValid = isValidUkVatNumber(cleanVat);
        console.log('[Sage Proxy] Step 5 — digits:', cleanVat, '| with prefix:', vatWithPrefix, '| valid:', vatIsValid);

        if (!vatIsValid) {
          console.warn('[Sage Proxy] Step 5 — SKIPPING: "' + cleanVat + '" fails the UK VAT modulus check.');
          console.warn('[Sage Proxy] VAT number stored in portal only. It will sync to Sage when corrected.');
        } else {
          let vatSet = false;

          // Ensure main_address is set
          try {
            await sageRequest(`contacts/${sage_id}`, {
              contact: { main_address: { id: address_id } }
            }, 'PUT');
            console.log('[Sage Proxy] Step 5 — main_address confirmed');
          } catch (_) { /* non-fatal */ }

          // Try each format: digits only, then GB-prefixed
          const formatsToTry = [vatWithoutPrefix, vatWithPrefix];
          
          for (const vatFormat of formatsToTry) {
            if (vatSet) break;
            console.log('[Sage Proxy] Step 5 — trying tax_number format:', vatFormat);
            try {
              await sageRequest(`contacts/${sage_id}`, {
                contact: {
                  tax_number: vatFormat,
                  main_address: { id: address_id },
                }
              }, 'PUT');
              console.log('[Sage Proxy] Step 5 COMPLETE — tax_number set as:', vatFormat);
              vatSet = true;
            } catch (vatErr) {
              console.warn('[Sage Proxy] Step 5 — format', vatFormat, 'failed:', vatErr?.data?.[0]?.$message || 'unknown');
            }
          }

          // Fallback: try bare PUT (no main_address) with each format
          if (!vatSet) {
            for (const vatFormat of formatsToTry) {
              if (vatSet) break;
              try {
                await sageRequest(`contacts/${sage_id}`, {
                  contact: { tax_number: vatFormat }
                }, 'PUT');
                console.log('[Sage Proxy] Step 5 COMPLETE — bare PUT with:', vatFormat);
                vatSet = true;
              } catch (_) { /* try next */ }
            }
          }

          // Last resort: change address type and retry
          if (!vatSet) {
            const altType = isCustomer ? 'PURCHASING' : 'SALES';
            console.log('[Sage Proxy] Step 5 — trying alternate address type:', altType);
            try {
              await sageRequest(`addresses/${address_id}`, {
                address: { address_type_id: altType, is_main_address: true, country_id: 'GB' }
              }, 'PUT');
              for (const vatFormat of formatsToTry) {
                if (vatSet) break;
                try {
                  await sageRequest(`contacts/${sage_id}`, {
                    contact: { tax_number: vatFormat, main_address: { id: address_id } }
                  }, 'PUT');
                  console.log('[Sage Proxy] Step 5 COMPLETE — set with', altType, 'type and format:', vatFormat);
                  vatSet = true;
                } catch (_) { /* try next */ }
              }
            } catch (e) {
              console.warn('[Sage Proxy] Step 5 — could not change address type');
            }
          }

          if (!vatSet) {
            console.warn('[Sage Proxy] Step 5 FAILED — all attempts exhausted. VAT stored in portal only.');
          }
        }
      } else if (cleanVat && !address_id) {
        console.warn('[Sage Proxy] Skipping tax_number — no address to validate against. Stored in portal only.');
      } else if (!cleanVat) {
        console.log('[Sage Proxy] Step 5 — no VAT number provided (raw vatNumber was:', JSON.stringify(vatNumber), ')');
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
  if (action === 'manageContactPerson') {
    const { sageContactId, sageContactPersonId, operation, contactPerson } = req.body;
    if (!sageContactId && operation !== 'delete') {
      return res.status(400).json({ error: 'sageContactId is required (customer must be linked to Sage first)' });
    }
    try {
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
        
        const seen = new Set();
        const uniqueItems = [];
        for (const item of items) {
          if (!item?.id || seen.has(item.id)) continue;
          seen.add(item.id);
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
      // ── SET MAIN ─────────────────────────────────────────────────────────
      // Sets a contact person as the main (and preferred for customers) on the contact.
      // Also sets is_main_contact on the contact_person itself.
      if (operation === 'setMain' && sageContactPersonId) {
        const { contactType: cpContactType } = req.body;
        const isCust = cpContactType !== 'SUPPLIER';
        console.log('[Sage Proxy] Setting main contact person:', sageContactPersonId, 'on contact:', sageContactId, '| isCustomer:', isCust);

        // 1. Update the contact_person to is_main_contact: true
        try {
          await sageFetch(`contact_persons/${sageContactPersonId}`, 'PUT', {
            contact_person: {
              is_main_contact: true,
              ...(isCust && { is_preferred_contact: true }),
            }
          });
          console.log('[Sage Proxy] Set is_main_contact on contact_person');
        } catch (e) {
          console.warn('[Sage Proxy] Could not set is_main_contact on person:', e?.data?.[0]?.$message || e?.message);
        }

        // 2. Update the contact to point main_contact_person (and preferred for customers)
        try {
          const contactUpdate = {
            main_contact_person: { id: sageContactPersonId },
          };
          if (isCust) {
            contactUpdate.preferred_contact_person = { id: sageContactPersonId };
          }
          await sageFetch(`contacts/${sageContactId}`, 'PUT', { contact: contactUpdate });
          console.log('[Sage Proxy] Set main_contact_person on contact');
        } catch (e) {
          console.warn('[Sage Proxy] Could not set main_contact_person:', e?.data?.[0]?.$message || e?.message);
          // Fallback with _id fields
          try {
            const fallback = { main_contact_person_id: sageContactPersonId };
            if (isCust) fallback.preferred_contact_person_id = sageContactPersonId;
            await sageFetch(`contacts/${sageContactId}`, 'PUT', { contact: fallback });
            console.log('[Sage Proxy] Set main_contact_person (fallback)');
          } catch (e2) {
            console.warn('[Sage Proxy] Fallback also failed:', e2?.data?.[0]?.$message || e2?.message);
          }
        }

        return res.status(200).json({ success: true });
      }
      return res.status(400).json({ error: 'Invalid operation. Use: list, create, update, delete, setMain' });
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
