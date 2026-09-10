// Staff account administration.
//
// Creating a login and changing someone else's password both require the
// service role key, which must never reach the browser. So they happen here.
//
// Every request is checked twice: the caller must present a valid session, and
// that session must belong to an owner account. Being signed in is not enough —
// otherwise any member of staff could reset the owner's password.
//
// Needs SUPABASE_SERVICE_ROLE_KEY and SUPABASE_URL set in the Vercel project.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return res.status(500).json({ error: 'Server is not configured for account administration.' });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  // --- who is asking, and are they allowed? --------------------------------
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Not signed in.' });

  const { data: caller, error: callerError } = await admin.auth.getUser(token);
  if (callerError || !caller || !caller.user) {
    return res.status(401).json({ error: 'Session not recognised.' });
  }

  const { data: callerProfile } = await admin
    .from('users')
    .select('is_super_admin')
    .ilike('email', caller.user.email)
    .maybeSingle();

  if (!callerProfile || callerProfile.is_super_admin !== true) {
    return res.status(403).json({ error: 'Only the account owner can do this.' });
  }

  const { action, email, name, role, phone, password, userId } = req.body || {};

  try {
    // --- create a member of staff ------------------------------------------
    if (action === 'create') {
      if (!email || !password || !name) {
        return res.status(400).json({ error: 'Name, email and password are required.' });
      }
      if (String(password).length < 8) {
        return res.status(400).json({ error: 'Use at least 8 characters.' });
      }

      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email: String(email).trim(),
        password: password,
        email_confirm: true
      });
      if (createError) return res.status(400).json({ error: createError.message });

      const { error: profileError } = await admin.from('users').insert([{
        email: String(email).trim(),
        name: name,
        role: role || 'BROKER',
        phone: phone || null
      }]);

      if (profileError) {
        // A login with no profile can sign in but has no permissions and no
        // identity in the app. Undo rather than leave that lying around.
        await admin.auth.admin.deleteUser(created.user.id);
        return res.status(400).json({ error: 'Could not create the profile: ' + profileError.message });
      }

      return res.status(200).json({ ok: true });
    }

    // --- set someone's password --------------------------------------------
    if (action === 'reset-password') {
      if (!userId || !password) {
        return res.status(400).json({ error: 'User and password are required.' });
      }
      if (String(password).length < 8) {
        return res.status(400).json({ error: 'Use at least 8 characters.' });
      }

      const { data: target, error: targetError } = await admin
        .from('users').select('email').eq('id', userId).maybeSingle();
      if (targetError || !target) return res.status(404).json({ error: 'User not found.' });

      // The auth account is matched by email, which is the only link between
      // the two tables.
      const { data: list, error: listError } = await admin.auth.admin.listUsers();
      if (listError) return res.status(500).json({ error: listError.message });
      const authUser = (list.users || []).find(
        u => (u.email || '').toLowerCase() === String(target.email).toLowerCase()
      );
      if (!authUser) {
        return res.status(404).json({ error: 'No login exists for ' + target.email + ' yet.' });
      }

      const { error: updateError } = await admin.auth.admin.updateUserById(authUser.id, {
        password: password
      });
      if (updateError) return res.status(400).json({ error: updateError.message });

      return res.status(200).json({ ok: true });
    }

    // --- remove a member of staff ------------------------------------------
    if (action === 'delete') {
      if (!userId) return res.status(400).json({ error: 'User is required.' });

      const { data: target } = await admin
        .from('users').select('email, is_super_admin').eq('id', userId).maybeSingle();
      if (!target) return res.status(404).json({ error: 'User not found.' });
      if (target.is_super_admin === true) {
        return res.status(400).json({ error: 'Owner accounts cannot be deleted here.' });
      }

      const { data: list } = await admin.auth.admin.listUsers();
      const authUser = (list.users || []).find(
        u => (u.email || '').toLowerCase() === String(target.email).toLowerCase()
      );
      if (authUser) await admin.auth.admin.deleteUser(authUser.id);
      await admin.from('users').delete().eq('id', userId);

      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Unknown action.' });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
};
