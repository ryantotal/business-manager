let tokens = {
  access_token: '',
  refresh_token: '',
  expires_at: Date.now() + 300000
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

// Parse JSON body if needed
if (req.body && typeof req.body === 'string') {
  try {
    req.body = JSON.parse(req.body);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid JSON in request body' });
  }
}

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    // First check if we have valid tokens in memory
    if (tokens.access_token && new Date() < tokens.expires_at) {
      return res.json({ 
        accessToken: tokens.access_token,
        expiresAt: tokens.expires_at 
      });
    }
    
    // If we have a refresh token, try to refresh
    if (tokens.refresh_token) {
      try {
        const response = await fetch('https://oauth.accounting.sage.com/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json'
          },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            client_id: 'a30eb717-392a-c008-f872-9751a2b20cd7/a9cc866e-abea-4684-85f8-447a76484bc1',
            client_secret: 'pc#GLx$N1Q2,z^^F0#-{',
            refresh_token: tokens.refresh_token
          })
        });

        if (!response.ok) {
          throw new Error(`Token refresh failed: ${response.status}`);
        }

        const data = await response.json();
        
        // Update tokens
        tokens.access_token = data.access_token;
        tokens.refresh_token = data.refresh_token || tokens.refresh_token;
        tokens.expires_at = Date.now() + (data.expires_in || 3600) * 1000;
        
        return res.json({ 
          accessToken: data.access_token,
          expiresAt: tokens.expires_at 
        });
      } catch (error) {
        console.error('Token refresh failed:', error);
      }
    }
    
    return res.status(401).json({ error: 'No valid token available' });
  }

  if (req.method === 'POST') {
    console.log('Received body:', req.body);
    console.log('Body type:', typeof req.body);

    const { access_token, refresh_token, expires_in } = req.body;

    console.log('Extracted tokens:', { 
    access_token: access_token ? 'exists' : 'missing',
    refresh_token: refresh_token ? 'exists' : 'missing',
    expires_in 
  });
  
    if (!access_token || !refresh_token) {
      return res.status(400).json({ error: 'Missing required tokens' });
    }
    
    // Store in memory
    tokens.access_token = access_token;
    tokens.refresh_token = refresh_token;
    tokens.expires_at = Date.now() + (expires_in || 3600) * 1000;
    
    return res.json({ 
      success: true,
      message: 'Tokens stored in memory',
      expiresAt: tokens.expires_at
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}