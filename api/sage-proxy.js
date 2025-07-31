export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { endpoint, method = 'GET', body } = req.body || {};

  try {
    // Get Supabase client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch current token from database
    const { data: tokenData, error: tokenError } = await supabase
      .from('company_settings')
      .select('setting_value')
      .eq('setting_name', 'sage_access_token')
      .single();

    if (tokenError || !tokenData) {
      return res.status(401).json({ error: 'No Sage token found. Please reconnect to Sage.' });
    }

    const accessToken = tokenData.setting_value;

    // Make request to Sage API
    const sageResponse = await fetch(`https://api.accounting.sage.com/v3.1/${endpoint}`, {
      method,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    });

    const data = await sageResponse.json();
    
    // If unauthorized, token might be expired
    if (sageResponse.status === 401) {
      // TODO: Implement token refresh here
      return res.status(401).json({ 
        error: 'Sage authentication failed. Please reconnect to Sage.',
        details: data 
      });
    }

    res.status(sageResponse.status).json(data);
  } catch (error) {
    console.error('Sage proxy error:', error);
    res.status(500).json({ error: error.message });
  }
}
