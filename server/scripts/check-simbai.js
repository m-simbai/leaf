const fetch = require('node-fetch');

const API_URL = 'http://localhost:3000/api/employees';

async function checkSimbai() {
  try {
    const res = await fetch(API_URL);
    const data = await res.json();
    const employees = data.features.map(f => f.attributes);
    
    // Find Simbai Mutematemi
    const simbai = employees.find(e => 
      e.FirstName.toLowerCase().includes('simbai') && 
      !e.LastName.toLowerCase().includes('admin')
    );

    if (simbai) {
      console.log('User Found:', JSON.stringify(simbai, null, 2));
    } else {
      console.log('Simbai Mutematemi not found.');
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

checkSimbai();
