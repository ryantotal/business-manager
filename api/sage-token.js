let tokens = {
  access_token: 'eyJraWQiOiI0S0dUamZjeExqTll3WnNQYko2ZGdmNWYtTHRvWkpqdnBUdnNIbFJxRl9rPSIsImFsZyI6IlJTNTEyIn0.eyJqdGkiOiIxZTRiY2ZlNC1iY2M1LTQ3MjgtYmFjMC0yNmY1YjcwZjRkN2EiLCJpYXQiOjE3NTM4MDAxNjksImV4cCI6MTc1MzgwMDQ2OSwiaXNzIjoib2F1dGguYXdzLnNiYy1hY2NvdW50aW5nLnNhZ2UuY29tIiwic3ViIjoiOWVjNjFhMjYtMzRiZi00ODEzLWExOWItMjBhYzRkMmZhYzY5IiwiYXVkIjoiYXBpLnNiYy1hY2NvdW50aW5nLnNhZ2UuY29tIiwiYXpwIjoiYTMwZWI3MTctMzkyYS1jMDA4LWY4NzItOTc1MWEyYjIwY2Q3L2E5Y2M4NjZlLWFiZWEtNDY4NC04NWY4LTQ0N2E3NjQ4NGJjMSIsImNvdW50cnkiOiJHQiIsInNjb3BlcyI6ImFjY291bnRpbmc6cncgY29yZTpydyIsInVzYWdlX3BsYW5fY29kZSI6ImV4dGVybmFsIn0.tseicrvLv86KEEoSkSbKon8mWXnvUC9qhHVxKbkNbMRMjSzNK_uCP7SCEVSb8CIL7nb6rIXlm0LylOjtqxRHXb6UpSXPq6-ckytbz_h1J_n36eMk2PlnF-OPsKSFkX9xQlvb9C-K_6j5MvgcZrRHQhhYeA_I_tw_xGtdm7j4rQFev7Siue7eJW-B2MwS7Qh4CnOlQEhMGlcabER1Vpb_6CzpfGoP_uM-dj623-VGJYUtxdzIHLbWcnov0uQTiqLKtyrPZyBvOX8olAwvTKGjB0fi1ZZ5H9huSvp7lTvjXn42WOciPs_LyagB4Hq5s3S2ompbNf31mU8FVpIVcb2f2cco6X7u3dWLCUxnioBJ0wJvTy5X-9dq-Ua-rqTDJ43WuylIgWIZrDljNyYnzhjeK2BPa68qIC8XGSWlcbOdTu2L1oS9MSSVnd5mIYNG1KJKdQNK1mmEUTXbLxMQgpmBPvRswxB3lg4OyP5oihdPDQXYUSBfaRmR3xLWSPO_JXcA0-8pyFbZHTSOYCOe_21mfiLx9Pb9S6k0nSkSiroY2y4B6-MoFqCkDInSzqSD1xliILD7YYu3J-cSE26b1cewVQfIW-5GLZQLz4hRiQZpFz0ZstToVzT7tcxkkE8aY35ZbYKaYBnvsjO6O__GiteA5vNJWRdXgwYdVZVfIKQsmnY',
  refresh_token: 'eyJraWQiOiI0S0dUamZjeExqTll3WnNQYko2ZGdmNWYtTHRvWkpqdnBUdnNIbFJxRl9rPSIsImFsZyI6IlJTNTEyIn0.eyJqdGkiOiJiYjgzZTY4MS05MTMwLTQ2NGEtYjdlOC03MjZjOTk0MzVkZmQiLCJpYXQiOjE3NTM4MDAxNjksImV4cCI6MTc1NjQ3ODU2OSwiaXNzIjoib2F1dGguYXdzLnNiYy1hY2NvdW50aW5nLnNhZ2UuY29tIiwic3ViIjoiOWVjNjFhMjYtMzRiZi00ODEzLWExOWItMjBhYzRkMmZhYzY5IiwiYXVkIjoib2F1dGguYXdzLnNiYy1hY2NvdW50aW5nLnNhZ2UuY29tIiwiYXpwIjoiYTMwZWI3MTctMzkyYS1jMDA4LWY4NzItOTc1MWEyYjIwY2Q3L2E5Y2M4NjZlLWFiZWEtNDY4NC04NWY4LTQ0N2E3NjQ4NGJjMSIsImNvdW50cnkiOiJHQiIsInNjb3BlcyI6ImFjY291bnRpbmc6cncgY29yZTpydyIsInVzYWdlX3BsYW5fY29kZSI6ImV4dGVybmFsIn0.wtOQcVwZjE5Xig6oR03s8YBCGnDnptsujpcUd0IksTp3hfajnU_K0yGenKTBsqOQO5TKtr8SletYHYMa3ecya3_b31CxdOdlJAVUhPr141io4HhTKgOc7jH-U5FgZTsdDen0b-yHequ-bh5m9iYQO02kqwyo5fV0x3E5XYTMpTxJ5WPtrBwQaXjl9FwxENMiluo5_3fCLOZqg9yhvrx1AFUwCaFzrwhSYZ7R6CIgCH03YEfb3TFeCP6slfjyuFebFj8NkAjV8NmCynnTkYk3-3CIc4-3kjU-TISYBahgOoPxBc3glwm0aWNrNJkhoN8-ONp93L9ZvRAAhuG_3r_Nc8Q2Bm1iLHbsCFutd9mm4HxTfRKmsUZMCL9ZCi4O-07FJV6AylPGxrgVrSlAUzZhperX7FL3RmDMCLer5Zfstj-pF6bZnd4FRpDunNPzcti5BOT0ntxh9fd1ycdEBbdRZqB8Miy-nl6Ft-NiLXJGX9oQOML69UB0aSWrDYTnAmHEBEp0pLKtOnUqJrvHxx5rjh2jgg-M0XkFdeTGBWQu3oeGgxgBi_XramwX_gJP2pgZllM-JnXXLPwa1vgu2rgM7nnEkwm9qzQ-VLW4xcqfUXNdhA8AxRSAj8FKgGKH2s9l_z_t6OnDqGjQtAp7h5a7Hq3HnNS_J_xpKRyn8mPL8To',
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
    // If token is expired and we have a refresh token, try to refresh
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

    // Return the current access token
    return res.json({ 
      accessToken: tokens.access_token,
      expiresAt: tokens.expires_at
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
