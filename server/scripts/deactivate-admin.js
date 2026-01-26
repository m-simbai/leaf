const fetch = require('node-fetch');

const API_URL = 'http://localhost:3000/api/admin/users/8';

async function deactivateAdmin() {
  try {
    console.log('Deactivating User ID 8 (Simbai Admin)...');
    
    const res = await fetch(API_URL, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: false })
    });
    
    const result = await res.json();
    console.log('Result:', JSON.stringify(result, null, 2));

  } catch (error) {
    console.error('Error:', error);
  }
}

deactivateAdmin();
