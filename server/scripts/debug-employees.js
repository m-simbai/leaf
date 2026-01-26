const fetch = require('node-fetch');

async function debugData() {
  try {
    // 1. Fetch all employees
    console.log('Fetching employees...');
    const empRes = await fetch('http://localhost:3000/api/employees');
    const empData = await empRes.json();
    
    if (!empData.features) {
      console.log('No features found in employees response');
      return;
    }

    const employees = empData.features.map(f => f.attributes);
    
    console.log('Total employees found:', employees.length);
    employees.forEach(e => {
        console.log('Employee:', JSON.stringify(e, null, 2));
    });

    // Find manager 'tagwireyi' (case insensitive check)
    const manager = employees.find(e => e.Username?.toLowerCase() === 'tagwireyi');
    
    if (!manager) {
      console.log('Manager tagwireyi not found!');
    } else {
      console.log('Manager Details:', {
        Name: `${manager.FirstName} ${manager.LastName}`,
        ID: manager.EmployeeID,
        Role: manager.Role
      });

      // Find staff reporting to this manager
      const staff = employees.filter(e => e.ManagerID === manager.EmployeeID);
      console.log(`\nFound ${staff.length} staff reporting to ${manager.EmployeeID}:`);
      staff.forEach(s => {
        console.log(`- ${s.FirstName} ${s.LastName} (ID: ${s.EmployeeID}, Active: ${s.IsActive})`);
      });

      // Find staff who SHOULD report but might have wrong ID?
      // Just list all staff to see potential orphans
      console.log('\nOther Active Staff (not reporting to tagwireyi):');
      employees
        .filter(e => e.ManagerID !== manager.EmployeeID && e.IsActive === 1)
        .forEach(s => {
          console.log(`- ${s.FirstName} ${s.LastName} (ManagerID: ${s.ManagerID})`);
        });
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

debugData();
