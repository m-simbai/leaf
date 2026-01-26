const fetch = require('node-fetch');

const API_URL = 'http://localhost:3000/api/employees';

async function checkReports() {
  try {
    const res = await fetch(API_URL);
    const data = await res.json();
    const employees = data.features.map(f => f.attributes);
    
    // Find Tagwireyi
    const tagwireyi = employees.find(e => 
      e.LastName.toLowerCase().includes('tagwireyi')
    );

    if (!tagwireyi) {
      console.log('Manager Tagwireyi not found');
      return;
    }

    console.log('Manager:', `${tagwireyi.FirstName} ${tagwireyi.LastName} (${tagwireyi.EmployeeID})`);

    // Find reports
    const reports = employees.filter(e => e.ManagerID === tagwireyi.EmployeeID);
    
    console.log('Assigned Staff:');
    if (reports.length === 0) {
      console.log('  None');
    } else {
      reports.forEach(r => {
        console.log(`  - ${r.FirstName} ${r.LastName} (${r.EmployeeID}) [Role: ${r.Role}]`);
      });
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

checkReports();
