let tokens = {
  access_token: 'eyJraWQiOiI0S0dUamZjeExqTll3WnNQYko2ZGdmNWYtTHRvWkpqdnBUdnNIbFJxRl9rPSIsImFsZyI6IlJTNTEyIn0.eyJqdGkiOiI4N2RhMDAzZi04YzNjLTQ5YjctYWYwYy03MWE3Y2ZhMzYxZmIiLCJpYXQiOjE3NTM3NzQ3NDEsImV4cCI6MTc1Mzc3NTA0MSwiaXNzIjoib2F1dGguYXdzLnNiYy1hY2NvdW50aW5nLnNhZ2UuY29tIiwic3ViIjoiOWVjNjFhMjYtMzRiZi00ODEzLWExOWItMjBhYzRkMmZhYzY5IiwiYXVkIjoiYXBpLnNiYy1hY2NvdW50aW5nLnNhZ2UuY29tIiwiYXpwIjoiYTMwZWI3MTctMzkyYS1jMDA4LWY4NzItOTc1MWEyYjIwY2Q3L2E5Y2M4NjZlLWFiZWEtNDY4NC04NWY4LTQ0N2E3NjQ4NGJjMSIsImNvdW50cnkiOiJHQiIsInNjb3BlcyI6ImFjY291bnRpbmc6cncgY29yZTpydyIsInVzYWdlX3BsYW5fY29kZSI6ImV4dGVybmFsIn0.P4l8g_FFM5hrvhg81pappvknhyjxJUiWVWJJQAIZQ1PHYyfwSGNQ6sfMoAfWyqvxU0IpxnkD6gsyr0pAyAz4kQoT8msGDpXmgA2-lY8CnwKB01MwMAwIuhaDdVo5PpCqa1XViVhm5i3d2kcJLsOmNUyP885VvtqA1UB3PGmrXrL7FNGBWegrVBnS-ScESIdzxR8JbVp2jCJW6Fyqj0BWTemCyDNNStsz5GKQCnpU3EfFUMNuD2Peeg-3-V9Wdg2ulDVInQLzLy-KvJPm2hDLk1GUxPON85wQi_jR2jCrwbDqWyp0Py4aUkpHWot2VA8g8GDaRkAcdFss75T58hl7YgMyJShJFsSpByTNg5cskvMqfRtoTwHdKREn0CeYt4Owbx4bLSLntlkkP9Klx9fz2Ev719IMGXXpEYl72jIlLsMJTiAfRAJS3kFzOZo4jET7sx9E5td5hRLhDYGd_uJIMPxYUxOhmM7tEifVv7AhNs4xEC4_l5-DKI-Sjrr_z4LQpghanVOSq90h6NSr9ZDRSBb8oGTo2Ql_SYWBznEY6sigsWWNs8e7Js8kC-rRgdhunPKpC0yBtZFlPyLEdSG9i5oHGt-4KAxFMp9DUk1kyX2NYRuTuEagb3WKgAJGG961fvQZG5684M6fua5j20JoY34NaYAoRVUFFnUmIQwvbL4',
  refresh_token: 'eyJraWQiOiI0S0dUamZjeExqTll3WnNQYko2ZGdmNWYtTHRvWkpqdnBUdnNIbFJxRl9rPSIsImFsZyI6IlJTNTEyIn0.eyJqdGkiOiJhZWM4MGE0My01OGNjLTQ2MDYtODY1NS1mOTMxNTNmMTBkZTMiLCJpYXQiOjE3NTM3NzQ3NDEsImV4cCI6MTc1NjQ1MzE0MSwiaXNzIjoib2F1dGguYXdzLnNiYy1hY2NvdW50aW5nLnNhZ2UuY29tIiwic3ViIjoiOWVjNjFhMjYtMzRiZi00ODEzLWExOWItMjBhYzRkMmZhYzY5IiwiYXVkIjoib2F1dGguYXdzLnNiYy1hY2NvdW50aW5nLnNhZ2UuY29tIiwiYXpwIjoiYTMwZWI3MTctMzkyYS1jMDA4LWY4NzItOTc1MWEyYjIwY2Q3L2E5Y2M4NjZlLWFiZWEtNDY4NC04NWY4LTQ0N2E3NjQ4NGJjMSIsImNvdW50cnkiOiJHQiIsInNjb3BlcyI6ImFjY291bnRpbmc6cncgY29yZTpydyIsInVzYWdlX3BsYW5fY29kZSI6ImV4dGVybmFsIn0.X1cZczr6tu9yhsyC2OR4QfakUQ3GlFt_QcQHOykVFGubODtyMMB6SLvu6xTmOkea8XW9rrURrSCFLhJ51BBWnMPNZCl08-FJOq7NMCMw8JCsJHR-s5ybQV_PObqNqRmTmlJV6NZgT4ocyBjO_uhWI3fayy791fljyRFXuVENGngmxfAnH_DTs7MjcJev-jy-p2YZukSlm0cNce1R8dqR27RVuSYJiH3cuvm8sgBaDfXduWDHrtv2inoYl_hVcRdCAw1w-oaX1CuJgnfTXqh7vzdabq3_QFTgKnhk7fgXwdGRi0V3v8NTvrVspH9-XZTo7WjYMZf3OqGrXlvo8J9ZAdD3q9DmRGHklKuzTu87_LUeBdj-q1yrDY7lbwi0qViikS89Z_m-HgC4Zzva4y4dBiU66vU8u7Qw6ZppFmqAVXNWwWR2zykka-RLn-vGo_Kwkx0lJa_5wyPqSlYz5s7we9y97FNOTzJykWhBVlGWI1uj8AyaFaNGi201Ytd4MApdRgtin3HzAhMEnJGwOccGKnBcF1mT8oFzWbxF2IL_Pdelx-6ZrI_-S5hL0tNwngzySg8ReMoW1_ZJEpoeEoTY6aPCgoo3ZU8lVJ-JtQBbQYYcO3D5NhMyGzwZKqQuBbSJIXJUoK6PhbN5oUBLq9Bz13wuPijsd3_WNP7Uf0a_NOw',
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