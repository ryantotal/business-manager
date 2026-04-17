export default function handler(req, res) {
  const { user_id, user_email } = req.query;
 
  const params = new URLSearchParams({
    client_id: process.env.GMAIL_CLIENT_ID,
    redirect_uri: process.env.GMAIL_REDIRECT_URI,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/gmail.send',
    access_type: 'offline',
    prompt: 'consent',
    state: JSON.stringify({ user_id, user_email }),
  });
 
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}
 
