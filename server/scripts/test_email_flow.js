require('dotenv').config();
const { ApplicationSession } = require('@esri/arcgis-rest-auth');
const { queryFeatures } = require('@esri/arcgis-rest-feature-layer');
const fetch = require('node-fetch');

const EMPLOYEES_URL = process.env.EMPLOYEES_TABLE_URL;
const APP_URL = 'http://localhost:3000'; // Target backend directly

function getSession() {
    if (process.env.ARCGIS_USERNAME && process.env.ARCGIS_PASSWORD) {
        return {
            username: process.env.ARCGIS_USERNAME,
            password: process.env.ARCGIS_PASSWORD
        };
    } else {
        return new ApplicationSession({
            clientId: process.env.ARCGIS_CLIENT_ID,
            clientSecret: process.env.ARCGIS_CLIENT_SECRET
        });
    }
}

// Helper to authenticate if needed (simulating session for queries)
// Note: We use a simplified version because we just need to read the employee table to get IDs
async function getTestUsers() {
    // We can use the server's session logic or just hit the public API if exposed, 
    // but hitting the API /api/employees might be easier if it doesn't require auth token in header
    // The server/index.js /api/employees does require getSession() but doesn't check req header.
    // So let's try hitting the local API first.
    
    try {
        console.log('Fetching test users from API...');
        const response = await fetch(`${APP_URL}/api/employees`);
        const data = await response.json();
        
        if (data.features) {
            const employee = data.features.find(f => f.attributes.Username === 'test_employee');
            const manager = data.features.find(f => f.attributes.Username === 'test_manager');
            return { employee: employee?.attributes, manager: manager?.attributes };
        }
        return { employee: null, manager: null };
    } catch (e) {
        console.error('Failed to fetch from API, trying direct DB query...');
        // Fallback to direct DB query if API fails (e.g. auth issue)
        // ... implementation omitted for brevity, assuming API works as per analysis
        throw e;
    }
}

async function runTest() {
    console.log('🚀 Starting Email Flow Test...');

    // 1. Get Users
    let { employee, manager } = await getTestUsers();
    
    if (!employee || !manager) {
        console.log('⚠️ Specific test users not found. Falling back to any available users...');
        try {
            const response = await fetch(`${APP_URL}/api/employees`);
            const data = await response.json();
            
            if (data.features && data.features.length >= 2) {
                // Try to find a manager
                const managers = data.features.filter(f => f.attributes.Role === 'manager' && f.attributes.Email);
                manager = managers.length > 0 ? managers[0].attributes : data.features[0].attributes;
                
                // Try to find an employee (who is not the manager)
                const employees = data.features.filter(f => f.attributes.EmployeeID !== manager.EmployeeID && f.attributes.Email);
                employee = employees.length > 0 ? employees[0].attributes : null;
            }
        } catch (e) {
            console.error('Error fetching fallback users:', e);
        }
    }

    if (!employee || !manager) {
        console.error('❌ Could not find ANY valid users (Employee + Manager) to test with.');
        return;
    }

    // 2. Submit Leave Request
    const startDate = new Date();
    startDate.setDate(startDate.getDate() + 1); // Tomorrow
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 2); // 2 days later

    const requestPayload = {
        employeeId: employee.EmployeeID,
        employeeName: `${employee.FirstName} ${employee.LastName}`,
        leaveType: 'Annual',
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        daysRequested: 2,
        reason: 'API Test Request'
    };

    console.log('📤 Submitting Leave Request...');
    const reqResponse = await fetch(`${APP_URL}/api/leaves`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload)
    });
    
    const reqData = await reqResponse.json();
    if (!reqResponse.ok || !reqData.success) {
        console.error('❌ Request failed:', reqData);
        return;
    }
    
    const objectId = reqData.objectId;
    console.log(`✅ Request submitted! ObjectId: ${objectId}`);
    console.log('   (Check server logs for "notifyNewRequest" output)');

    // 3. Reject Request
    console.log('📤 Rejecting Request...');
    const rejectPayload = {
        reviewedBy: `${manager.FirstName} ${manager.LastName}`,
        rejectionReason: 'API Test Rejection Verification',
        managerId: manager.EmployeeID // Some endpoints might need this, though index.js looked like it uses objectId
    };

    const rejectResponse = await fetch(`${APP_URL}/api/leaves/${objectId}/reject`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rejectPayload)
    });

    const rejectData = await rejectResponse.json();
    if (!rejectResponse.ok || !rejectData.success) {
        console.error('❌ Rejection failed:', rejectData);
        return;
    }

    console.log('✅ Request rejected!');
    console.log('   (Check server logs for "notifyRejected" output)');
}

runTest().catch(console.error);
