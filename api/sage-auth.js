export default async function handler(req, res) {
  const authUrl = `https://www.sageone.com/oauth2/auth?client_id=${process.env.SAGE_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(process.env.SAGE_REDIRECT_URI)}&scope=full_access&state=${Math.random().toString(36).substring(7)}`;
  res.redirect(authUrl);
}