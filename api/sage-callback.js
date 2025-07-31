export default async function handler(req, res) {
  const { code, state, error, country } = req.query;
  
  console.log('Sage callback received:', { code, state, error, country });
  
  if (error) {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Sage Connection Error</title>
      </head>
      <body>
        <h2>Connection Failed</h2>
        <p>Error: ${error}</p>
        <script>
          if (window.opener) {
            window.opener.postMessage({
              type: 'sage-oauth-error',
              error: '${error}'
            }, '*');
          }
          setTimeout(() => window.close(), 3000);
        </script>
      </body>
      </html>
    `;
    res.setHeader('Content-Type', 'text/html');
    return res.status(400).send(html);
  }
  
  if (!code) {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Sage Connection Error</title>
      </head>
      <body>
        <h2>No Authorization Code</h2>
        <script>
          if (window.opener) {
            window.opener.postMessage({
              type: 'sage-oauth-error',
              error: 'no_authorization_code'
            }, '*');
          }
          setTimeout(() => window.close(), 3000);
        </script>
      </body>
      </html>
    `;
    res.setHeader('Content-Type', 'text/html');
    return res.status(400).send(html);
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
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Sage Connection Error</title>
        </head>
        <body>
          <h2>Token Exchange Failed</h2>
          <p>${tokens.error || 'Unknown error'}</p>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'sage-oauth-error',
                error: 'token_exchange_failed'
              }, '*');
            }
            setTimeout(() => window.close(), 3000);
          </script>
        </body>
        </html>
      `;
      res.setHeader('Content-Type', 'text/html');
      return res.status(400).send(html);
    }

    console.log('Token exchange successful, received tokens');

    // Create an HTML page that communicates back to the opener window
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
          .success {
            color: #4CAF50;
            font-size: 48px;
            margin-bottom: 20px;
          }
          .spinner {
            border: 3px solid #f3f3f3;
            border-top: 3px solid #4CAF50;
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
          <div class="success">✓</div>
          <h2>Successfully Connected to Sage!</h2>
          <div class="spinner"></div>
          <p>Saving connection... This window will close automatically.</p>
        </div>
        <script>
          // Store tokens in this window's localStorage (for fallback)
          localStorage.setItem('sage_access_token', '${tokens.access_token}');
          localStorage.setItem('sage_refresh_token', '${tokens.refresh_token}');
          localStorage.setItem('sage_expires_in', '${tokens.expires_in || 300}');
          localStorage.setItem('sage_oauth_complete', 'true');
          localStorage.setItem('sage_requested_by_id', '${tokens.requested_by_id || ''}');
          localStorage.setItem('sage_token_timestamp', new Date().toISOString());
          
          console.log('Sage tokens stored in popup localStorage');
          
          // Send tokens to the opener window
          if (window.opener && !window.opener.closed) {
            console.log('Sending tokens to opener window...');
            window.opener.postMessage({
              type: 'sage-oauth-complete',
              tokens: {
                access_token: '${tokens.access_token}',
                refresh_token: '${tokens.refresh_token}',
                expires_in: ${tokens.expires_in || 300},
                requested_by_id: '${tokens.requested_by_id || ''}',
                timestamp: new Date().toISOString()
              }
            }, '*');
            console.log('Tokens sent to opener');
          } else {
            console.log('No opener window found');
          }
          
          // Close window after a short delay
          setTimeout(() => {
            console.log('Closing popup...');
            window.close();
            // If window.close() doesn't work, show a message
            setTimeout(() => {
              document.querySelector('.container').innerHTML = 
                '<h2>Connection Complete!</h2><p>You can close this window.</p>';
            }, 1000);
          }, 2500);
        </script>
      </body>
      </html>
    `;

    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(html);
    
  } catch (error) {
    console.error('Token exchange error:', error);
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Sage Connection Error</title>
      </head>
      <body>
        <h2>Connection Error</h2>
        <p>${error.message}</p>
        <script>
          if (window.opener) {
            window.opener.postMessage({
              type: 'sage-oauth-error',
              error: 'token_exchange_error'
            }, '*');
          }
          setTimeout(() => window.close(), 3000);
        </script>
      </body>
      </html>
    `;
    res.setHeader('Content-Type', 'text/html');
    res.status(500).send(html);
  }
}
