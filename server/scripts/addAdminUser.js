/**
 * Script to add admin user to existing LeaveTracker Feature Service
 * Uses OAuth ApplicationSession for authentication
 */

require('dotenv').config();
const crypto = require('crypto');
const { ApplicationSession } = require('@esri/arcgis-rest-auth');

const ARCGIS_CLIENT_ID = process.env.ARCGIS_CLIENT_ID;
const ARCGIS_CLIENT_SECRET = process.env.ARCGIS_CLIENT_SECRET;
const EMPLOYEES_TABLE_URL = process.env.EMPLOYEES_TABLE_URL;
const LEAVE_TRACKER_SERVICE_URL = process.env.LEAVE_TRACKER_SERVICE_URL;

function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

async function getOAuthToken() {
    console.log('🔐 Getting OAuth token...');
    const session = new ApplicationSession({
        clientId: ARCGIS_CLIENT_ID,
        clientSecret: ARCGIS_CLIENT_SECRET
    });
    const token = await session.getToken('https://www.arcgis.com');
    console.log('✅ Got OAuth token');
    return token;
}

async function queryService(token) {
    console.log('📋 Querying service structure...');
    const response = await fetch(`${LEAVE_TRACKER_SERVICE_URL}?f=json&token=${token}`);
    const data = await response.json();
    
    if (data.error) {
        console.error('Service error:', JSON.stringify(data.error, null, 2));
        return null;
    }
    
    console.log('Service name:', data.serviceDescription || data.description || 'LeaveTracker');
    console.log('Layers:', data.layers?.map(l => `${l.id}: ${l.name}`).join(', ') || 'None');
    console.log('Tables:', data.tables?.map(t => `${t.id}: ${t.name}`).join(', ') || 'None');
    
    return data;
}

async function queryTableStructure(tableUrl, token) {
    console.log(`\n📊 Querying table: ${tableUrl}`);
    const response = await fetch(`${tableUrl}?f=json&token=${token}`);
    const data = await response.json();
    
    if (data.error) {
        console.error('Table error:', JSON.stringify(data.error, null, 2));
        return null;
    }
    
    console.log('Table name:', data.name);
    console.log('Fields:', data.fields?.map(f => f.name).join(', '));
    
    return data;
}

async function addAdminUser(token) {
    console.log('\n👤 Adding admin user...');
    
    const adminUser = {
        attributes: {
            EmployeeID: 'ADMIN001',
            FirstName: 'Simbai',
            LastName: 'Mutematemi',
            Email: 'm.simbai@cheworeconservation.org',
            Username: 'simbai',
            PasswordHash: hashPassword('admin'),
            Role: 'admin',
            Department: 'Administration',
            ManagerID: null,
            AnnualLeaveBalance: 0,
            SickLeaveBalance: 0,
            OtherLeaveBalance: 0,
            Status: 'active',
            CreatedDate: Date.now(),
            PasswordSet: 1
        }
    };

    const response = await fetch(`${EMPLOYEES_TABLE_URL}/addFeatures`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            features: JSON.stringify([adminUser]),
            f: 'json',
            token: token
        })
    });

    const data = await response.json();
    
    if (data.error) {
        console.error('Add user error:', JSON.stringify(data.error, null, 2));
        return false;
    }
    
    if (data.addResults?.[0]?.success) {
        console.log('✅ Admin user created successfully!');
        console.log('   Username: simbai');
        console.log('   Password: admin');
        return true;
    } else {
        console.log('⚠️ Add result:', JSON.stringify(data.addResults, null, 2));
        return false;
    }
}

async function main() {
    console.log('🚀 Adding admin user to LeaveTracker...\n');
    console.log('Service URL:', LEAVE_TRACKER_SERVICE_URL);
    console.log('Employees URL:', EMPLOYEES_TABLE_URL);
    
    try {
        const token = await getOAuthToken();
        
        // Query service structure
        const serviceInfo = await queryService(token);
        
        if (serviceInfo) {
            // Query employees table structure
            await queryTableStructure(EMPLOYEES_TABLE_URL, token);
        }
        
        // Add admin user
        await addAdminUser(token);
        
        console.log('\n✅ Done!');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

main();
