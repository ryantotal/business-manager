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

      const jobNum = id.replace(/^WTN-/i, '');
      let { data: jobs } = await supabase
        .from('jobs')
        .select('wtn_data, wtn_sent, customer_name, job_number, job_type, job_date, site_address1, site_postcode')
        .eq('job_number', jobNum)
        .limit(1);

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

      const transferDateStr = wtnData.transferDate ? new Date(wtnData.transferDate).toLocaleDateString('en-GB') : '—';
      const qty = parseFloat(wtnData.quantity) || 0;

      // Pie chart SVG
      const toRad = d => d * Math.PI / 180;
      const cx = 80, cy = 80, r = 65;
      const slices = [
        { pct: wtnData.recycledPct, color: '#16a34a', label: 'Recycled/Reused' },
        { pct: wtnData.recoveredPct, color: '#2563eb', label: 'Recovered' },
        { pct: wtnData.landfillPct, color: '#ea580c', label: 'Disposal' },
      ].filter(s => s.pct > 0);
      let ang = -90;
      const piePaths = slices.map(s => {
        const sw = s.pct / 100 * 360;
        const en = ang + sw;
        const x1 = cx + r * Math.cos(toRad(ang)), y1 = cy + r * Math.sin(toRad(ang));
        const x2 = cx + r * Math.cos(toRad(en)), y2 = cy + r * Math.sin(toRad(en));
        const d = `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${sw > 180 ? 1 : 0} 1 ${x2},${y2} Z`;
        ang = en;
        return `<path d="${d}" fill="${s.color}" stroke="white" stroke-width="1.5"/>`;
      }).join('');

      const containerOptions = ['Loose', 'Sacks', 'Skip', 'Drum', 'Roll-on roll-off container', 'Other'];

      // Normalise: if CBDU number was saved to permitNumber field in older records, move it to carrierReg
      const rawCarrierReg = wtnData.transfereeCarrierReg || '';
      const rawPermitNumber = wtnData.transfereePermitNumber || '';
      const isCbduInPermit = /^CBDU/i.test(rawPermitNumber) && !rawCarrierReg;
      const transfereeCarrierReg = isCbduInPermit ? rawPermitNumber : rawCarrierReg;
      const transfereePermitNumber = isCbduInPermit ? '' : rawPermitNumber;

      const fallbackContent = `
        <div style="max-width:720px;margin:0 auto;background:#fff;border:2px solid #000;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#1f2937;">

          <!-- Header -->
          <div style="background:#fff;padding:14px 20px;border-bottom:3px solid #1a5c2a;">
            <table style="width:100%;border-collapse:collapse;"><tr>
              <td style="width:140px;vertical-align:middle;"><strong style="font-size:13px;color:#1a5c2a;">TOTAL WASTE SERVICES LTD</strong></td>
              <td style="text-align:center;vertical-align:middle;padding:0 12px;">
                <div style="font-size:17px;font-weight:700;color:#1a5c2a;letter-spacing:.5px;margin-bottom:3px;">WASTE TRANSFER NOTE</div>
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

          <!-- Legal banner -->
          <div style="background:#fff8c5;border-bottom:2px solid #000;padding:6px 20px;font-size:9px;font-weight:700;text-align:center;">⚠ LEGAL DOCUMENT — Both parties must retain a signed copy for a minimum of 2 years and produce on request to the Environment Agency or Local Authority within 7 days.</div>

          <!-- Section A -->
          <div style="border-bottom:2px solid #000;">
            <div style="background:#d1fae5;padding:5px 12px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #000;">Section A — Description of Waste</div>
            <table style="width:100%;border-collapse:collapse;">
              <tr>
                <td style="width:50%;padding:7px 12px;border-right:1px solid #ccc;border-bottom:1px solid #ccc;vertical-align:top;">
                  <div style="font-size:8px;color:#555;text-transform:uppercase;letter-spacing:.3px;">A1 Description of waste</div>
                  <div style="font-weight:700;">${wtnData.wasteDescription || '—'}</div>
                </td>
                <td style="width:50%;padding:7px 12px;border-bottom:1px solid #ccc;vertical-align:top;">
                  <div style="font-size:8px;color:#555;text-transform:uppercase;letter-spacing:.3px;">Container / Skip Size</div>
                  <div style="font-weight:700;">${wtnData.skipSize || '—'}</div>
                </td>
              </tr>
              <tr>
                <td style="padding:7px 12px;border-right:1px solid #ccc;border-bottom:1px solid #ccc;vertical-align:top;">
                  <div style="font-size:8px;color:#555;text-transform:uppercase;letter-spacing:.3px;">EWC Code (List of Waste Regulations)</div>
                  <div style="font-weight:700;">${wtnData.listOfWasteCode || '—'}</div>
                </td>
                <td style="padding:7px 12px;border-bottom:1px solid #ccc;vertical-align:top;">
                  <div style="font-size:8px;color:#555;text-transform:uppercase;letter-spacing:.3px;">A3 Quantity</div>
                  <div style="font-weight:700;">${qty} ${wtnData.unit || ''}</div>
                </td>
              </tr>
              <tr>
                <td colspan="2" style="padding:6px 12px;border-bottom:1px solid #ccc;font-size:10px;">
                  <strong>A2 How is the waste contained?</strong>&nbsp;&nbsp;
                  ${containerOptions.map(c => `<span style="margin-right:12px;">${wtnData.wasteContainer === c ? '☑' : '☐'} ${c}</span>`).join('')}
                </td>
              </tr>
              <tr>
                <td colspan="2" style="padding:7px 12px;font-size:10px;">
                  <strong>Hazardous waste?</strong> ${wtnData.isHazardous ? '<span style="color:red;font-weight:700;">YES — Consignment Note Required</span>' : 'No'}
                </td>
              </tr>
            </table>
          </div>

          <!-- Section B -->
          <div style="border-bottom:2px solid #000;">
            <div style="background:#d1fae5;padding:5px 12px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #000;">Section B — Current Holder of the Waste (Transferor)</div>
            <table style="width:100%;border-collapse:collapse;">
              <tr>
                <td style="width:50%;padding:7px 12px;border-right:1px solid #ccc;border-bottom:1px solid #ccc;vertical-align:top;">
                  <div style="font-size:8px;color:#555;text-transform:uppercase;letter-spacing:.3px;">B1 Full name &amp; company name and address</div>
                  <div style="font-weight:700;">${wtnData.transferorName || job.customer_name || '—'}</div>
                  <div style="font-size:11px;margin-top:2px;">${wtnData.transferorAddress || ''}</div>
                </td>
                <td style="width:50%;padding:7px 12px;border-bottom:1px solid #ccc;vertical-align:top;">
                  <div style="font-size:8px;color:#555;text-transform:uppercase;letter-spacing:.3px;margin-bottom:2px;">B2 SIC Code (2007)</div>
                  <div style="font-weight:700;margin-bottom:6px;">${wtnData.transferorSicCode || '—'}</div>
                  <div style="font-size:9px;margin-bottom:4px;">
                    <strong>B3 Are you:</strong>&nbsp;&nbsp;
                    <span style="margin-right:10px;">${wtnData.transferorIsProducer ? '☑' : '☐'} Producer of the waste</span>
                    <span>${wtnData.transferorPermitNumber ? '☑' : '☐'} Holder of environmental permit</span>
                  </div>
                  <div style="font-size:9px;"><span style="color:#555;">Permit / Carrier Reg / Exemption No:</span> <strong>${wtnData.transferorPermitNumber || '—'}</strong></div>
                </td>
              </tr>
              <tr>
                <td style="padding:8px 12px;border-right:1px solid #ccc;vertical-align:top;">
                  <div style="font-size:8px;color:#555;text-transform:uppercase;letter-spacing:.3px;">Transferor's Signature</div>
                  <div style="border-bottom:1.5px solid #000;margin:14px 0 3px;width:80%;"></div>
                  <div style="font-weight:700;font-size:11px;">${wtnData.transferorSignature || '___________________________'}</div>
                  <div style="font-size:9px;color:#555;margin-top:2px;">Representing: ${wtnData.transferorRepresenting || wtnData.transferorName || '—'}</div>
                </td>
                <td style="padding:8px 12px;vertical-align:top;">
                  <div style="font-size:8px;color:#555;text-transform:uppercase;letter-spacing:.3px;">Date of transfer</div>
                  <div style="font-size:14px;font-weight:700;margin-top:8px;">${transferDateStr}</div>
                  ${wtnData.transferTime ? `<div style="font-size:10px;color:#555;">Time: ${wtnData.transferTime}</div>` : ''}
                </td>
              </tr>
            </table>
          </div>

          <!-- Section C -->
          <div style="border-bottom:2px solid #000;">
            <div style="background:#d1fae5;padding:5px 12px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #000;">Section C — Person Collecting the Waste (Transferee / Carrier)</div>
            <table style="width:100%;border-collapse:collapse;">
              <tr>
                <td style="width:50%;padding:7px 12px;border-right:1px solid #ccc;border-bottom:1px solid #ccc;vertical-align:top;">
                  <div style="font-size:8px;color:#555;text-transform:uppercase;letter-spacing:.3px;">C1 Full name &amp; company name and address</div>
                  <div style="font-weight:700;">${wtnData.transfereeName || '—'}</div>
                  <div style="font-size:11px;margin-top:2px;">${wtnData.transfereeAddress || ''}</div>
                </td>
                <td style="width:50%;padding:7px 12px;border-bottom:1px solid #ccc;vertical-align:top;">
                  <div style="font-size:9px;margin-bottom:6px;">
                    <strong>C3 Are you:</strong>&nbsp;&nbsp;
                    <span style="margin-right:10px;">${transfereeCarrierReg ? '☑' : '☐'} Registered waste carrier, broker or dealer</span>
                    <span>${transfereePermitNumber ? '☑' : '☐'} Holder of environmental permit</span>
                  </div>
                  <div style="font-size:9px;"><span style="color:#555;">EA Carrier Registration No. (CBDU...):</span> <strong>${transfereeCarrierReg || '—'}</strong></div>
                  <div style="font-size:9px;margin-top:3px;"><span style="color:#555;">Environmental Permit / Exemption No.:</span> <strong>${transfereePermitNumber || '—'}</strong></div>
                </td>
              </tr>
              <tr>
                <td style="padding:8px 12px;border-right:1px solid #ccc;vertical-align:top;">
                  <div style="font-size:8px;color:#555;text-transform:uppercase;letter-spacing:.3px;">Transferee's Signature</div>
                  <div style="border-bottom:1.5px solid #000;margin:14px 0 3px;width:80%;"></div>
                  <div style="font-weight:700;font-size:11px;">${wtnData.transfereeSignature || '___________________________'}</div>
                  <div style="font-size:9px;color:#555;margin-top:2px;">Representing: ${wtnData.transfereeRepresenting || wtnData.transfereeName || '—'}</div>
                </td>
                <td style="padding:8px 12px;vertical-align:top;">
                  <div style="font-size:8px;color:#555;text-transform:uppercase;letter-spacing:.3px;">Date of transfer</div>
                  <div style="font-size:14px;font-weight:700;margin-top:8px;">${transferDateStr}</div>
                </td>
              </tr>
            </table>
          </div>

          <!-- Section D -->
          <div style="border-bottom:2px solid #000;">
            <div style="background:#d1fae5;padding:5px 12px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #000;">Section D — The Transfer</div>
            <table style="width:100%;border-collapse:collapse;">
              <tr>
                <td style="width:50%;padding:7px 12px;border-right:1px solid #ccc;border-bottom:1px solid #ccc;vertical-align:top;">
                  <div style="font-size:8px;color:#555;text-transform:uppercase;letter-spacing:.3px;">D1 Address of transfer / collection point</div>
                  <div style="font-weight:700;">${wtnData.transferAddress || wtnData.transferorAddress || '—'}</div>
                </td>
                <td style="width:50%;padding:7px 12px;border-bottom:1px solid #ccc;vertical-align:top;">
                  <div style="font-size:8px;color:#555;text-transform:uppercase;letter-spacing:.3px;">Date &amp; time of transfer</div>
                  <div style="font-weight:700;">${transferDateStr}${wtnData.transferTime ? ' at ' + wtnData.transferTime : ''}</div>
                </td>
              </tr>
              <tr>
                <td colspan="2" style="padding:7px 12px;vertical-align:top;">
                  <div style="font-size:8px;color:#555;text-transform:uppercase;letter-spacing:.3px;margin-bottom:4px;">D2 Broker or dealer who arranged this transfer (if applicable)</div>
                  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;">
                    <div><div style="font-size:8px;color:#555;text-transform:uppercase;">Name / Company</div><div style="font-weight:700;">${wtnData.brokerName || 'Total Waste Services LTD'}</div></div>
                    <div><div style="font-size:8px;color:#555;text-transform:uppercase;">Address</div><div style="font-size:10px;font-weight:600;">${wtnData.brokerAddress || 'Battlefield Enterprise Park, 10 Park Plaza, Shrewsbury, SY1 3AF'}</div></div>
                    <div><div style="font-size:8px;color:#555;text-transform:uppercase;">Registration No. (CBDU...)</div><div style="font-weight:700;">${wtnData.brokerCarrierReg || '—'}</div></div>
                  </div>
                </td>
              </tr>
            </table>
          </div>

          <!-- Waste Hierarchy + Pie Chart -->
          <div style="border-bottom:2px solid #000;">
            <div style="background:#d1fae5;padding:5px 12px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #000;">Waste Hierarchy Confirmation &amp; Recycling Breakdown (Reg. 12)</div>
            <div style="display:flex;align-items:center;gap:16px;padding:10px;">
              <svg viewBox="0 0 160 160" width="120" height="120">${piePaths}</svg>
              <div>
                ${slices.map(s => `<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;font-size:10px;"><div style="width:11px;height:11px;border-radius:50%;background:${s.color};flex-shrink:0;"></div><span style="font-weight:600;">${s.pct}%</span>&nbsp;${s.label}&nbsp;<span style="color:#6b7280;font-size:9px;">(${(qty * s.pct / 100).toFixed(2)} ${wtnData.unit || ''})</span></div>`).join('')}
                <div style="font-size:9px;color:#166534;margin-top:6px;line-height:1.4;">By completing this WTN I confirm that I have fulfilled my duty to apply the waste hierarchy as required by Regulation 12 of the Waste (England &amp; Wales) Regulations 2011. ✓</div>
              </div>
            </div>
            ${wtnData.notes ? `<div style="padding:6px 12px;font-size:10px;border-top:1px solid #ccc;"><strong>Notes:</strong> ${wtnData.notes}</div>` : ''}
            <div style="background:#f0fdf4;border-top:1px solid #ccc;padding:8px 12px;font-size:9px;line-height:1.5;color:#166534;">⚖️ <strong>Duty of Care:</strong> Both parties confirm they have fulfilled duty of care obligations under the Environmental Protection Act 1990 s.34. The carrier in Section C holds a valid EA waste carrier registration. Both parties must retain a signed copy for a minimum of 2 years (3 years for hazardous waste) and produce on request within 7 days. Failure to produce is a criminal offence.</div>
          </div>

          <!-- Footer -->
          <div style="background:#f3f4f6;border-top:2px solid #000;padding:8px 20px;display:flex;justify-content:space-between;font-size:9px;color:#555;">
            <span>Total Waste Services LTD &bull; Broker Reg: ${wtnData.brokerCarrierReg || '—'} &bull; www.totalwasteservicesltd.com</span>
            <span>WMC2A &bull; Issued ${new Date().toLocaleDateString('en-GB')}</span>
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
    ${(() => {
      if (!wtnData.htmlContent) return fallbackContent;
      let h = wtnData.htmlContent;
      // Strip print button (has its own button in toolbar)
      h = h.replace(/<div[^>]*class="wtn-print-btn"[^>]*>[\s\S]*?<\/div>\s*<\/div>/i, '');
      // Fix CBDU saved in wrong field: if permit field contains CBDU number, swap it to carrier reg
      h = h.replace(
        /(<[^>]*>EA Carrier Registration No[^<]*<\/[^>]+>\s*<[^>]+>)\s*—\s*(<\/[^>]+>)([\s\S]*?<[^>]*>Environmental Permit[^<]*<\/[^>]+>\s*<[^>]+>)\s*(CBDU\w+)\s*(<\/)/gi,
        '$1$4$2$3—$5'
      );
      return h;
    })()}
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
