export default async function handler(req, res) {
  const { code, state, error } = req.query;
  
  // Handle any OAuth errors from Sage
  if (error) {
    return res.redirect(`/?sage_error=${encodeURIComponent(error)}`);
  }
  
  // Check if we have an authorization code
  if (!code) {
    return res.redirect('/?sage_error=no_authorization_code');
  }
  
  // Redirect to the main page with the authorization code
  // The client-side JavaScript will handle the token exchange
  return res.redirect(`/?sage_code=${code}${state ? `&state=${state}` : ''}`);
}