const fetch = require('node-fetch');

const API_URL = 'http://localhost:3000/api/employees';

async function listAdmins() {
  try {
    const res = await fetch(API_URL);
    const data = await res.json();
    const employees = data.features.map(f => f.attributes);
    
    // Find Admins
    const admins = employees.filter(e => e.Role && e.Role.toLowerCase() === 'admin');

    console.log('Admins Found:', admins.map(a => `${a.FirstName} ${a.LastName} (${a.Username}) - Active: ${a.IsActive}`));

  } catch (error) {
    console.error('Error:', error);
  }
}

listAdmins();
