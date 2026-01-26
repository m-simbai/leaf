const fetch = require('node-fetch');

const API_URL = 'http://localhost:3000/api/admin/users';

async function getUsername() {
  try {
    const res = await fetch(API_URL);
    const data = await res.json();
    const employees = data.users || [];
    
    const mgr = employees.find(e => e.LastName.toLowerCase().includes('tagwireyi'));

    if (mgr) {
      console.log('Username:', mgr.Username);
    } else {
      console.log('Manager not found');
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

getUsername();
