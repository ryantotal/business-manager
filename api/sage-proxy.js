export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { endpoint, method = 'GET', body } = req.body || {};

  const tokenResponse = await fetch(`https://${req.headers.host}/api/sage-token`);
  
  if (!tokenResponse.ok) {
    return res.status(401).json({ error: 'No valid token available' });
  }

  const { access_token } = await tokenResponse.json();

  try {
    const sageResponse = await fetch(`https://api.accounting.sage.com/v3.1/${endpoint}`, {
      method,
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    });

    const data = await sageResponse.json();
    res.status(sageResponse.status).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}