export default async function handler(req, res) {
  const { code } = req.query;
  
  if (!code) {
    return res.status(400).json({ error: 'No authorization code received' });
  }
  
  try {
    // Exchange code for access token
    const tokenResponse = await fetch('https://oauth.accounting.sage.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: process.env.SAGE_CLIENT_ID,
        client_secret: process.env.SAGE_CLIENT_SECRET,
        code,
        redirect_uri: process.env.SAGE_REDIRECT_URI,
      }),
    });
    
    const tokens = await tokenResponse.json();
    
    // For now, just redirect back to admin with success
    res.redirect('/admin?sage=connected');
    
  } catch (error) {
    console.error('Sage OAuth error:', error);
    res.redirect('/admin?sage=error');
  }
}