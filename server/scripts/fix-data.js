const fetch = require('node-fetch');

const API_URL = 'http://localhost:3000/api/employees';

async function fixData() {
  try {
    const res = await fetch(API_URL);
    const data = await res.json();
    const employees = data.features.map(f => f.attributes);
    
    console.log('--- EMPLOYEES ---');
    employees.forEach(e => {
      console.log(JSON.stringify(e));
    });
    console.log('-----------------');

  } catch (err) {
    console.error(err);
  }
}

fixData();
