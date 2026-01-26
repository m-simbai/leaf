/**
 * Populate Sample Data Script
 * 
 * Generates realistic sample data for the Leave Tracker app.
 * Focuses on the current month (January 2026) to demonstrate:
 * - Next off days
 * - Accumulated days
 * - Team availability
 * 
 * Usage: node scripts/populate-data.js
 */

require('dotenv').config();
const fetch = require('node-fetch');

// Configuration
const ARCGIS_ORG_URL = process.env.ARCGIS_ORG_URL || 'https://www.arcgis.com';
const USERNAME = process.env.ARCGIS_USERNAME;
const PASSWORD = process.env.ARCGIS_PASSWORD;
const SERVICE_URL = process.env.LEAVE_TRACKER_SERVICE_URL;

if (!USERNAME || !PASSWORD || !SERVICE_URL) {
  console.error('❌ Missing configs. Check .env');
  process.exit(1);
}

// Current simulated date: 2026-01-16
const TODAY = new Date('2026-01-16T12:00:00');

// Helper to create dates relative to today
function getDate(dayOffset) {
  const d = new Date(TODAY);
  d.setDate(d.getDate() + dayOffset);
  return d.getTime();
}

// Generate token
async function getToken() {
  console.log('🔐 Getting token...');
  const tokenUrl = `${ARCGIS_ORG_URL}/sharing/rest/generateToken`;
  const params = new URLSearchParams({
    username: USERNAME,
    password: PASSWORD,
    referer: 'http://localhost:3000',
    expiration: 120,
    f: 'json'
  });
  
  const res = await fetch(tokenUrl, { method: 'POST', body: params });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.token;
}

// Add features to a layer
async function addFeatures(token, layerIdx, features) {
  console.log(`\n📝 Adding ${features.length} items to header layer ${layerIdx}...`);
  const url = `${SERVICE_URL}/${layerIdx}/addFeatures`;
  
  const params = new URLSearchParams({
    features: JSON.stringify(features),
    f: 'json',
    token: token,
    rollbackOnFailure: true
  });

  const res = await fetch(url, { method: 'POST', body: params });
  const data = await res.json();
  
  if (data.error) throw new Error(JSON.stringify(data.error));
  
  const success = data.addResults?.filter(r => r.success).length || 0;
  console.log(`✅ Added ${success} / ${features.length} items.`);
  return data;
}

