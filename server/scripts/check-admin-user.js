const fetch = require('node-fetch');

const API_URL = 'http://localhost:3000/api/admin/users';

async function checkUser() {
  try {
    const res = await fetch(API_URL);
    const data = await res.json();
    // Admin API usually returns { success: true, users: [...] }
    const employees = data.users || data.features?.map(f => f.attributes) || [];
    
    // Find Simbai Admin
    const user = employees.find(e => 
      e.FirstName?.toLowerCase().includes('simbai') && 
      e.LastName?.toLowerCase().includes('admin')
    );

    if (user) {
      console.log('User Found:', JSON.stringify(user, null, 2));
    } else {
      console.log('Simbai Admin not found in Admin List.');
      if (employees.length > 0) {
        console.log('Sample User:', JSON.stringify(employees[0], null, 2));
      }
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

checkUser();
