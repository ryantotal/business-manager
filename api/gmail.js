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
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_KEY
      );

      // wtn_number is stored inside wtn_data JSON, not as a column
      // Search by job_number — strip WTN- prefix if present
      const jobNum = id.replace(/^WTN-/i, '');
      let { data: jobs } = await supabase
        .from('jobs')
        .select('wtn_data, wtn_sent, customer_name, job_number, job_type, job_date, site_address1, site_postcode')
        .eq('job_number', jobNum)
        .limit(1);

      // Also try wtn_sent jobs that contain this ID in wtn_data
      if (!jobs?.length) {
        const { data: fallback } = await supabase
          .from('jobs')
          .select('wtn_data, wtn_sent, customer_name, job_number, job_type, job_date, site_address1, site_postcode')
          .eq('wtn_sent', true)
          .ilike('wtn_data', '%' + jobNum + '%')
          .limit(1);
        jobs = fallback;
      }

      const job = jobs?.[0];
      if (!job) {
        return res.status(404).send(`<html><body style="font-family:Arial;padding:40px;text-align:center;"><h2>WTN Not Found</h2><p>Reference <strong>${id}</strong> could not be found.</p><p>Contact Total Waste Services Ltd if you believe this is an error.</p></body></html>`);
      }

      let wtnData = {};
      try { wtnData = typeof job.wtn_data === 'string' ? JSON.parse(job.wtn_data) : (job.wtn_data || {}); } catch(e) {}

      // Build full WTN reconstruction from wtn_data fields
      const transferDateStr = wtnData.transferDate ? new Date(wtnData.transferDate).toLocaleDateString('en-GB') : '—';
      const fallbackContent = `
        <div style="max-width:720px;margin:0 auto;background:#fff;border:2px solid #000;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#1f2937;">
          <div style="background:#fff;padding:14px 20px;border-bottom:3px solid #1a5c2a;">
            <table style="width:100%;border-collapse:collapse;"><tr>
              <td style="width:140px;vertical-align:middle;"><strong style="font-size:13px;color:#1a5c2a;">TOTAL WASTE SERVICES LTD</strong></td>
              <td style="text-align:center;vertical-align:middle;padding:0 12px;">
                <div style="font-size:17px;font-weight:700;color:#1a5c2a;">WASTE TRANSFER NOTE</div>
                <div style="font-size:9px;color:#666;">Duty of Care — Environmental Protection Act 1990 s.34</div>
                <div style="font-size:9px;color:#666;">Waste (England &amp; Wales) Regulations 2011</div>
              </td>
              <td style="width:140px;text-align:right;vertical-align:middle;">
                <div style="font-size:15px;font-weight:700;color:#1a5c2a;">${wtnData.wtnNumber || id}</div>
                <div style="font-size:9px;color:#666;margin-top:3px;">Job: ${job.job_number}</div>
                <div style="font-size:9px;color:#666;">${transferDateStr}</div>
              </td>
            </tr></table>
          </div>
          <div style="background:#fff8c5;border-bottom:2px solid #000;padding:6px 20px;font-size:9px;font-weight:700;text-align:center;">⚠ LEGAL DOCUMENT — Both parties must retain a signed copy for a minimum of 2 years and produce on request to the Environment Agency or Local Authority within 7 days.</div>

          <div style="border-bottom:2px solid #000;">
            <div style="background:#d1fae5;padding:5px 12px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #000;">Section A — Description of Waste</div>
            <table style="width:100%;border-collapse:collapse;">
              <tr>
                <td style="width:50%;padding:7px 12px;border-right:1px solid #ccc;border-bottom:1px solid #ccc;"><div style="font-size:8px;color:#555;text-transform:uppercase;">A1 Description of Waste</div><div style="font-weight:700;">${wtnData.wasteDescription || '—'}</div></td>
                <td style="width:50%;padding:7px 12px;border-bottom:1px solid #ccc;"><div style="font-size:8px;color:#555;text-transform:uppercase;">Container / Skip Size</div><div style="font-weight:700;">${wtnData.skipSize || '—'}</div></td>
              </tr>
              <tr>
                <td style="padding:7px 12px;border-right:1px solid #ccc;border-bottom:1px solid #ccc;"><div style="font-size:8px;color:#555;text-transform:uppercase;">EWC Code</div><div style="font-weight:700;">${wtnData.listOfWasteCode || '—'}</div></td>
                <td style="padding:7px 12px;border-bottom:1px solid #ccc;"><div style="font-size:8px;color:#555;text-transform:uppercase;">A3 Quantity</div><div style="font-weight:700;">${wtnData.quantity || '—'} ${wtnData.unit || ''}</div></td>
              </tr>
              <tr><td colspan="2" style="padding:6px 12px;border-bottom:1px solid #ccc;font-size:10px;"><strong>Hazardous waste?</strong> ${wtnData.isHazardous ? 'YES' : 'No'}</td></tr>
            </table>
          </div>

          <div style="border-bottom:2px solid #000;">
            <div style="background:#d1fae5;padding:5px 12px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #000;">Section B — Current Holder of the Waste (Transferor)</div>
            <table style="width:100%;border-collapse:collapse;">
              <tr>
                <td style="width:50%;padding:7px 12px;border-right:1px solid #ccc;border-bottom:1px solid #ccc;"><div style="font-size:8px;color:#555;text-transform:uppercase;">B1 Name &amp; Address</div><div style="font-weight:700;">${wtnData.transferorName || job.customer_name || '—'}</div><div style="font-size:11px;">${wtnData.transferorAddress || ''}</div></td>
                <td style="width:50%;padding:7px 12px;border-bottom:1px solid #ccc;"><div style="font-size:9px;"><strong>B3 Are you:</strong> ☑ ${wtnData.transferorIsProducer ? 'Producer of the waste' : 'Holder of the waste'}</div><div style="font-size:9px;margin-top:3px;">Permit/Carrier Reg: ${wtnData.transferorPermitNumber || '—'}</div></td>
              </tr>
              <tr>
                <td style="padding:8px 12px;border-right:1px solid #ccc;"><div style="font-size:8px;color:#555;text-transform:uppercase;">Transferor's Signature</div><div style="border-bottom:1.5px solid #000;margin:14px 0 3px;width:80%;"></div><div style="font-weight:700;font-size:11px;">${wtnData.transferorSignature || '—'}</div></td>
                <td style="padding:8px 12px;"><div style="font-size:8px;color:#555;text-transform:uppercase;">Date of Transfer</div><div style="font-size:14px;font-weight:700;margin-top:8px;">${transferDateStr}</div></td>
              </tr>
            </table>
          </div>

          <div style="border-bottom:2px solid #000;">
            <div style="background:#d1fae5;padding:5px 12px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #000;">Section C — Person Collecting the Waste (Carrier / Transferee)</div>
            <table style="width:100%;border-collapse:collapse;">
              <tr>
                <td style="width:50%;padding:7px 12px;border-right:1px solid #ccc;border-bottom:1px solid #ccc;"><div style="font-size:8px;color:#555;text-transform:uppercase;">C1 Name &amp; Address</div><div style="font-weight:700;">${wtnData.transfereeName || '—'}</div><div style="font-size:11px;">${wtnData.transfereeAddress || ''}</div></td>
                <td style="width:50%;padding:7px 12px;border-bottom:1px solid #ccc;"><div style="font-size:9px;">☑ Registered waste carrier</div><div style="font-size:9px;"><strong>EA Carrier Reg No.:</strong> ${wtnData.transfereeCarrierReg || '—'}</div><div style="font-size:9px;margin-top:3px;"><strong>Permit/Exemption:</strong> ${wtnData.transfereePermitNumber || '—'}</div></td>
              </tr>
              <tr>
                <td style="padding:8px 12px;border-right:1px solid #ccc;"><div style="font-size:8px;color:#555;text-transform:uppercase;">Transferee's Signature</div><div style="border-bottom:1.5px solid #000;margin:14px 0 3px;width:80%;"></div><div style="font-weight:700;font-size:11px;">${wtnData.transfereeSignature || '—'}</div></td>
                <td style="padding:8px 12px;"><div style="font-size:8px;color:#555;text-transform:uppercase;">Date</div><div style="font-size:14px;font-weight:700;margin-top:8px;">${transferDateStr}</div></td>
              </tr>
            </table>
          </div>

          <div style="border-bottom:2px solid #000;">
            <div style="background:#d1fae5;padding:5px 12px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #000;">Section D — The Transfer &amp; Broker</div>
            <table style="width:100%;border-collapse:collapse;">
              <tr>
                <td style="width:50%;padding:7px 12px;border-right:1px solid #ccc;"><div style="font-size:8px;color:#555;text-transform:uppercase;">D1 Address of Collection Point</div><div style="font-weight:700;">${wtnData.transferAddress || wtnData.transferorAddress || '—'}</div></td>
                <td style="width:50%;padding:7px 12px;"><div style="font-size:8px;color:#555;text-transform:uppercase;">D2 Broker who arranged this transfer</div><div style="font-weight:700;">${wtnData.brokerName || 'Total Waste Services LTD'}</div><div style="font-size:10px;">${wtnData.brokerAddress || 'Battlefield Enterprise Park, 10 Park Plaza, Shrewsbury, SY1 3AF'}</div><div style="font-size:10px;"><strong>Reg:</strong> ${wtnData.brokerCarrierReg || '—'}</div></td>
              </tr>
            </table>
          </div>

          <div style="border-bottom:2px solid #000;">
            <div style="background:#d1fae5;padding:5px 12px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #000;">Waste Hierarchy &amp; Recycling Breakdown (Regulation 12)</div>
            <div style="padding:12px;">
              <div style="display:flex;gap:16px;flex-wrap:wrap;">
                <div style="display:flex;align-items:center;gap:8px;font-size:11px;"><div style="width:12px;height:12px;border-radius:50%;background:#16a34a;"></div><span><strong>${wtnData.recycledPct || 0}%</strong> Recycled/Reused (${((wtnData.recycledPct||0) * (wtnData.quantity||0) / 100).toFixed(2)} ${wtnData.unit||''})</span></div>
                <div style="display:flex;align-items:center;gap:8px;font-size:11px;"><div style="width:12px;height:12px;border-radius:50%;background:#f59e0b;"></div><span><strong>${wtnData.recoveredPct || 0}%</strong> Recovered</span></div>
                <div style="display:flex;align-items:center;gap:8px;font-size:11px;"><div style="width:12px;height:12px;border-radius:50%;background:#6b7280;"></div><span><strong>${wtnData.landfillPct || 0}%</strong> Disposal</span></div>
              </div>
              <div style="font-size:9px;color:#166534;margin-top:8px;">I confirm I have applied the waste hierarchy as required by Regulation 12 of the Waste (England &amp; Wales) Regulations 2011. ✓</div>
              ${wtnData.notes ? '<div style="margin-top:8px;font-size:11px;"><strong>Notes:</strong> ' + wtnData.notes + '</div>' : ''}
            </div>
          </div>

          <div style="background:#f3f4f6;border-top:2px solid #000;padding:8px 20px;display:flex;justify-content:space-between;font-size:9px;color:#555;">
            <span>Total Waste Services LTD • Broker Reg: ${wtnData.brokerCarrierReg || '—'}</span>
            <span>WMC2A • Retain for 2 years minimum</span>
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
