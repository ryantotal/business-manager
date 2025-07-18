export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const { invoice } = req.body;
    
    // For now, simulate successful invoice creation
    // Real Sage API integration will be added once auth is working
    
    // Simulate a delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Return mock response
    res.status(200).json({
      success: true,
      sageInvoiceId: 'SAGE-INV-' + Date.now(),
      sageInvoiceNumber: 'INV' + Math.floor(Math.random() * 10000),
      message: 'Invoice created successfully in Sage (test mode)'
    });
    
  } catch (error) {
    console.error('Invoice creation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create invoice'
    });
  }
}