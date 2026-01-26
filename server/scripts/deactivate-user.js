const fetch = require('node-fetch');

const API_URL = 'http://localhost:3000/api/employees';
const ADMIN_UPDATE_URL = 'http://localhost:3000/api/admin/users';

async function deactivateUser(namePart) {
  try {
    // 1. Fetch employees
    const res = await fetch(API_URL);
    const data = await res.json();
    const employees = data.features.map(f => f.attributes);
    
    console.log('Available Users:', employees.map(e => `${e.FirstName} ${e.LastName}`));

    // 2. Find user
    const user = employees.find(e => 
      e.FirstName?.toLowerCase().includes(namePart.toLowerCase()) || 
      e.LastName?.toLowerCase().includes(namePart.toLowerCase())
    );

    if (!user) {
      console.log(`User matching "${namePart}" not found.`);
      return;
    }

    console.log(`Found User: ${user.FirstName} ${user.LastName} (OID: ${user.OBJECTID}, Active: ${user.IsActive})`);

    // 3. Deactivate
    const updateUrl = `${ADMIN_UPDATE_URL}/${user.OBJECTID}`;
    console.log(`Deactivating user...`);
    
    const updateRes = await fetch(updateUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: 0 })  // Assuming your API supports this, or we might need to use a direct update logic if API doesn't expose it
    });
    
    // Note: The /api/admin/users/:id endpoint normally handles re-assignment. 
    // If it doesn't handle isActive, we might need to modify the endpoint or use a direct DB/ArcGIS update script.
    // Let's check the response.
    const result = await updateRes.json();
    console.log('Update Result:', result);

  } catch (error) {
    console.error('Error:', error);
  }
}

deactivateUser('Mike');
