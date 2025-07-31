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
    // Exchange code for tokens
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

    console.log('Token exchange successful, received tokens');

    // Create an HTML page that stores tokens in localStorage before redirecting
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Connecting to Sage...</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background-color: #f5f5f5;
          }
          .container {
            text-align: center;
            padding: 20px;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          .spinner {
            border: 3px solid #f3f3f3;
            border-top: 3px solid #3498db;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 20px auto;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>Connecting to Sage...</h2>
          <div class="spinner"></div>
          <p>Please wait while we complete the connection.</p>
        </div>
        <script>
          // Store tokens in localStorage
          localStorage.setItem('sage_access_token', '${tokens.access_token}');
          localStorage.setItem('sage_refresh_token', '${tokens.refresh_token}');
          localStorage.setItem('sage_expires_in', '${tokens.expires_in || 300}');
          localStorage.setItem('sage_oauth_complete', 'true');
          localStorage.setItem('sage_requested_by_id', '${tokens.requested_by_id || ''}');
          
          // Also store timestamp for expiry calculation
          localStorage.setItem('sage_token_timestamp', new Date().toISOString());
          
          console.log('Sage tokens stored in localStorage');
          
          // Redirect to home page after a brief delay
          setTimeout(() => {
            window.location.href = '/#sage-integration';
          }, 1500);
        </script>
      </body>
      </html>
    `;

    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(html);
    
  } catch (error) {
    console.error('Token exchange error:', error);
    return res.redirect(`/?sage_error=token_exchange_error`);
  }
}
