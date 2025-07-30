export default async function handler(req, res) {
  const params = new URLSearchParams({
    client_id: 'a30eb717-392a-c008-f872-9751a2b20cd7/a9cc866e-abea-4684-85f8-447a76484bc1',
    response_type: 'code',
    redirect_uri: 'https://portal.totalwasteservicesltd.com/api/sage-callback',
    scope: 'full_access',
    state: Math.random().toString(36).substring(7),
    filter: 'apiv3.1',
    country: 'gb'
  });
  
  const authUrl = `https://www.sageone.com/oauth2/auth?${params.toString()}`;
  
  res.status(200).json({
    generatedUrl: authUrl,
    paramsString: params.toString(),
    hasRedirectUri: params.toString().includes('redirect_uri'),
    redirectUriValue: params.get('redirect_uri')
  });
}