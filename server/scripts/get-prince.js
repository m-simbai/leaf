const fetch = require('node-fetch');

const API_URL = 'http://localhost:3000/api/admin/users';

async function getPrinceUsername() {
  try {
    const res = await fetch(API_URL);
    const data = await res.json();
    const employees = data.users || [];
    
    // Find Prince
    const prince = employees.find(e => e.firstName.toLowerCase().includes('prince'));

    if (prince) {
      console.log('Username:', prince.username);
    } else {
      console.log('Prince not found');
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

getPrinceUsername();
