const fetch = require('node-fetch');

const API_URL = 'http://localhost:3000/api/employees';
const ADMIN_UPDATE_URL = 'http://localhost:3000/api/admin/users';

async function updateAssignments() {
  try {
    // 1. Fetch current employees
    console.log('Fetching employees...');
    const res = await fetch(API_URL);
    const data = await res.json();
    const employees = data.features.map(f => f.attributes);

    console.log(`Found ${employees.length} employees.`);

    // 2. Find Manager (Tagwireyi)
    const manager = employees.find(e => 
      (e.Username && e.Username.toLowerCase() === 'tagwireyi') || 
      (e.LastName && e.LastName.toLowerCase() === 'tagwireyi')
    );

    if (!manager) {
      console.error('CRITICAL: Manager Tagwireyi not found!');
      // Dump names to help debug if fails
      console.log('Available names:', employees.map(e => `${e.FirstName} ${e.LastName}`));
      return;
    }
    
    console.log(`Manager Found: ${manager.FirstName} ${manager.LastName} (${manager.EmployeeID})`);

    // 3. Find Staff
    const staffNames = ['Mike', 'Simba']; // First names or parts
    
    for (const name of staffNames) {
      const staffMember = employees.find(e => 
        e.FirstName.toLowerCase().includes(name.toLowerCase()) || 
        e.LastName.toLowerCase().includes(name.toLowerCase())
      );

      if (staffMember) {
        console.log(`Found Staff: ${staffMember.FirstName} ${staffMember.LastName} (OID: ${staffMember.OBJECTID})`);
        
        // Update Assignment
        const updateUrl = `${ADMIN_UPDATE_URL}/${staffMember.OBJECTID}`;
        console.log(`Updating ${staffMember.FirstName} to report to ${manager.LastName}...`);
        
        const updateRes = await fetch(updateUrl, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ managerId: manager.EmployeeID })
        });
        
        const updateJson = await updateRes.json();
        console.log('Update Result:', updateJson);

      } else {
        console.log(`Staff member matching "${name}" not found.`);
      }
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

updateAssignments();
