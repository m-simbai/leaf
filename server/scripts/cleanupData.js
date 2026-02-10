/**
 * Script to clean up all data from LeaveTracker tables
 * Keeps only the admin user 'simbai'
 */

require('dotenv').config();
const { ApplicationSession } = require('@esri/arcgis-rest-auth');

const ARCGIS_CLIENT_ID = process.env.ARCGIS_CLIENT_ID;
const ARCGIS_CLIENT_SECRET = process.env.ARCGIS_CLIENT_SECRET;
const EMPLOYEES_TABLE_URL = process.env.EMPLOYEES_TABLE_URL;
const LEAVE_REQUESTS_TABLE_URL = process.env.LEAVE_REQUESTS_TABLE_URL;
const DEPARTMENTS_TABLE_URL = process.env.DEPARTMENTS_TABLE_URL;

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

async function deleteFromTable(tableUrl, tableName, where, token) {
    console.log(`\n🗑️ Deleting from ${tableName}...`);
    console.log(`   Where: ${where}`);
    
    const response = await fetch(`${tableUrl}/deleteFeatures`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            where: where,
            f: 'json',
            token: token
        })
    });
    
    const data = await response.json();
    
    if (data.error) {
        console.error(`   ❌ Error: ${data.error.message}`);
        return 0;
    }
    
    const deleted = data.deleteResults?.filter(r => r.success).length || 0;
    console.log(`   ✅ Deleted ${deleted} records`);
    return deleted;
}

async function countRecords(tableUrl, where, token) {
    const response = await fetch(`${tableUrl}/query?where=${encodeURIComponent(where)}&returnCountOnly=true&f=json&token=${token}`);
    const data = await response.json();
    return data.count || 0;
}

async function main() {
    console.log('🧹 Cleaning up LeaveTracker data...\n');
    console.log('Will keep: Admin user "simbai"');
    console.log('Will delete: All other employees, all leave requests, all departments\n');
    
    try {
        const token = await getOAuthToken();
        
        // Count before cleanup
        console.log('\n📊 Current record counts:');
        const empCount = await countRecords(EMPLOYEES_TABLE_URL, '1=1', token);
        const leaveCount = await countRecords(LEAVE_REQUESTS_TABLE_URL, '1=1', token);
        const deptCount = await countRecords(DEPARTMENTS_TABLE_URL, '1=1', token);
        console.log(`   Employees: ${empCount}`);
        console.log(`   Leave Requests: ${leaveCount}`);
        console.log(`   Departments: ${deptCount}`);
        
        // Delete all leave requests
        await deleteFromTable(LEAVE_REQUESTS_TABLE_URL, 'LeaveRequests', '1=1', token);
        
        // Delete all departments
        await deleteFromTable(DEPARTMENTS_TABLE_URL, 'Departments', '1=1', token);
        
        // Delete all employees EXCEPT simbai admin
        await deleteFromTable(EMPLOYEES_TABLE_URL, 'Employees', "Username <> 'simbai'", token);
        
        // Verify admin simbai still exists
        console.log('\n🔍 Verifying admin user...');
        const verifyResponse = await fetch(`${EMPLOYEES_TABLE_URL}/query?where=Username%3D'simbai'&outFields=Username,Role,Email&f=json&token=${token}`);
        const verifyData = await verifyResponse.json();
        
        if (verifyData.features?.length > 0) {
            const admin = verifyData.features[0].attributes;
            console.log('   ✅ Admin user preserved:');
            console.log(`      Username: ${admin.Username}`);
            console.log(`      Role: ${admin.Role}`);
            console.log(`      Email: ${admin.Email}`);
        } else {
            console.log('   ⚠️ Admin user not found!');
        }
        
        // Count after cleanup
        console.log('\n📊 Final record counts:');
        const empCountAfter = await countRecords(EMPLOYEES_TABLE_URL, '1=1', token);
        const leaveCountAfter = await countRecords(LEAVE_REQUESTS_TABLE_URL, '1=1', token);
        const deptCountAfter = await countRecords(DEPARTMENTS_TABLE_URL, '1=1', token);
        console.log(`   Employees: ${empCountAfter}`);
        console.log(`   Leave Requests: ${leaveCountAfter}`);
        console.log(`   Departments: ${deptCountAfter}`);
        
        console.log('\n========================================');
        console.log('✅ CLEANUP COMPLETE!');
        console.log('========================================');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

main();