async function main() {
  try {
    const token = await getToken();

    // 1. Employees Data
    // We'll create a mix of managers and staff
    const employees = [
      {
        attributes: {
          EmployeeID: 'EMP_SIMBA',
          Username: 'simba',
          PasswordHash: 'pass', // Simple for demo
          FirstName: 'Simba',
          LastName: 'User',
          Email: 'simba@chewore.com',
          Department: 'Engineering',
          Role: 'staff',
          ManagerID: 'EMP_ADMIN',
          AnnualLeaveBalance: 12, // Used some
          SickLeaveBalance: 10,
          OtherLeaveBalance: 5,
          IsActive: 1,
          CreatedDate: Date.now()
        }
      },
      {
        attributes: {
          EmployeeID: 'EMP_SARAH',
          Username: 'sarah',
          PasswordHash: 'pass',
          FirstName: 'Sarah',
          LastName: 'Connor',
          Email: 'sarah@chewore.com',
          Department: 'Engineering',
          Role: 'staff',
          ManagerID: 'EMP_ADMIN',
          AnnualLeaveBalance: 15,
          SickLeaveBalance: 8,
          OtherLeaveBalance: 5,
          IsActive: 1,
          CreatedDate: Date.now()
        }
      },
      {
        attributes: {
          EmployeeID: 'EMP_MIKE',
          Username: 'mike',
          PasswordHash: 'pass',
          FirstName: 'Mike',
          LastName: 'Ross',
          Email: 'mike@chewore.com',
          Department: 'Sales',
          Role: 'staff',
          ManagerID: 'EMP_ADMIN',
          AnnualLeaveBalance: 20,
          SickLeaveBalance: 10,
          OtherLeaveBalance: 5,
          IsActive: 1,
          CreatedDate: Date.now()
        }
      },
       {
        attributes: {
          EmployeeID: 'EMP_ADMIN',
          Username: 'admin_mg',
          PasswordHash: 'pass',
          FirstName: 'Admin',
          LastName: 'Manager',
          Email: 'manager@chewore.com',
          Department: 'Management',
          Role: 'manager',
          ManagerID: null,
          AnnualLeaveBalance: 25,
          SickLeaveBalance: 10,
          OtherLeaveBalance: 10,
          IsActive: 1,
          CreatedDate: Date.now()
        }
      }
    ];

    // 2. Leave Requests Data
    // Relative to Jan 16, 2026
    const leaveRequests = [
      // --- SIMBA (Current User) ---
      {
        attributes: {
          RequestID: 'REQ_001',
          EmployeeID: 'EMP_SIMBA',
          EmployeeName: 'Simba User',
          LeaveType: 'annual',
          StartDate: getDate(-10), // Jan 6
          EndDate: getDate(-8),    // Jan 8
          DaysRequested: 3,
          Reason: 'Personal trip',
          Status: 'approved',
          SubmittedDate: getDate(-20),
          ReviewedBy: 'EMP_ADMIN',
          ReviewedDate: getDate(-15)
        }
      },
      {
        attributes: {
          RequestID: 'REQ_002',
          EmployeeID: 'EMP_SIMBA',
          EmployeeName: 'Simba User',
          LeaveType: 'sick',
          StartDate: getDate(-2),  // Jan 14
          EndDate: getDate(-2),    // Jan 14
          DaysRequested: 1,
          Reason: 'Flu',
          Status: 'approved',
          SubmittedDate: getDate(-2),
          ReviewedBy: 'EMP_ADMIN',
          ReviewedDate: getDate(-2)
        }
      },
      {
        attributes: {
          RequestID: 'REQ_003',
          EmployeeID: 'EMP_SIMBA',
          EmployeeName: 'Simba User',
          LeaveType: 'annual',
          StartDate: getDate(5),   // Jan 21
          EndDate: getDate(7),     // Jan 23
          DaysRequested: 3,
          Reason: 'Short vacation',
          Status: 'approved', // Approved future leave
          SubmittedDate: getDate(-5),
          ReviewedBy: 'EMP_ADMIN',
          ReviewedDate: getDate(-4)
        }
      },
      // --- SARAH (Currently on leave) ---
      {
        attributes: {
          RequestID: 'REQ_004',
          EmployeeID: 'EMP_SARAH',
          EmployeeName: 'Sarah Connor',
          LeaveType: 'annual',
          StartDate: getDate(-2),  // Jan 14
          EndDate: getDate(2),     // Jan 18
          DaysRequested: 5,
          Reason: 'Family visit',
          Status: 'approved',
          SubmittedDate: getDate(-10),
          ReviewedBy: 'EMP_ADMIN',
          ReviewedDate: getDate(-9)
        }
      },
      // --- MIKE (Future leave) ---
      {
        attributes: {
          RequestID: 'REQ_005',
          EmployeeID: 'EMP_MIKE',
          EmployeeName: 'Mike Ross',
          LeaveType: 'annual',
          StartDate: getDate(10),  // Jan 26
          EndDate: getDate(14),    // Jan 30
          DaysRequested: 5,
          Reason: 'Ski trip',
          Status: 'approved',
          SubmittedDate: getDate(-3),
          ReviewedBy: 'EMP_ADMIN',
          ReviewedDate: getDate(-2)
        }
      },
      // --- PENDING REQUEST ---
      {
        attributes: {
          RequestID: 'REQ_006',
          EmployeeID: 'EMP_SARAH',
          EmployeeName: 'Sarah Connor',
          LeaveType: 'sick',
          StartDate: getDate(20),
          EndDate: getDate(20),
          DaysRequested: 1,
          Reason: 'Dentist appointment',
          Status: 'pending',
          SubmittedDate: getDate(0)
        }
      }
    ];

    console.log('🚀 Populating Sample Data...');
    
    // Add Employees (Layer 0)
    await addFeatures(token, 0, employees);

    // Add Leave Requests (Layer 1)
    await addFeatures(token, 1, leaveRequests);

    console.log('\n🎉 Data Population Complete!');
    console.log('You can now log in as "simba" (pass: "pass") to check the user dashboard.');

  } catch (err) {
    console.error('❌ Error:', err);
  }
}

main();
