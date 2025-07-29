export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { endpoint, method = 'GET', body } = req.body || {};
  const authHeader = req.headers.authorization;

  if (!authHeader || !endpoint) {
    return res.status(400).json({ error: 'Missing authorization or endpoint' });
  }

  try {
    const sageResponse = await fetch(`https://api.accounting.sage.com/v3.1/${endpoint}`, {
      method,
      headers: {
        'Authorization': authHeader,
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