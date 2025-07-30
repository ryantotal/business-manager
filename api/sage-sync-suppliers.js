export default async function handler(req, res) {
  // Mock supplier data for testing
  // Real Sage API integration will be added once auth is working
  
  const mockSuppliers = [
    {
      id: '1',
      sageId: 'SUP001',
      name: 'Test Supplier Ltd',
      email: 'info@testsupplier.com',
      phone: '02012345678',
      address: {
        line1: '789 Supplier Way',
        city: 'Birmingham',
        postcode: 'B1 1AA'
      },
      contactPerson: 'John Smith'
    },
    {
      id: '2',
      sageId: 'SUP002', 
      name: 'Demo Supplies Co',
      email: 'sales@demosupplies.com',
      phone: '01614567890',
      address: {
        line1: '321 Trade Park',
        city: 'Leeds',
        postcode: 'LS1 1AA'
      },
      contactPerson: 'Jane Doe'
    }
  ];
  
  res.status(200).json({
    success: true,
    suppliers: mockSuppliers,
    count: mockSuppliers.length
  });
}