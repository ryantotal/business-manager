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

function buildEmail({ to, subject, body, fromEmail, fromName, pdfBase64, pdfFilename }) {
  const boundary = 'tws_boundary_' + Date.now();
  const emailLines = [
    `From: ${fromName} <${fromEmail}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    `Content-Transfer-Encoding: quoted-printable`,
    ``,
    body,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; name="${pdfFilename}"`,
    `Content-Disposition: attachment; filename="${pdfFilename}"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    pdfBase64,
    ``,
    `--${boundary}--`,
  ];

  const raw = emailLines.join('\r\n');
  return Buffer.from(raw).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export default async function handler(req, res) {
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

    // Get user's tokens
    const { data: tokenRow, error: tokenError } = await supabase
      .from('user_gmail_tokens')
      .select('*')
      .eq('user_id', user_id)
      .single();

    if (tokenError || !tokenRow) {
      return res.status(401).json({ error: 'Gmail not connected. Please connect your Gmail in your profile.' });
    }

    let accessToken = tokenRow.access_token;

    // Refresh if expired
    if (new Date(tokenRow.expires_at) < new Date()) {
      const refreshed = await refreshAccessToken(tokenRow.refresh_token);
      if (refreshed.error) {
        return res.status(401).json({ error: 'Gmail token expired. Please reconnect your Gmail.' });
      }
      accessToken = refreshed.access_token;
      await supabase.from('user_gmail_tokens').update({
        access_token: refreshed.access_token,
        expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      }).eq('user_id', user_id);
    }

    // Build and send email
    const rawEmail = buildEmail({
      to,
      subject,
      body,
      fromEmail: tokenRow.user_email,
      fromName: fromName || 'Total Waste Services',
      pdfBase64,
      pdfFilename: pdfFilename || 'Quotation.html',
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

    if (sendData.error) {
      throw new Error(sendData.error.message || 'Gmail send failed');
    }

    res.json({ success: true, messageId: sendData.id });

  } catch (err) {
    console.error('Gmail send error:', err);
    res.status(500).json({ error: err.message });
  }
}
