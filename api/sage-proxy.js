let tokens = {
  access_token: 'eyJraWQiOiI0S0dUamZjeExqTll3WnNQYko2ZGdmNWYtTHRvWkpqdnBUdnNIbFJxRl9rPSIsImFsZyI6IlJTNTEyIn0.eyJqdGkiOiIwNDU2MzAwZC0yNzE3LTRmZGQtOGYzZS03ZGRhMzQ5NmQ5ZmEiLCJpYXQiOjE3NTM4MTgzNjcsImV4cCI6MTc1MzgxODY2NywiaXNzIjoib2F1dGguYXdzLnNiYy1hY2NvdW50aW5nLnNhZ2UuY29tIiwic3ViIjoiOWVjNjFhMjYtMzRiZi00ODEzLWExOWItMjBhYzRkMmZhYzY5IiwiYXVkIjoiYXBpLnNiYy1hY2NvdW50aW5nLnNhZ2UuY29tIiwiYXpwIjoiYTMwZWI3MTctMzkyYS1jMDA4LWY4NzItOTc1MWEyYjIwY2Q3L2E5Y2M4NjZlLWFiZWEtNDY4NC04NWY4LTQ0N2E3NjQ4NGJjMSIsImNvdW50cnkiOiJHQiIsInNjb3BlcyI6ImFjY291bnRpbmc6cncgY29yZTpydyIsInVzYWdlX3BsYW5fY29kZSI6ImV4dGVybmFsIn0.Y852anee5iMe5Y94JCDGxcoJyCYabmg3m3lWznGeSCMgz-A6fzy82U8b5HbNckWpEH2daKkr6d_2Mr0mQOQX62tAh0YBLEpjPJMheHxIH6N4R9BqwSyBfEqnMIz-ZZ3ta1wRpSCueZGp07QzrM6DY4rHnqrbJdRy01UX807x7TuddW6Kaq9y7_spyPruxbaLhN_mcvZaJO6bJbndWSQzzHWrGmdzqMXT1oymA1TEs5_jxhbCWUAUJ7Eu5N94sGrBtkQvlC7FGwMfQ3bixA7tf_UkTlUPYZdfjIUCCwQoX1cEqcJE1AKe5wWmxXnCfhxMQcUnGijQZCviZdZtEbFVpuLxI6TbuWNy-bYIVrcgWwTFmeb_4MErVjxee6VT3R5QXT6FOW0nkd2kE_7O8AGEeFA9lbfc8LwSJe4hzu02lgVelCJ-6dyhQ4AaMjvrmYXS0M0f1gawr3Dsyh9V70XPrL1jQpRHgKiqUVcCjTlPgvCVHHgH1crdEmpf7Mf98IfU2SvYMfA_AtCPBU0uvK02g4v9UuVVF0RNC1tTgcvm7gr-A6KqfYLhOLxFjZpssyJWltz0mOHL-csUd1Whs5AD3r59YqXoTi4yUzBuIh875m_9F4W61K-d_4fSnCyCUu8kLLen5biy5GtsyMH5IcT4qu7rKTvRQ52H0rHNzFbfboU',
  refresh_token: 'eyJraWQiOiI0S0dUamZjeExqTll3WnNQYko2ZGdmNWYtTHRvWkpqdnBUdnNIbFJxRl9rPSIsImFsZyI6IlJTNTEyIn0.eyJqdGkiOiIxYmZkZTllMy03NTA1LTQ3YWQtOGE1Yy1iNDRmMjdiNjlmYWYiLCJpYXQiOjE3NTM4MTgzNjcsImV4cCI6MTc1NjQ5Njc2NywiaXNzIjoib2F1dGguYXdzLnNiYy1hY2NvdW50aW5nLnNhZ2UuY29tIiwic3ViIjoiOWVjNjFhMjYtMzRiZi00ODEzLWExOWItMjBhYzRkMmZhYzY5IiwiYXVkIjoib2F1dGguYXdzLnNiYy1hY2NvdW50aW5nLnNhZ2UuY29tIiwiYXpwIjoiYTMwZWI3MTctMzkyYS1jMDA4LWY4NzItOTc1MWEyYjIwY2Q3L2E5Y2M4NjZlLWFiZWEtNDY4NC04NWY4LTQ0N2E3NjQ4NGJjMSIsImNvdW50cnkiOiJHQiIsInNjb3BlcyI6ImFjY291bnRpbmc6cncgY29yZTpydyIsInVzYWdlX3BsYW5fY29kZSI6ImV4dGVybmFsIn0.RFTKca9MKmqGDHYGKl-b9-SHNr0dk6Mv-IuM-ErL3_U5DX_R4SHQFuYCFmdryCZiw6u7mdmrN6vIzvpu65VeA4eObLsLBvb-cagacKriqlEG0GXlegV_wwXi2VJMxOLBUIoAp9qjzW39uSFtEwkvpKx58VSSOgBwPASo-XzL98ywDs5AnJwPhMG7jVx4Yfi8ReUhbMJG_6It1mxFs3XsiT-GNMsXDIpxhM28mCeYrP6I0Dw6L0YBTAfqSTLXdyay8MLZ7bD2KZ8udk_EnCiHBgstpMJNJmg9xE2i-P7iggvbtIGi24mU_uB_IdjVp-qtywzFJbGhivPrxhiOUV-43Kg-h0zGm--JpHSqWt8PPSBUvU2f0apMvutNodbiFEG3sfiY7FAXTMg65zliEHv-EjXVzYDUyAGuV3Lizun10Q7fRW8zEqhL21GC2xwCv5pp_7u2WdWcB6BSYczzbuTy5UvcKMUmyAGyoREKo9wm1yw0NO3ElDqr8_RJ8BBGuJ-SdYafPibtPDUkWzQdHoae_k9yKPgSsZ6eBbD2Mq3Pi-5WuVry8k5YHH-icFQizMA3C5zpsDmA6fGEDy-4Gcz3CzIqmvYkOnohT-gs6OsHDyyx-0a7FLTmtYpbau2rMPPVXQVfGuvoPDq4RfJG0xcA97mbLhfvwPWOr16ZVPuiS2I',
  expires_at: Date.now() + 300000
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { endpoint, method = 'GET', body } = req.body || {};

  // Check if token needs refresh
  if (Date.now() >= tokens.expires_at && tokens.refresh_token) {
    try {
      const response = await fetch('https://oauth.accounting.sage.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: 'a30eb717-392a-c008-f872-9751a2b20cd7/a9cc866e-abea-4684-85f8-447a76484bc1',
          client_secret: 'pc#GLx$N1Q2,z^^F0#-{',
          refresh_token: tokens.refresh_token
        })
      });

      if (response.ok) {
        const data = await response.json();
        tokens.access_token = data.access_token;
        tokens.refresh_token = data.refresh_token || tokens.refresh_token;
        tokens.expires_at = Date.now() + (data.expires_in * 1000);
      }
    } catch (error) {
      console.error('Token refresh failed:', error);
    }
  }

  try {
    const sageResponse = await fetch(`https://api.accounting.sage.com/v3.1/${endpoint}`, {
      method,
      headers: {
        'Authorization': `Bearer ${tokens.access_token}`,
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
