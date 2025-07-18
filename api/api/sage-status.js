export default async function handler(req, res) {
  // Get stored access token from database
  const token = process.env.SAGE_CLIENT_SECRET;
  
  res.status(200).json({ 
    connected: !!token,
    message: token ? 'Sage connection configured' : 'Sage not configured'
  });
}