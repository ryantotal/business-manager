export default async function handler(req, res) {
  // For now, return mock data to test
  // We'll add real Sage API calls once auth is working
  
  const mockCustomers = [
    {
      id: '1',
      sageId: 'SAGE001',
      name: 'Test Customer 1',
      email: 'customer1@example.com',
      phone: '01234567890',
      address: {
        line1: '123 Test Street',
        city: 'London',
        postcode: 'SW1A 1AA'
      }
    },
    {
      id: '2', 
      sageId: 'SAGE002',
      name: 'Test Customer 2',
      email: 'customer2@example.com',
      phone: '09876543210',
      address: {
        line1: '456 Demo Road',
        city: 'Manchester',
        postcode: 'M1 1AA'
      }
    }
  ];
  
  res.status(200).json({
    success: true,
    customers: mockCustomers,
    count: mockCustomers.length
  });
}