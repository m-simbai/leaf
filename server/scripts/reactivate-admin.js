const fetch = require('node-fetch');

const API_URL = 'http://localhost:3000/api/admin/users/8';

async function reactivateAdmin() {
  try {
    console.log('Reactivating User ID 8 (Simbai Admin)...');
    
    // We need to use PUT.
    // Ideally we should also set IsActive=1 explicitly if the body supports it.
    // The previous script used { isActive: false }.
    const res = await fetch(API_URL, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: true })
    });
    
    const result = await res.json();
    console.log('Result:', JSON.stringify(result, null, 2));

  } catch (error) {
    console.error('Error:', error);
  }
}

reactivateAdmin();
