const fetch = require('node-fetch');

// Configuration
const API_URL = 'http://localhost:3000/api';

async function clearLeavesForUser(namePart) {
  try {
    // 1. Get all employees to find ID
    const empRes = await fetch(`${API_URL}/employees`);
    const empData = await empRes.json();
    const employee = empData.features.find(f => 
      f.attributes.FirstName.toLowerCase().includes(namePart.toLowerCase()) || 
      f.attributes.LastName.toLowerCase().includes(namePart.toLowerCase())
    );

    if (!employee) {
      console.log(`User matching "${namePart}" not found.`);
      return;
    }

    const { EmployeeID, FirstName, LastName } = employee.attributes;
    console.log(`Checking leaves for: ${FirstName} ${LastName} (${EmployeeID})`);

    // 2. Get pending/approved leaves
    // We'll fetch ALL leaves and filter locally since there isn't a direct "get all for employee" public endpoint documented easily, 
    // or we can use the main leaves endpoint if it lists everything?
    // Let's rely on the main leaves endpoint which returns everything for now (as per index.js implementation usually)
    const leavesRes = await fetch(`${API_URL}/leaves`);
    const leavesData = await leavesRes.json();
    
    // Filter for this employee and 'approved' or 'pending' status
    const targetLeaves = leavesData.features.filter(f => 
      f.attributes.EmployeeID === EmployeeID && 
      (f.attributes.Status === 'approved' || f.attributes.Status === 'pending')
    );

    console.log(`Found ${targetLeaves.length} active/pending leaves.`);

    // 3. Reject/Cancel them
    for (const leave of targetLeaves) {
      const objectId = leave.attributes.OBJECTID;
      console.log(`Cancelling leave ID: ${objectId} (${leave.attributes.LeaveType}, ${leave.attributes.StartDate} - ${leave.attributes.EndDate})`);
      
      // We'll use the 'reject' endpoint as a forceful cancellation
      const rejectRes = await fetch(`${API_URL}/leaves/${objectId}/reject`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Data cleanup requested by user' })
      });
      
      const result = await rejectRes.json();
      console.log(`Result: ${JSON.stringify(result)}`);
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

clearLeavesForUser('Simba');
