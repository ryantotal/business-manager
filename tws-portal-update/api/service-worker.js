// Vercel Edge Function: rewrites the static service-worker.js to inject a unique
// per-deploy version string. This is what makes auto-updating work for installed
// home-screen app users — every deploy gets a different SHA, the SW file bytes
// change, browsers notice and install the new SW.
//
// File location: /api/service-worker.js  (Vercel auto-routes /api/* to functions)
// vercel.json rewrites /service-worker.js → /api/service-worker so the SW is
// served from the correct (root) scope.

export const config = { runtime: 'edge' };

export default async function handler(request) {
  const url = new URL(request.url);
  // Fetch the raw SW file from our own deployment
  const res = await fetch(new URL('/service-worker.js.template', url.origin));
  let body = await res.text();

  // VERCEL_GIT_COMMIT_SHA is set by Vercel on every deploy. Falls back to a
  // build-time random ID if missing (e.g. preview deploys). Both change per deploy.
  const deployId = process.env.VERCEL_GIT_COMMIT_SHA
    || process.env.VERCEL_DEPLOYMENT_ID
    || Date.now().toString();

  body = body.replaceAll('__DEPLOY_ID__', deployId.substring(0, 12));

  return new Response(body, {
    headers: {
      'content-type': 'application/javascript; charset=utf-8',
      // SW files must NOT be cached aggressively — browsers re-check them, and
      // we need that check to actually hit our edge function.
      'cache-control': 'public, max-age=0, must-revalidate',
      'service-worker-allowed': '/'
    }
  });
}
