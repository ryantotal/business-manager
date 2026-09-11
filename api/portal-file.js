// api/portal-file.js
//
// Signs a storage URL on behalf of a customer portal visitor.
//
// A portal visitor is anonymous as far as Supabase is concerned: they hold a
// portal session token, not a Supabase Auth session. Once the documents bucket
// stops being world readable, they can neither fetch a file directly nor create
// a signed URL for themselves. This endpoint does it for them, but only after
// checking three things:
//
//   1. the portal session token is real and has not expired
//   2. the requested path belongs to a job that customer can see
//   3. the path is not trying to escape into another folder
//
// Deliberately an EDGE function, for the same reason as api/staff-admin.js: the
// Hobby plan allows 12 Node functions and the Sage endpoints use all 12.
//
// Environment variables required (all three environments):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

export const config = { runtime: 'edge' };

const BUCKET = 'documents';
const SIGNED_URL_SECONDS = 60 * 60;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });

export default async function handler(req) {
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('[portal-file] missing environment variables');
    return json({ error: 'Server not configured' }, 500);
  }

  let body;
  try {
    body = await req.json();
  } catch (e) {
    return json({ error: 'Bad request' }, 400);
  }

  const token = String(body?.token || '').trim();
  const path = String(body?.path || '').trim();
  if (!token || !path) {
    return json({ error: 'token and path are both required' }, 400);
  }

  // Path traversal guard. The client should only ever send a plain object key,
  // so anything with a scheme, a parent reference or a leading slash is a sign
  // of tampering rather than a normal request.
  if (path.includes('..') || path.startsWith('/') || path.includes('://')) {
    return json({ error: 'Bad path' }, 400);
  }

  const rest = async (fnName, payload) => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`${fnName} failed: ${res.status}`);
    return res.json();
  };

  try {
    // portal_jobs already does the session check and returns only that
    // customer's jobs, so reusing it means the access rule lives in one place
    // rather than being reimplemented here and drifting.
    const jobs = await rest('portal_jobs', { p_token: token });
    if (!Array.isArray(jobs)) {
      return json({ error: 'Session expired. Please sign in again.' }, 401);
    }

    // Collect every storage path this customer is entitled to see. Attachments
    // are held as JSON on the job, sometimes as a string, sometimes parsed.
    const allowed = new Set();
    const addFrom = (value) => {
      if (!value) return;
      let list = value;
      if (typeof list === 'string') {
        try { list = JSON.parse(list); } catch (e) { return; }
      }
      if (!Array.isArray(list)) return;
      for (const item of list) {
        if (!item) continue;
        if (item.file_path) allowed.add(String(item.file_path));
        const url = String(item.file_url || '');
        const marker = `/object/public/${BUCKET}/`;
        const at = url.indexOf(marker);
        if (at !== -1) {
          const tail = url.slice(at + marker.length).split('?')[0];
          try { allowed.add(decodeURIComponent(tail)); } catch (e) { allowed.add(tail); }
        }
      }
    };

    for (const job of jobs) {
      addFrom(job.portal_attachments);
      addFrom(job.attachments);
    }

    if (!allowed.has(path)) {
      // Not an error the customer can do anything about, and saying which
      // paths exist would leak more than it helps.
      console.warn('[portal-file] refused path for token', { path });
      return json({ error: 'Not found' }, 404);
    }

    const signRes = await fetch(
      `${SUPABASE_URL}/storage/v1/object/sign/${BUCKET}/${encodeURI(path)}`,
      {
        method: 'POST',
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ expiresIn: SIGNED_URL_SECONDS })
      }
    );

    if (!signRes.ok) {
      const detail = await signRes.text();
      console.error('[portal-file] sign failed', signRes.status, detail);
      return json({ error: 'Could not open that file' }, 502);
    }

    const signed = await signRes.json();
    // The API returns a relative path like "/object/sign/documents/x?token=..."
    const relative = signed?.signedURL || signed?.signedUrl || '';
    if (!relative) {
      return json({ error: 'Could not open that file' }, 502);
    }

    return json({ url: `${SUPABASE_URL}/storage/v1${relative}` });
  } catch (err) {
    console.error('[portal-file] error:', err);
    return json({ error: 'Could not open that file' }, 500);
  }
}
