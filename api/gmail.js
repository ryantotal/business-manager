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

  // ── WTN: serve hosted printable WTN page ─────────────────────────────────
  if (action === 'wtn') {
    const { id } = req.query;
    if (!id) return res.status(400).send('Missing WTN ID');

    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_KEY
      );

      // Try by wtn_number first, then by job_number as fallback
      let { data: jobs } = await supabase
        .from('jobs')
        .select('wtn_data, wtn_number, customer_name, job_number, job_type, job_date, site_address1, site_postcode')
        .eq('wtn_number', id)
        .limit(1);

      // Fallback: strip WTN- prefix and search by job number
      if (!jobs?.length) {
        const jobNum = id.replace(/^WTN-/i, '');
        const { data: fallback } = await supabase
          .from('jobs')
          .select('wtn_data, wtn_number, customer_name, job_number, job_type, job_date, site_address1, site_postcode')
          .eq('job_number', jobNum)
          .limit(1);
        jobs = fallback;
      }

      const job = jobs?.[0];
      if (!job) {
        return res.status(404).send(`<html><body style="font-family:Arial;padding:40px;text-align:center;"><h2>WTN Not Found</h2><p>Reference <strong>${id}</strong> could not be found.</p><p>Contact Total Waste Services Ltd if you believe this is an error.</p></body></html>`);
      }

      let wtnData = {};
      try { wtnData = typeof job.wtn_data === 'string' ? JSON.parse(job.wtn_data) : (job.wtn_data || {}); } catch(e) {}

      // Build fallback content from wtn_data fields if htmlContent not stored
      const fallbackContent = `
        <div style="max-width:680px;margin:0 auto;background:#fff;border:2px solid #000;font-family:Arial,sans-serif;font-size:12px;">
          <div style="background:#fff;padding:14px 20px;border-bottom:3px solid #1a5c2a;display:flex;justify-content:space-between;align-items:center;">
            <strong style="font-size:16px;color:#1a5c2a;">TOTAL WASTE SERVICES LTD</strong>
            <div style="text-align:center;"><div style="font-size:17px;font-weight:700;color:#1a5c2a;">WASTE TRANSFER NOTE</div><div style="font-size:9px;color:#666;">Environmental Protection Act 1990 s.34</div></div>
            <div style="text-align:right;"><div style="font-size:15px;font-weight:700;color:#1a5c2a;">${wtnData.wtnNumber || id}</div><div style="font-size:9px;color:#666;">Job: ${job.job_number}</div><div style="font-size:9px;color:#666;">${wtnData.transferDate ? new Date(wtnData.transferDate).toLocaleDateString('en-GB') : ''}</div></div>
          </div>
          <div style="background:#fff8c5;border-bottom:2px solid #000;padding:6px 20px;font-size:9px;font-weight:700;text-align:center;">⚠ LEGAL DOCUMENT — Retain for minimum 2 years. Produce on request to Environment Agency within 7 days.</div>
          <table style="width:100%;border-collapse:collapse;border-bottom:2px solid #000;">
            <tr><td colspan="2" style="background:#d1fae5;padding:5px 12px;font-size:10px;font-weight:700;text-transform:uppercase;border-bottom:1px solid #000;">Section A — Description of Waste</td></tr>
            <tr>
              <td style="padding:8px 12px;border-right:1px solid #ccc;width:50%;"><div style="font-size:8px;color:#555;text-transform:uppercase;">Waste Description</div><div style="font-weight:700;">${wtnData.wasteDescription || '—'}</div></td>
              <td style="padding:8px 12px;width:50%;"><div style="font-size:8px;color:#555;text-transform:uppercase;">EWC Code</div><div style="font-weight:700;">${wtnData.listOfWasteCode || '—'}</div></td>
            </tr>
            <tr>
              <td style="padding:8px 12px;border-right:1px solid #ccc;border-top:1px solid #ccc;"><div style="font-size:8px;color:#555;text-transform:uppercase;">Container / Skip Size</div><div style="font-weight:700;">${wtnData.skipSize || '—'}</div></td>
              <td style="padding:8px 12px;border-top:1px solid #ccc;"><div style="font-size:8px;color:#555;text-transform:uppercase;">Quantity</div><div style="font-weight:700;">${wtnData.quantity || '—'} ${wtnData.unit || ''}</div></td>
            </tr>
          </table>
          <table style="width:100%;border-collapse:collapse;border-bottom:2px solid #000;">
            <tr><td colspan="2" style="background:#d1fae5;padding:5px 12px;font-size:10px;font-weight:700;text-transform:uppercase;border-bottom:1px solid #000;">Section B — Transferor (Current Holder)</td></tr>
            <tr>
              <td style="padding:8px 12px;border-right:1px solid #ccc;width:50%;"><div style="font-size:8px;color:#555;text-transform:uppercase;">Name &amp; Address</div><div style="font-weight:700;">${wtnData.transferorName || job.customer_name || '—'}</div><div>${wtnData.transferorAddress || ''}</div></td>
              <td style="padding:8px 12px;width:50%;"><div style="font-size:8px;color:#555;text-transform:uppercase;">Permit/Carrier Reg</div><div style="font-weight:700;">${wtnData.transferorCarrierReg || '—'}</div></td>
            </tr>
          </table>
          <table style="width:100%;border-collapse:collapse;border-bottom:2px solid #000;">
            <tr><td colspan="2" style="background:#d1fae5;padding:5px 12px;font-size:10px;font-weight:700;text-transform:uppercase;border-bottom:1px solid #000;">Section C — Carrier (Transferee)</td></tr>
            <tr>
              <td style="padding:8px 12px;border-right:1px solid #ccc;width:50%;"><div style="font-size:8px;color:#555;text-transform:uppercase;">Carrier Name</div><div style="font-weight:700;">${wtnData.transfereeName || 'Total Waste Services Ltd'}</div></td>
              <td style="padding:8px 12px;width:50%;"><div style="font-size:8px;color:#555;text-transform:uppercase;">EA Carrier Reg</div><div style="font-weight:700;">${wtnData.transfereeCarrierReg || '—'}</div></td>
            </tr>
          </table>
          <div style="background:#f3f4f6;border-top:2px solid #000;padding:8px 16px;font-size:9px;color:#555;text-align:center;">
            Total Waste Services Ltd • 10 Park Plaza, Battlefield Enterprise Park, Shrewsbury, SY1 3AF • info@totalwasteservicesltd.com
          </div>
        </div>`;

      const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WTN ${id} - Total Waste Services Ltd</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; background: #f5f5f5; }
    .toolbar { background: #1a5c2a; color: white; padding: 12px 20px; display: flex; align-items: center; justify-content: space-between; }
    .toolbar h1 { font-size: 16px; font-weight: 600; }
    .toolbar button { background: white; color: #1a5c2a; border: none; padding: 8px 20px; border-radius: 5px; font-size: 14px; font-weight: 700; cursor: pointer; }
    .content { max-width: 720px; margin: 20px auto; padding: 0 16px; }
    @media print { .toolbar { display: none !important; } body { background: white; } .content { margin: 0; padding: 0; max-width: 100%; } }
  </style>
</head>
<body>
  <div class="toolbar">
    <h1>Waste Transfer Note — ${id}</h1>
    <button onclick="window.print()">🖨️ Print / Save as PDF</button>
  </div>
  <div class="content">
    ${wtnData.htmlContent || fallbackContent}
  </div>
</body>
</html>`;

      res.setHeader('Content-Type', 'text/html');
      return res.send(html);
    } catch (err) {
      return res.status(500).send('Error: ' + err.message);
    }
  }

  return res.status(400).json({ error: 'Unknown action. Use ?action=auth, ?action=callback, ?action=send or ?action=wtn' });
}
