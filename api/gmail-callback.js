import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const { code, state } = req.query;

  if (!code) {
    return res.status(400).send('No code provided');
  }

  try {
    const { user_id, user_email } = JSON.parse(state || '{}');

    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GMAIL_CLIENT_ID,
        client_secret: process.env.GMAIL_CLIENT_SECRET,
        redirect_uri: process.env.GMAIL_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });

    const tokens = await tokenRes.json();

    if (tokens.error) {
      throw new Error(tokens.error_description || tokens.error);
    }

    // Store tokens in Supabase
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    await supabase.from('user_gmail_tokens').upsert({
      user_id,
      user_email,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    }, { onConflict: 'user_id' });

    // Close the popup and notify the parent window
    res.send(`
      <html>
        <body>
          <p>Gmail connected successfully! You can close this window.</p>
          <script>
            window.opener && window.opener.postMessage({ type: 'gmail-connected', email: '${user_email}' }, '*');
            setTimeout(() => window.close(), 1500);
          </script>
        </body>
      </html>
    `);

  } catch (err) {
    console.error('Gmail callback error:', err);
    res.status(500).send(`Error: ${err.message}`);
  }
}
