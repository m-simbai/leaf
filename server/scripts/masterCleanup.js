require('dotenv').config();
const crypto = require('crypto');

// Fields required for the admin user
const ADMIN_USER = {
    attributes: {
        EmployeeID: 'ADMIN001',
        FirstName: 'Simbai',
        LastName: 'Admin',
        Email: 'm.simbai@cheworeconservation.org',
        Username: 'simbai',
        // Start with 'admin' password hash
        PasswordHash: '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918', 
        Role: 'admin',
        Department: 'Administration',
        ManagerID: null,
        AnnualLeaveBalance: 0,
        SickLeaveBalance: 0,
        OtherLeaveBalance: 0,
        IsActive: 1,
        PasswordSet: 1,
        CreatedDate: Date.now()
    }
};

async function getAuthToken() {
    console.log('🔐 Authenticating as:', process.env.ARCGIS_USERNAME);
    const response = await fetch('https://www.arcgis.com/sharing/rest/generateToken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            username: process.env.ARCGIS_USERNAME,
            password: process.env.ARCGIS_PASSWORD,
            client: 'referer',
            referer: 'https://www.arcgis.com',
            expiration: 60,
            f: 'json'
        })
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    console.log('✅ Authenticated successfully');
    return data.token;
}

async function deleteFromTable(url, where, token) {
    console.log(`🗑️ Deleting from ${url}...`);
    const response = await fetch(`${url}/deleteFeatures`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ where, f: 'json', token })
    });
    const data = await response.json();
    if (data.error) console.error('❌ Error:', data.error.message);
    else console.log(`✅ Deleted ${data.deleteResults?.length || 0} records`);
}

async function main() {
    try {
        const token = await getAuthToken();
        
        console.log('🧹 Wiping ALL data...');
        
        // 1. Delete LeaveRequests (All)
        await deleteFromTable(process.env.LEAVE_REQUESTS_TABLE_URL, '1=1', token);
        
        // 2. Delete Departments (All)
        await deleteFromTable(process.env.DEPARTMENTS_TABLE_URL, '1=1', token);
        
        // 3. Delete Employees (All)
        await deleteFromTable(process.env.EMPLOYEES_TABLE_URL, '1=1', token);
        
        // 4. Create Admin User
        console.log('👤 Creating admin user simbai...');
        const addRes = await fetch(`${process.env.EMPLOYEES_TABLE_URL}/addFeatures`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                features: JSON.stringify([ADMIN_USER]),
                f: 'json',
                token: token
            })
        });
        const addData = await addRes.json();
        
        if (addData.addResults?.[0]?.success) {
            console.log('✅ Admin user created successfully!');
            console.log('   Username: simbai');
            console.log('   Password: admin');
        } else {
            console.error('❌ Failed to create admin:', JSON.stringify(addData));
        }
        
    } catch (e) {
        console.error('❌ Script failed:', e.message);
    }
}

main();
