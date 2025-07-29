export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Just return the hardcoded token for now
  if (req.method === 'GET') {
    return res.json({ 
      accessToken: 'eyJraWQiOiI0S0dUamZjeExqTll3WnNQYko2ZGdmNWYtTHRvWkpqdnBUdnNIbFJxRl9rPSIsImFsZyI6IlJTNTEyIn0.eyJqdGkiOiJkMjE1ODI3ZC00ZWJhLTQ5MDQtOGI2My0xNDQwMzlmZWUzMzMiLCJpYXQiOjE3NTM3OTAwODksImV4cCI6MTc1Mzc5MDM4OSwiaXNzIjoib2F1dGguYXdzLnNiYy1hY2NvdW50aW5nLnNhZ2UuY29tIiwic3ViIjoiOWVjNjFhMjYtMzRiZi00ODEzLWExOWItMjBhYzRkMmZhYzY5IiwiYXVkIjoiYXBpLnNiYy1hY2NvdW50aW5nLnNhZ2UuY29tIiwiYXpwIjoiYTMwZWI3MTctMzkyYS1jMDA4LWY4NzItOTc1MWEyYjIwY2Q3L2E5Y2M4NjZlLWFiZWEtNDY4NC04NWY4LTQ0N2E3NjQ4NGJjMSIsImNvdW50cnkiOiJHQiIsInNjb3BlcyI6ImFjY291bnRpbmc6cncgY29yZTpydyIsInVzYWdlX3BsYW5fY29kZSI6ImV4dGVybmFsIn0.NmOq1_HFj3K5efXhh5-pNQuat1uwO40sZy1KY17liKpzPwLSZejkA65lhERYY-c0tUn5hXN7Fa_EJlab-NxSAM2UHDRwy1f2jccAX-qCb_pfldAOAcIn2cVmoE1QwPHWJlOl46vp2jXNynrjavXTsZQqxNa99r8TdMP7yyJU0J8PZ_BTbickvkYvNPaQmPB56Opba6LmiFlc38N_wX0ItxOp8l7WJykq1EyMYjToHACBGfJHBR68Iaz91u_1gLlpqgC6O5M0K5A0woVA4lh_FgiFGgBgwRp5kT26rXlaCwM388kbKwTxR67F-VGMqdiH8tY4RQ2EvRB-JVBucf9VZp7mdNPtrJLSQNH222QeHT3rvAt9MSGJGUo5CS_dqbjHk49cpB7yFjUKgsE-Ah4Sc6WZlRMWzK-Lwlm7c-uAMAGg8N3IMi8j0557rixpXj1ZaHz_jqULfbiHilD5OLNjL2ziaoUWtXj2xJKfk7PyN5gSELRUJ74xkUQEn0jv4t6pQpsZDkedpEm8qqUpFrQmq5JOveRSKvOlf4gdeS_Oql9UgMgGrlB687I1CgnXOpovJXigpKiTa0wT8KZQNTwRNF81I-dX-L4lHhKKgb4Su9pJg-buLZYFAeaRb00kjHclrvN4MviIAQVoiqiZOLJILn8-rsRrKBstKl1iUEbf10U'
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
