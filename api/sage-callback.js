export default async function handler(req, res) {
  const { code, state, error, country } = req.query;
  
  console.log('Sage callback received:', { code, state, error, country });
  
  if (error) {
    return res.redirect(`/?sage_error=${encodeURIComponent(error)}`);
  }
  
  if (!code) {
    return res.redirect('/?sage_error=no_authorization_code');
  }

  try {
    // Exchange code for tokens right here in the callback
    const tokenResponse = await fetch('https://oauth.accounting.sage.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: process.env.SAGE_REDIRECT_URI,
        client_id: process.env.SAGE_CLIENT_ID,
        client_secret: process.env.SAGE_CLIENT_SECRET
      })
    });

    const tokens = await tokenResponse.json();
    
    if (!tokenResponse.ok) {
      console.error('Token exchange failed:', tokens);
      return res.redirect(`/?sage_error=token_exchange_failed`);
    }

    // For now, let's just redirect with the tokens in the URL (temporary solution)
    // In production, you'd save these to a database
    return res.redirect(`/?sage_success=true&access_token=${tokens.access_token}&refresh_token=${tokens.refresh_token}`);
    
  } catch (error) {
    console.error('Token exchange error:', error);
    return res.redirect(`/?sage_error=token_exchange_error`);
  }
}
