export default async function handler(req, res) {
  const clientId = 'a30eb717-392a-c008-f872-9751a2b20cd7/a9cc866e-abea-4684-85f8-447a76484bc1';
  const redirectUri = 'https://portal.totalwasteservicesltd.com/api/sage-callback';
  const state = Math.random().toString(36).substring(7);
  
  const authUrl = 
    `https://www.sageone.com/oauth2/auth/central?` +
    `filter=apiv3.1&` +
    `response_type=code&` +
    `client_id=${encodeURIComponent(clientId)}&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `scope=full_access&` +
    `state=${state}`;
  
  console.log('Final auth URL:', authUrl);
  res.redirect(authUrl);
}
