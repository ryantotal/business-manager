export default async function handler(req, res) {
  // Mock products/services data for testing
  // Real Sage API integration will be added once auth is working
  
  const mockProducts = [
    {
      id: '1',
      sageId: 'PROD001',
      name: 'SKIP-001',
      description: 'Skip Hire Service - Small',
      salesPrice: 150.00,
      purchasePrice: 100.00,
      category: 'Skip Hire',
      taxRate: 20,
      active: true,
      nominalCode: '4000',
      accountName: 'Skip Hire Income'
    },
    {
      id: '2',
      sageId: 'PROD002',
      name: 'WASTE-001',
      description: 'General Waste Collection',
      salesPrice: 75.00,
      purchasePrice: 50.00,
      category: 'Waste Services',
      taxRate: 20,
      active: true,
      nominalCode: '4001',
      accountName: 'Waste Collection Income'
    },
    {
      id: '3',
      sageId: 'PROD003',
      name: 'RECYCLE-001',
      description: 'Recycling Service',
      salesPrice: 60.00,
      purchasePrice: 40.00,
      category: 'Recycling',
      taxRate: 20,
      active: true,
      nominalCode: '4002',
      accountName: 'Recycling Income'
    }
  ];
  
  res.status(200).json({
    success: true,
    products: mockProducts,
    count: mockProducts.length
  });
}