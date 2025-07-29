let tokens = {
  access_token: 'eyJraWQiOiI0S0dUamZjeExqTll3WnNQYko2ZGdmNWYtTHRvWkpqdnBUdnNIbFJxRl9rPSIsImFsZyI6IlJTNTEyIn0.eyJqdGkiOiJkMjE1ODI3ZC00ZWJhLTQ5MDQtOGI2My0xNDQwMzlmZWUzMzMiLCJpYXQiOjE3NTM3OTAwODksImV4cCI6MTc1Mzc5MDM4OSwiaXNzIjoib2F1dGguYXdzLnNiYy1hY2NvdW50aW5nLnNhZ2UuY29tIiwic3ViIjoiOWVjNjFhMjYtMzRiZi00ODEzLWExOWItMjBhYzRkMmZhYzY5IiwiYXVkIjoiYXBpLnNiYy1hY2NvdW50aW5nLnNhZ2UuY29tIiwiYXpwIjoiYTMwZWI3MTctMzkyYS1jMDA4LWY4NzItOTc1MWEyYjIwY2Q3L2E5Y2M4NjZlLWFiZWEtNDY4NC04NWY4LTQ0N2E3NjQ4NGJjMSIsImNvdW50cnkiOiJHQiIsInNjb3BlcyI6ImFjY291bnRpbmc6cncgY29yZTpydyIsInVzYWdlX3BsYW5fY29kZSI6ImV4dGVybmFsIn0.NmOq1_HFj3K5efXhh5-pNQuat1uwO40sZy1KY17liKpzPwLSZejkA65lhERYY-c0tUn5hXN7Fa_EJlab-NxSAM2UHDRwy1f2jccAX-qCb_pfldAOAcIn2cVmoE1QwPHWJlOl46vp2jXNynrjavXTsZQqxNa99r8TdMP7yyJU0J8PZ_BTbickvkYvNPaQmPB56Opba6LmiFlc38N_wX0ItxOp8l7WJykq1EyMYjToHACBGfJHBR68Iaz91u_1gLlpqgC6O5M0K5A0woVA4lh_FgiFGgBgwRp5kT26rXlaCwM388kbKwTxR67F-VGMqdiH8tY4RQ2EvRB-JVBucf9VZp7mdNPtrJLSQNH222QeHT3rvAt9MSGJGUo5CS_dqbjHk49cpB7yFjUKgsE-Ah4Sc6WZlRMWzK-Lwlm7c-uAMAGg8N3IMi8j0557rixpXj1ZaHz_jqULfbiHilD5OLNjL2ziaoUWtXj2xJKfk7PyN5gSELRUJ74xkUQEn0jv4t6pQpsZDkedpEm8qqUpFrQmq5JOveRSKvOlf4gdeS_Oql9UgMgGrlB687I1CgnXOpovJXigpKiTa0wT8KZQNTwRNF81I-dX-L4lHhKKgb4Su9pJg-buLZYFAeaRb00kjHclrvN4MviIAQVoiqiZOLJILn8-rsRrKBstKl1iUEbf10U',
  refresh_token: 'eyJraWQiOiI0S0dUamZjeExqTll3WnNQYko2ZGdmNWYtTHRvWkpqdnBUdnNIbFJxRl9rPSIsImFsZyI6IlJTNTEyIn0.eyJqdGkiOiI2OTdjZDMxMS01MWE3LTQyODYtYmRkYS00NzAwMjU0MGZmYjEiLCJpYXQiOjE3NTM3OTAwODksImV4cCI6MTc1NjQ2ODQ4OSwiaXNzIjoib2F1dGguYXdzLnNiYy1hY2NvdW50aW5nLnNhZ2UuY29tIiwic3ViIjoiOWVjNjFhMjYtMzRiZi00ODEzLWExOWItMjBhYzRkMmZhYzY5IiwiYXVkIjoib2F1dGguYXdzLnNiYy1hY2NvdW50aW5nLnNhZ2UuY29tIiwiYXpwIjoiYTMwZWI3MTctMzkyYS1jMDA4LWY4NzItOTc1MWEyYjIwY2Q3L2E5Y2M4NjZlLWFiZWEtNDY4NC04NWY4LTQ0N2E3NjQ4NGJjMSIsImNvdW50cnkiOiJHQiIsInNjb3BlcyI6ImFjY291bnRpbmc6cncgY29yZTpydyIsInVzYWdlX3BsYW5fY29kZSI6ImV4dGVybmFsIn0.V71dnl4u8Te5mGCwHy8tYXOS-NY8kXgeMC6O2FWJAYi4GOXyFrJT0Tln8euWR0tAxejGUwxgJUHbWlEzIsL5gYLfsInfqoDE9FNESn7wanfA_7uJtwEHrefvk3ZFDWdO9VMU_c_Ia5OfYJiOsodtbmjqKVEByKjyBbSt45L1JbxXrhpg1rsiuo84M69RpgXmFRa1dv6toa2V2lEfnNrIgK0ah-A-XOI5zXcsMibiRHeaj3gA5SOckklG5beVEJ6jDUoOJK8te1rbZdgnVyblo0ftzT8UFZp6hhkJNoTKXzHbGXFfvcNQ2ldqxiYUu67oML7wQFDTcPiue3dujoPxQPKGmKWqG_8UBW5BR8RSB99AhrV60tiKXYMTYFdteRMw2vPC7HFI1L9q1V3VnRskKhkeQIWRKVFSa6r46QqjMs1_aGRa9lR6AWdgj6TERNeOqwDTCLu-AW9dRpRgEb45De7TE-EYJQ9XGQ1fSMjH_vvPOycHxjxhtKEB4C6iIfjhRp44it-WT10j3ZIkjFRgVe-rOSHJ9Xv_0KF-zq4G9EF7TII4kLaGA0phOVi03ulDpg1E0AbPRsthjVpguMqiKUkP7XxtVfCdkVGJBdeoITba6S9yME0hiJYsdUbxcaYrx05fSEsFlS2Bg4nR1zRegDCkSpc3D7RT-ZuckXdLcYQ',
  expires_at: Date.now() + 300000
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
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
          tokens = {
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            expires_at: Date.now() + (data.expires_in * 1000)
          };
        }
      } catch (error) {
        console.error('Token refresh failed:', error);
      }
    }
    return res.json({ access_token: tokens.access_token });
  }
}
