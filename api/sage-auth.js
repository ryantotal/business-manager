export default async function handler(req, res) {
  const clientId = 'a30eb717-392a-c008-f872-9751a2b20cd7/a9cc866e-abea-4684-85f8-447a76484bc1';
  const redirectUri = 'https://portal.totalwasteservicesltd.com/api/sage-callback';
  
  const authUrl = `https://www.sageone.com/oauth2/auth?client_id=${encodeURIComponent(clientId)}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=full_access&state=${Math.random().toString(36).substring(7)}`;
  
  console.log('Auth URL:', authUrl); // This will show in Vercel logs
  res.redirect(authUrl);
}
