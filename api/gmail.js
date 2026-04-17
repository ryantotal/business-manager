import { createClient } from '@supabase/supabase-js';

async function refreshAccessToken(refreshToken) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GMAIL_CLIENT_ID,
      client_secret: process.env.GMAIL_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  });
  return res.json();
}

function buildEmail({ to, subject, body, fromEmail, fromName, pdfHtml }) {
  // Build HTML email with message at top, quote below
  const htmlBody = `
    <div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto">
      <div style="padding:20px 0 30px 0;white-space:pre-wrap;font-size:14px;color:#333;border-bottom:2px solid #eee;margin-bottom:30px">${body.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
      ${pdfHtml.replace(/<html>.*?<body>/s,'').replace(/<\/body>.*?<\/html>/s,'')}
    </div>`;

  const boundary = 'tws_boundary_' + Date.now();
  const lines = [
    `From: ${fromName} <${fromEmail}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    ``,
    body,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset="UTF-8"`,
    ``,
    htmlBody,
    ``,
    `--${boundary}--`,
  ];
  const raw = lines.join('\r\n');
  return Buffer.from(raw).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export default async function handler(req, res) {
  const action = req.query.action;

  // ── AUTH: redirect to Google consent screen ──────────────────────────────
  if (action === 'auth') {
    const { user_id, user_email } = req.query;
    const params = new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID,
      redirect_uri: process.env.GMAIL_REDIRECT_URI,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/gmail.send',
      access_type: 'offline',
      prompt: 'consent',
      state: JSON.stringify({ user_id, user_email }),
    });
    return res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  }

  // ── CALLBACK: exchange code for tokens, store in Supabase ─────────────────
  if (action === 'callback') {
    const { code, state } = req.query;
    if (!code) return res.status(400).send('No code provided');
    try {
      const { user_id, user_email } = JSON.parse(state || '{}');

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
      if (tokens.error) throw new Error(tokens.error_description || tokens.error);

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

      return res.send(`
        <html><body>
          <p>Gmail connected successfully! Closing window...</p>
          <script>
            window.opener && window.opener.postMessage({ type: 'gmail-connected', email: '${user_email}' }, '*');
            setTimeout(() => window.close(), 1500);
          </script>
        </body></html>
      `);
    } catch (err) {
      console.error('Gmail callback error:', err);
      return res.status(500).send('Error: ' + err.message);
    }
  }

  // ── SEND: send email with PDF attachment ──────────────────────────────────
  if (action === 'send') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { user_id, to, subject, body, pdfBase64, pdfFilename, fromName } = req.body;
    if (!user_id || !to || !subject || !pdfBase64) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_KEY
      );

      const { data: tokenRow, error: tokenError } = await supabase
        .from('user_gmail_tokens')
        .select('*')
        .eq('user_id', user_id)
        .single();

      if (tokenError || !tokenRow) {
        return res.status(401).json({ error: 'Gmail not connected. Please connect your Gmail in Admin → User Management.' });
      }

      let accessToken = tokenRow.access_token;
      if (new Date(tokenRow.expires_at) < new Date()) {
        const refreshed = await refreshAccessToken(tokenRow.refresh_token);
        if (refreshed.error) {
          return res.status(401).json({ error: 'Gmail token expired. Please reconnect in Admin → User Management.' });
        }
        accessToken = refreshed.access_token;
        await supabase.from('user_gmail_tokens').update({
          access_token: refreshed.access_token,
          expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
        }).eq('user_id', user_id);
      }

      const rawEmail = buildEmail({
        to,
        subject,
        body,
        fromEmail: tokenRow.user_email,
        fromName: fromName || 'Total Waste Services',
        pdfHtml: Buffer.from(pdfBase64, 'base64').toString('utf-8'),
      });

      const sendRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw: rawEmail }),
      });

      const sendData = await sendRes.json();
      if (sendData.error) throw new Error(sendData.error.message || 'Gmail send failed');

      return res.json({ success: true, messageId: sendData.id });
    } catch (err) {
      console.error('Gmail send error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(400).json({ error: 'Unknown action. Use ?action=auth, ?action=callback or ?action=send' });
}
