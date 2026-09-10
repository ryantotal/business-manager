// Staff account administration.
//
// Creating a login and changing someone else's password both require the
// service role key, which must never reach the browser. So they happen here.
//
// Runs on the edge runtime deliberately: Hobby plans allow only 12 Node.js
// serverless functions and the Sage endpoints already use them all. Edge has a
// separate allowance. The trade-off is no npm packages, so the Supabase calls
// below are plain fetch() against its REST and Auth endpoints.
//
// Every request is checked twice: the caller must present a valid session, and
// that session must belong to an owner account. Being signed in is not enough,
// or any member of staff could reset the owner's password.
//
// Needs SUPABASE_SERVICE_ROLE_KEY and SUPABASE_URL in the Vercel project.

export const config = { runtime: 'edge' };

// A trailing slash would produce a double slash in every path below.
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
// Verifying somebody's session token has to be done with the anon key, not the
// service key — Supabase rejects the pairing of a service key with a user's
// bearer token. Not a secret: it is already public in index.html.
const ANON_KEY = process.env.SUPABASE_ANON_KEY;

const json = (body, status) =>
  new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' }
  });

// Any call made with the service key. Bypasses every rule in the database,
// which is exactly why it only ever runs after the owner check below.
const admin = (path, options) =>
  fetch(SUPABASE_URL + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_KEY,
      Authorization: 'Bearer ' + SERVICE_KEY,
      ...(options && options.headers ? options.headers : {})
    }
  });

export default async function handler(req) {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
    // Name the missing ones. Reports presence only — no values are exposed,
    // and "which variable is unset" is not a secret worth protecting when the
    // alternative is guessing.
    const missing = [];
    if (!SUPABASE_URL) missing.push('SUPABASE_URL');
    if (!SERVICE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
    if (!ANON_KEY) missing.push('SUPABASE_ANON_KEY');
    return json({
      error: 'Server is not configured. Missing in Vercel: ' + missing.join(', ')
    }, 500);
  }

  // --- who is asking? ------------------------------------------------------
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return json({ error: 'Not signed in.' }, 401);

  const meRes = await fetch(SUPABASE_URL + '/auth/v1/user', {
    headers: { apikey: ANON_KEY, Authorization: 'Bearer ' + token }
  });
  if (!meRes.ok) return json({ error: 'Session not recognised.' }, 401);
  const me = await meRes.json();
  if (!me || !me.email) return json({ error: 'Session not recognised.' }, 401);

  // --- and are they allowed? -----------------------------------------------
  const profRes = await admin(
    '/rest/v1/users?select=is_super_admin&email=eq.' + encodeURIComponent(me.email)
  );
  const profile = profRes.ok ? await profRes.json() : [];
  if (!profile[0] || profile[0].is_super_admin !== true) {
    return json({ error: 'Only the account owner can do this.' }, 403);
  }

  let body = {};
  try { body = await req.json(); } catch (e) { body = {}; }
  const { action, email, name, role, phone, password, userId } = body;

  try {
    // --- create a member of staff ------------------------------------------
    if (action === 'create') {
      if (!email || !password || !name) {
        return json({ error: 'Name, email and password are required.' }, 400);
      }
      if (String(password).length < 8) {
        return json({ error: 'Use at least 8 characters.' }, 400);
      }

      const createRes = await admin('/auth/v1/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          email: String(email).trim(),
          password: password,
          email_confirm: true
        })
      });
      const created = await createRes.json();
      if (!createRes.ok) {
        return json({ error: created.msg || created.message || 'Could not create the login.' }, 400);
      }

      const profileRes = await admin('/rest/v1/users', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          email: String(email).trim(),
          name: name,
          role: role || 'BROKER',
          phone: phone || null
        })
      });

      if (!profileRes.ok) {
        // A login with no profile can sign in but has no identity in the app.
        // Undo rather than leave that lying around.
        await admin('/auth/v1/admin/users/' + created.id, { method: 'DELETE' });
        const err = await profileRes.text();
        return json({ error: 'Could not create the profile: ' + err }, 400);
      }

      return json({ ok: true });
    }

    // --- set someone's password --------------------------------------------
    if (action === 'reset-password') {
      if (!userId || !password) return json({ error: 'User and password are required.' }, 400);
      if (String(password).length < 8) return json({ error: 'Use at least 8 characters.' }, 400);

      const targetRes = await admin('/rest/v1/users?select=email&id=eq.' + encodeURIComponent(userId));
      const target = targetRes.ok ? await targetRes.json() : [];
      if (!target[0]) return json({ error: 'User not found.' }, 404);

      // The auth account is matched by email — the only link between the two.
      const listRes = await admin('/auth/v1/admin/users?per_page=200');
      const list = await listRes.json();
      const authUser = (list.users || []).find(
        u => (u.email || '').toLowerCase() === String(target[0].email).toLowerCase()
      );
      if (!authUser) return json({ error: 'No login exists for ' + target[0].email + ' yet.' }, 404);

      const updRes = await admin('/auth/v1/admin/users/' + authUser.id, {
        method: 'PUT',
        body: JSON.stringify({ password: password })
      });
      if (!updRes.ok) {
        const err = await updRes.json().catch(() => ({}));
        return json({ error: err.msg || 'Could not set the password.' }, 400);
      }
      return json({ ok: true });
    }

    // --- remove a member of staff ------------------------------------------
    if (action === 'delete') {
      if (!userId) return json({ error: 'User is required.' }, 400);

      const targetRes = await admin(
        '/rest/v1/users?select=email,is_super_admin&id=eq.' + encodeURIComponent(userId)
      );
      const target = targetRes.ok ? await targetRes.json() : [];
      if (!target[0]) return json({ error: 'User not found.' }, 404);
      if (target[0].is_super_admin === true) {
        return json({ error: 'Owner accounts cannot be deleted here.' }, 400);
      }

      const listRes = await admin('/auth/v1/admin/users?per_page=200');
      const list = await listRes.json();
      const authUser = (list.users || []).find(
        u => (u.email || '').toLowerCase() === String(target[0].email).toLowerCase()
      );
      if (authUser) await admin('/auth/v1/admin/users/' + authUser.id, { method: 'DELETE' });
      await admin('/rest/v1/users?id=eq.' + encodeURIComponent(userId), { method: 'DELETE' });

      return json({ ok: true });
    }

    return json({ error: 'Unknown action.' }, 400);
  } catch (e) {
    return json({ error: e.message || String(e) }, 500);
  }
}
