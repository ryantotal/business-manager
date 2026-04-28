# TWS Portal — auto-update package

Everything in this folder is already in the correct structure.
Just drop these files into your GitHub repo (`ryantotal/business-manager`) at the **root**.

## What to do

1. **In GitHub, delete the existing `service-worker.js` from your repo root.**
   (The old one — the one you originally pasted into chat. We're replacing it with a different setup.)

2. **Upload the contents of this folder to your repo root.**

   When you're done, your repo should contain:
   - `index.html`  (replaces the old one)
   - `service-worker.js.template`  (new file)
   - `vercel.json`  (new file)
   - `api/service-worker.js`  (new file inside a new folder called `api`)

3. **Commit. Vercel auto-deploys.**

## How to verify it worked

After Vercel finishes deploying:

1. Open `https://portal.totalwasteservicesltd.com/service-worker.js` in any browser
2. You should see JavaScript code containing a line like
   `const CACHE_VERSION = 'tws-portal-abc123def456';`
   (with a real commit SHA, not the literal text `__DEPLOY_ID__`)
3. If you see `__DEPLOY_ID__` instead of a SHA, the edge function isn't running — message me back

## How auto-updates work from now on

- You push code to GitHub → Vercel deploys
- Customer opens the home-screen app → silent SW update check
- Small "New version available — Refresh" toast appears
- They tap Refresh (or just close and reopen the app later) → they're on the new version

You don't have to bump version numbers, edit anything, or tell customers anything.
Set and forget.

You can delete this README from the repo after committing — it's just for setup.
