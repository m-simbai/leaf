/**
 * Script to add fields to existing LeaveTracker Feature Service tables
 * and then add an admin user
 * Uses OAuth ApplicationSession for authentication
 */

require('dotenv').config();
const crypto = require('crypto');
const { ApplicationSession } = require('@esri/arcgis-rest-auth');

const ARCGIS_CLIENT_ID = process.env.ARCGIS_CLIENT_ID;
const ARCGIS_CLIENT_SECRET = process.env.ARCGIS_CLIENT_SECRET;
const LEAVE_TRACKER_SERVICE_URL = process.env.LEAVE_TRACKER_SERVICE_URL;
const EMPLOYEES_TABLE_URL = process.env.EMPLOYEES_TABLE_URL;

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

async function addFieldsToTable(adminUrl, tableId, fields, token) {
    console.log(`📝 Adding fields to table ${tableId}...`);
    
    const addToDefinition = {
        fields: fields
    };
    
    const response = await fetch(`${adminUrl}/${tableId}/addToDefinition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            addToDefinition: JSON.stringify(addToDefinition),
            f: 'json',
            token: token
        })
    });
    
    const data = await response.json();
    
    if (data.error) {
        console.error(`   Error adding fields to table ${tableId}:`, data.error.message || JSON.stringify(data.error));
        return false;
    }
    
    console.log(`   ✅ Fields added to table ${tableId}`);
    return true;
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
    console.log('🚀 Adding fields to LeaveTracker tables...\n');
    
    try {
        const token = await getOAuthToken();
        
        // Admin URL
        const adminUrl = LEAVE_TRACKER_SERVICE_URL.replace('/rest/services/', '/rest/admin/services/');
        console.log('Admin URL:', adminUrl);
        
        // Employee fields
        const employeeFields = [
            { name: 'EmployeeID', type: 'esriFieldTypeString', alias: 'Employee ID', length: 50, nullable: true, editable: true },
            { name: 'FirstName', type: 'esriFieldTypeString', alias: 'First Name', length: 100, nullable: true, editable: true },
            { name: 'LastName', type: 'esriFieldTypeString', alias: 'Last Name', length: 100, nullable: true, editable: true },
            { name: 'Email', type: 'esriFieldTypeString', alias: 'Email', length: 255, nullable: true, editable: true },
            { name: 'Username', type: 'esriFieldTypeString', alias: 'Username', length: 100, nullable: true, editable: true },
            { name: 'PasswordHash', type: 'esriFieldTypeString', alias: 'Password Hash', length: 255, nullable: true, editable: true },
            { name: 'Role', type: 'esriFieldTypeString', alias: 'Role', length: 50, nullable: true, editable: true },
            { name: 'Department', type: 'esriFieldTypeString', alias: 'Department', length: 100, nullable: true, editable: true },
            { name: 'ManagerID', type: 'esriFieldTypeString', alias: 'Manager ID', length: 50, nullable: true, editable: true },
            { name: 'AnnualLeaveBalance', type: 'esriFieldTypeDouble', alias: 'Annual Leave Balance', nullable: true, editable: true },
            { name: 'SickLeaveBalance', type: 'esriFieldTypeDouble', alias: 'Sick Leave Balance', nullable: true, editable: true },
            { name: 'OtherLeaveBalance', type: 'esriFieldTypeDouble', alias: 'Other Leave Balance', nullable: true, editable: true },
            { name: 'StartDate', type: 'esriFieldTypeDate', alias: 'Start Date', nullable: true, editable: true },
            { name: 'Status', type: 'esriFieldTypeString', alias: 'Status', length: 50, nullable: true, editable: true },
            { name: 'PhoneNumber', type: 'esriFieldTypeString', alias: 'Phone Number', length: 50, nullable: true, editable: true },
            { name: 'CreatedDate', type: 'esriFieldTypeDate', alias: 'Created Date', nullable: true, editable: true },
            { name: 'UpdatedDate', type: 'esriFieldTypeDate', alias: 'Updated Date', nullable: true, editable: true },
            { name: 'SetupToken', type: 'esriFieldTypeString', alias: 'Setup Token', length: 255, nullable: true, editable: true },
            { name: 'SetupTokenExpiry', type: 'esriFieldTypeDouble', alias: 'Setup Token Expiry', nullable: true, editable: true },
            { name: 'PasswordSet', type: 'esriFieldTypeInteger', alias: 'Password Set', nullable: true, editable: true },
            { name: 'ResetToken', type: 'esriFieldTypeString', alias: 'Reset Token', length: 255, nullable: true, editable: true },
            { name: 'ResetTokenExpiry', type: 'esriFieldTypeDouble', alias: 'Reset Token Expiry', nullable: true, editable: true },
            { name: 'PendingManagerID', type: 'esriFieldTypeString', alias: 'Pending Manager ID', length: 50, nullable: true, editable: true },
            { name: 'AssignmentToken', type: 'esriFieldTypeString', alias: 'Assignment Token', length: 255, nullable: true, editable: true },
            { name: 'AssignmentTokenExpiry', type: 'esriFieldTypeDouble', alias: 'Assignment Token Expiry', nullable: true, editable: true },
            { name: 'AssignmentStatus', type: 'esriFieldTypeString', alias: 'Assignment Status', length: 50, nullable: true, editable: true }
        ];
        
        // LeaveRequests fields
        const leaveRequestFields = [
            { name: 'RequestID', type: 'esriFieldTypeString', alias: 'Request ID', length: 50, nullable: true, editable: true },
            { name: 'EmployeeID', type: 'esriFieldTypeString', alias: 'Employee ID', length: 50, nullable: true, editable: true },
            { name: 'EmployeeName', type: 'esriFieldTypeString', alias: 'Employee Name', length: 200, nullable: true, editable: true },
            { name: 'LeaveType', type: 'esriFieldTypeString', alias: 'Leave Type', length: 50, nullable: true, editable: true },
            { name: 'StartDate', type: 'esriFieldTypeDate', alias: 'Start Date', nullable: true, editable: true },
            { name: 'EndDate', type: 'esriFieldTypeDate', alias: 'End Date', nullable: true, editable: true },
            { name: 'ActualEndDate', type: 'esriFieldTypeDate', alias: 'Actual End Date', nullable: true, editable: true },
            { name: 'DaysRequested', type: 'esriFieldTypeDouble', alias: 'Days Requested', nullable: true, editable: true },
            { name: 'Reason', type: 'esriFieldTypeString', alias: 'Reason', length: 1000, nullable: true, editable: true },
            { name: 'Status', type: 'esriFieldTypeString', alias: 'Status', length: 50, nullable: true, editable: true },
            { name: 'ManagerID', type: 'esriFieldTypeString', alias: 'Manager ID', length: 50, nullable: true, editable: true },
            { name: 'ApprovedBy', type: 'esriFieldTypeString', alias: 'Approved By', length: 100, nullable: true, editable: true },
            { name: 'ApprovalDate', type: 'esriFieldTypeDate', alias: 'Approval Date', nullable: true, editable: true },
            { name: 'RejectionReason', type: 'esriFieldTypeString', alias: 'Rejection Reason', length: 500, nullable: true, editable: true },
            { name: 'CreatedDate', type: 'esriFieldTypeDate', alias: 'Created Date', nullable: true, editable: true },
            { name: 'UpdatedDate', type: 'esriFieldTypeDate', alias: 'Updated Date', nullable: true, editable: true },
            { name: 'EarlyCheckinDate', type: 'esriFieldTypeDate', alias: 'Early Checkin Date', nullable: true, editable: true },
            { name: 'EarlyCheckinReason', type: 'esriFieldTypeString', alias: 'Early Checkin Reason', length: 500, nullable: true, editable: true },
            { name: 'ExtensionRequested', type: 'esriFieldTypeInteger', alias: 'Extension Requested', nullable: true, editable: true },
            { name: 'ExtensionDays', type: 'esriFieldTypeDouble', alias: 'Extension Days', nullable: true, editable: true },
            { name: 'ExtensionReason', type: 'esriFieldTypeString', alias: 'Extension Reason', length: 500, nullable: true, editable: true },
            { name: 'ExtensionStatus', type: 'esriFieldTypeString', alias: 'Extension Status', length: 50, nullable: true, editable: true },
            { name: 'OriginalEndDate', type: 'esriFieldTypeDate', alias: 'Original End Date', nullable: true, editable: true }
        ];
        
        // Department fields
        const departmentFields = [
            { name: 'DepartmentID', type: 'esriFieldTypeString', alias: 'Department ID', length: 50, nullable: true, editable: true },
            { name: 'DepartmentName', type: 'esriFieldTypeString', alias: 'Department Name', length: 100, nullable: true, editable: true },
            { name: 'Description', type: 'esriFieldTypeString', alias: 'Description', length: 500, nullable: true, editable: true },
            { name: 'ManagerID', type: 'esriFieldTypeString', alias: 'Manager ID', length: 50, nullable: true, editable: true },
            { name: 'CreatedDate', type: 'esriFieldTypeDate', alias: 'Created Date', nullable: true, editable: true }
        ];
        
        // Add fields to each table
        console.log('\n📊 Adding fields to Employees table (0)...');
        await addFieldsToTable(adminUrl, 0, employeeFields, token);
        
        console.log('\n📊 Adding fields to LeaveRequests table (1)...');
        await addFieldsToTable(adminUrl, 1, leaveRequestFields, token);
        
        console.log('\n📊 Adding fields to Departments table (2)...');
        await addFieldsToTable(adminUrl, 2, departmentFields, token);
        
        // Delete the existing empty record
        console.log('\n🗑️ Cleaning up empty records...');
        const deleteResponse = await fetch(`${EMPLOYEES_TABLE_URL}/deleteFeatures`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                where: '1=1',
                f: 'json',
                token: token
            })
        });
        const deleteData = await deleteResponse.json();
        console.log('   Deleted:', deleteData.deleteResults?.length || 0, 'records');
        
        // Add admin user
        await addAdminUser(token);
        
        console.log('\n========================================');
        console.log('✅ FEATURE SERVICE SETUP COMPLETE!');
        console.log('========================================');
        console.log('\nAdmin Login:');
        console.log('   Username: simbai');
        console.log('   Password: admin');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

main();
