export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { endpoint, method = 'GET', body } = req.body || {};

  try {
    // For now, using the hardcoded token you got from Postman
    // Later this should fetch from a database or use a proper token management system
    const accessToken = 'eyJraWQiOiI0S0dUamZjeExqTll3WnNQYko2ZGdmNWYtTHRvWkpqdnBUdnNIbFJxRl9rPSIsImFsZyI6IlJTNTEyIn0.eyJqdGkiOiI2M2EyMGM5Mi1hZmU3LTRlZmEtYTgxZS0wOGM3ZmZlODYwYWIiLCJpYXQiOjE3NTM5MDEzOTQsImV4cCI6MTc1MzkwMTY5NCwiaXNzIjoib2F1dGguYXdzLnNiYy1hY2NvdW50aW5nLnNhZ2UuY29tIiwic3ViIjoiOWVjNjFhMjYtMzRiZi00ODEzLWExOWItMjBhYzRkMmZhYzY5IiwiYXVkIjoiYXBpLnNiYy1hY2NvdW50aW5nLnNhZ2UuY29tIiwiYXpwIjoiYTMwZWI3MTctMzkyYS1jMDA4LWY4NzItOTc1MWEyYjIwY2Q3L2E5Y2M4NjZlLWFiZWEtNDY4NC04NWY4LTQ0N2E3NjQ4NGJjMSIsImNvdW50cnkiOiJHQiIsInNjb3BlcyI6ImFjY291bnRpbmc6cncgY29yZTpydyIsInVzYWdlX3BsYW5fY29kZSI6ImV4dGVybmFsIn0.Ruu4xJPxE-JBTClL0WtUYse41nooO03xbGzg0K0Rc68bvt7cdrLuE31Nr6PscSv44xFEhDVduAWMy-cFwiUdTobT6Xb3dePZ8opgoCDsjwJYu0BBSAB3gGUZeU_1yCvGPpWyBr5dPC4Bt9UbKRTcM0FCo1y4WOAmmTQ6WSIQeOSoSvUp5myafc3105h7hG530Ql9mBhbn32-BrA4N_WnkSzjL929MiF975w8fZ_otzx75tuUhtcGi_Aqsrq81Eur_-EQuTvnCAI1_slejpfqc26zkOgxvlnzr99SZLK1k7UDOwOAMHKSm8vxgTjxm5hnpWtFEgFMsbTd15NteLQjGR1GB0v6vydXfeTOQykAknofXwQak_SXUav4vVosvIZwFL7S34ySUXDdbjQuNce517qS58MLump1QY_BSKBkrMOuA5xbFfrWhHpKMWwet_QMk_-Xxuo2voc99oJl351Q-3j-3MnR87x-kCsTrGZIidx0kIrhtUdJJdQ9YSmJUgfy5OHQ1Gbe4_vt5POakxQgNRdBET14kmKf0HQX__Vn4gT6a_ulMJ0slz9Q_sK8bEJlmGXlL3-nwKJax_OijYWiQmcZL3wp_z8pqQpJt2Qb88YkZk6frrXbbnXvv4N3XdsY8uLrrrN_JuwPr6CIQzstwrixwaPwAd3BIB5jmX_N3lc';

    const sageResponse = await fetch(`https://api.accounting.sage.com/v3.1/${endpoint}`, {
      method,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
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