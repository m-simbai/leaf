/**
 * Script to create LeaveTracker Feature Service on ArcGIS Online
 * Creates 3 tables: Employees, LeaveRequests, Departments
 * Adds one admin user
 */

require('dotenv').config();
const crypto = require('crypto');
const { ApplicationSession } = require('@esri/arcgis-rest-auth');
const { addFeatures } = require('@esri/arcgis-rest-feature-layer');

const ARCGIS_CLIENT_ID = process.env.ARCGIS_CLIENT_ID;
const ARCGIS_CLIENT_SECRET = process.env.ARCGIS_CLIENT_SECRET;
const ARCGIS_USERNAME = process.env.ARCGIS_USERNAME;
const ARCGIS_PASSWORD = process.env.ARCGIS_PASSWORD;
const ARCGIS_ORG_URL = process.env.ARCGIS_ORG_URL || 'https://www.arcgis.com';

// Simple password hashing (matching the app's hashPassword function)
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

// Get OAuth token using ApplicationSession (like the main app)
async function getOAuthToken() {
    console.log('🔐 Using OAuth ApplicationSession...');
    const session = new ApplicationSession({
        clientId: ARCGIS_CLIENT_ID,
        clientSecret: ARCGIS_CLIENT_SECRET
    });
    const token = await session.getToken(ARCGIS_ORG_URL);
    console.log('✅ Got OAuth token');
    return token;
}

// Get user token using username/password (for content creation)
async function getUserToken() {
    console.log(`🔐 Authenticating as user: ${ARCGIS_USERNAME}`);
    
    const response = await fetch(`${ARCGIS_ORG_URL}/sharing/rest/generateToken`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            username: ARCGIS_USERNAME,
            password: ARCGIS_PASSWORD,
            client: 'referer',
            referer: ARCGIS_ORG_URL,
            expiration: 60,
            f: 'json'
        })
    });
    const data = await response.json();
    if (data.error) {
        console.error('Auth error:', JSON.stringify(data.error, null, 2));
        throw new Error(`Token error: ${data.error.message || JSON.stringify(data.error)}`);
    }
    console.log('✅ Got user token');
    return data.token;
}

async function getUserInfo(token) {
    const response = await fetch(`${ARCGIS_ORG_URL}/sharing/rest/community/self?f=json&token=${token}`);
    const data = await response.json();
    return data;
}

async function createFeatureService(token, userInfo) {
    const orgId = userInfo.orgId || userInfo.user?.orgId;
    const username = userInfo.username || userInfo.user?.username;
    
    console.log(`📦 Creating Feature Service for user: ${username}, org: ${orgId}`);
    
    // Service definition
    const createServiceParams = {
        name: 'LeaveTracker',
        serviceDescription: 'Leave Tracker application data storage',
        hasStaticData: false,
        maxRecordCount: 2000,
        supportedQueryFormats: 'JSON',
        capabilities: 'Create,Delete,Query,Update,Editing',
        description: 'Feature service for Leave Tracker app',
        copyrightText: '',
        spatialReference: { wkid: 4326 },
        initialExtent: {
            xmin: -180, ymin: -90, xmax: 180, ymax: 90,
            spatialReference: { wkid: 4326 }
        },
        allowGeometryUpdates: true,
        units: 'esriDecimalDegrees',
        xssPreventionInfo: {
            xssPreventionEnabled: true,
            xssPreventionRule: 'InputOutput',
            xssInputRule: 'rejectInvalid'
        }
    };

    const response = await fetch(
        `${ARCGIS_ORG_URL}/sharing/rest/content/users/${username}/createService`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                createParameters: JSON.stringify(createServiceParams),
                outputType: 'featureService',
                f: 'json',
                token: token
            })
        }
    );

    const data = await response.json();
    if (data.error) {
        if (data.error.message?.includes('already exists')) {
            console.log('⚠️ Service already exists, will try to use existing one');
            // Try to find existing service
            const searchResponse = await fetch(
                `${ARCGIS_ORG_URL}/sharing/rest/search?q=title:LeaveTracker%20owner:${username}%20type:Feature%20Service&f=json&token=${token}`
            );
            const searchData = await searchResponse.json();
            if (searchData.results && searchData.results.length > 0) {
                return {
                    serviceurl: searchData.results[0].url,
                    itemId: searchData.results[0].id
                };
            }
        }
        throw new Error(`Create service error: ${JSON.stringify(data.error)}`);
    }
    
    console.log('✅ Feature Service created:', data.serviceurl);
    return data;
}

async function addLayersToService(serviceUrl, token) {
    console.log('📝 Adding layers to service...');
    
    // Admin URL for the service
    const adminUrl = serviceUrl.replace('/rest/services/', '/rest/admin/services/');
    
    const layerDefinitions = {
        layers: [
            {
                id: 0,
                name: 'Employees',
                type: 'Table',
                displayField: 'FirstName',
                description: 'Employee records',
                copyrightText: '',
                defaultVisibility: true,
                relationships: [],
                isDataVersioned: false,
                supportsRollbackOnFailureParameter: true,
                supportsAdvancedQueries: true,
                supportsStatistics: true,
                supportsPercentileStatistics: true,
                supportedQueryFormats: 'JSON',
                hasM: false,
                hasZ: false,
                allowGeometryUpdates: false,
                hasAttachments: false,
                htmlPopupType: 'esriServerHTMLPopupTypeNone',
                objectIdField: 'OBJECTID',
                globalIdField: '',
                typeIdField: '',
                fields: [
                    { name: 'OBJECTID', type: 'esriFieldTypeOID', alias: 'OBJECTID', nullable: false, editable: false },
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
                    // Password setup/reset fields
                    { name: 'SetupToken', type: 'esriFieldTypeString', alias: 'Setup Token', length: 255, nullable: true, editable: true },
                    { name: 'SetupTokenExpiry', type: 'esriFieldTypeDouble', alias: 'Setup Token Expiry', nullable: true, editable: true },
                    { name: 'PasswordSet', type: 'esriFieldTypeInteger', alias: 'Password Set', nullable: true, editable: true },
                    { name: 'ResetToken', type: 'esriFieldTypeString', alias: 'Reset Token', length: 255, nullable: true, editable: true },
                    { name: 'ResetTokenExpiry', type: 'esriFieldTypeDouble', alias: 'Reset Token Expiry', nullable: true, editable: true },
                    // Assignment approval fields
                    { name: 'PendingManagerID', type: 'esriFieldTypeString', alias: 'Pending Manager ID', length: 50, nullable: true, editable: true },
                    { name: 'AssignmentToken', type: 'esriFieldTypeString', alias: 'Assignment Token', length: 255, nullable: true, editable: true },
                    { name: 'AssignmentTokenExpiry', type: 'esriFieldTypeDouble', alias: 'Assignment Token Expiry', nullable: true, editable: true },
                    { name: 'AssignmentStatus', type: 'esriFieldTypeString', alias: 'Assignment Status', length: 50, nullable: true, editable: true }
                ],
                types: [],
                templates: [],
                capabilities: 'Create,Delete,Query,Update,Editing'
            },
            {
                id: 1,
                name: 'LeaveRequests',
                type: 'Table',
                displayField: 'EmployeeID',
                description: 'Leave request records',
                copyrightText: '',
                defaultVisibility: true,
                relationships: [],
                isDataVersioned: false,
                supportsRollbackOnFailureParameter: true,
                supportsAdvancedQueries: true,
                supportsStatistics: true,
                supportsPercentileStatistics: true,
                supportedQueryFormats: 'JSON',
                hasM: false,
                hasZ: false,
                allowGeometryUpdates: false,
                hasAttachments: false,
                htmlPopupType: 'esriServerHTMLPopupTypeNone',
                objectIdField: 'OBJECTID',
                globalIdField: '',
                typeIdField: '',
                fields: [
                    { name: 'OBJECTID', type: 'esriFieldTypeOID', alias: 'OBJECTID', nullable: false, editable: false },
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
                    // Extension fields
                    { name: 'ExtensionRequested', type: 'esriFieldTypeInteger', alias: 'Extension Requested', nullable: true, editable: true },
                    { name: 'ExtensionDays', type: 'esriFieldTypeDouble', alias: 'Extension Days', nullable: true, editable: true },
                    { name: 'ExtensionReason', type: 'esriFieldTypeString', alias: 'Extension Reason', length: 500, nullable: true, editable: true },
                    { name: 'ExtensionStatus', type: 'esriFieldTypeString', alias: 'Extension Status', length: 50, nullable: true, editable: true },
                    { name: 'OriginalEndDate', type: 'esriFieldTypeDate', alias: 'Original End Date', nullable: true, editable: true }
                ],
                types: [],
                templates: [],
                capabilities: 'Create,Delete,Query,Update,Editing'
            },
            {
                id: 2,
                name: 'Departments',
                type: 'Table',
                displayField: 'DepartmentName',
                description: 'Department records',
                copyrightText: '',
                defaultVisibility: true,
                relationships: [],
                isDataVersioned: false,
                supportsRollbackOnFailureParameter: true,
                supportsAdvancedQueries: true,
                supportsStatistics: true,
                supportsPercentileStatistics: true,
                supportedQueryFormats: 'JSON',
                hasM: false,
                hasZ: false,
                allowGeometryUpdates: false,
                hasAttachments: false,
                htmlPopupType: 'esriServerHTMLPopupTypeNone',
                objectIdField: 'OBJECTID',
                globalIdField: '',
                typeIdField: '',
                fields: [
                    { name: 'OBJECTID', type: 'esriFieldTypeOID', alias: 'OBJECTID', nullable: false, editable: false },
                    { name: 'DepartmentID', type: 'esriFieldTypeString', alias: 'Department ID', length: 50, nullable: true, editable: true },
                    { name: 'DepartmentName', type: 'esriFieldTypeString', alias: 'Department Name', length: 100, nullable: true, editable: true },
                    { name: 'Description', type: 'esriFieldTypeString', alias: 'Description', length: 500, nullable: true, editable: true },
                    { name: 'ManagerID', type: 'esriFieldTypeString', alias: 'Manager ID', length: 50, nullable: true, editable: true },
                    { name: 'CreatedDate', type: 'esriFieldTypeDate', alias: 'Created Date', nullable: true, editable: true }
                ],
                types: [],
                templates: [],
                capabilities: 'Create,Delete,Query,Update,Editing'
            }
        ]
    };

    const response = await fetch(`${adminUrl}/addToDefinition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            addToDefinition: JSON.stringify(layerDefinitions),
            f: 'json',
            token: token
        })
    });

    const data = await response.json();
    if (data.error) {
        throw new Error(`Add layers error: ${JSON.stringify(data.error)}`);
    }
    
    console.log('✅ Layers added successfully');
    return data;
}

async function addAdminUser(serviceUrl, token) {
    console.log('👤 Adding admin user...');
    
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

    const response = await fetch(`${serviceUrl}/0/addFeatures`, {
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
        throw new Error(`Add admin user error: ${JSON.stringify(data.error)}`);
    }
    
    if (data.addResults?.[0]?.success) {
        console.log('✅ Admin user created successfully');
        console.log('   Username: simbai');
        console.log('   Password: admin');
    } else {
        console.log('⚠️ Admin user creation result:', JSON.stringify(data.addResults));
    }
    
    return data;
}

async function main() {
    console.log('🚀 Starting LeaveTracker Feature Service creation...\n');
    
    try {
        // Step 1: Get user token (required for content creation)
        const token = await getUserToken();
        
        // Step 2: Get user info
        const userInfo = await getUserInfo(token);
        console.log(`📍 Logged in as: ${userInfo.username}`);
        
        // Step 3: Create Feature Service
        const service = await createFeatureService(token, userInfo);
        const serviceUrl = service.serviceurl;
        
        // Step 4: Add layers
        await addLayersToService(serviceUrl, token);
        
        // Step 5: Add admin user
        await addAdminUser(serviceUrl, token);
        
        // Print summary
        console.log('\n========================================');
        console.log('✅ FEATURE SERVICE CREATED SUCCESSFULLY');
        console.log('========================================\n');
        console.log('Service URL:', serviceUrl);
        console.log('Employees Table:', `${serviceUrl}/0`);
        console.log('LeaveRequests Table:', `${serviceUrl}/1`);
        console.log('Departments Table:', `${serviceUrl}/2`);
        console.log('\n📋 Update your .env file with these URLs:');
        console.log(`LEAVE_TRACKER_SERVICE_URL=${serviceUrl}`);
        console.log(`EMPLOYEES_TABLE_URL=${serviceUrl}/0`);
        console.log(`LEAVE_REQUESTS_TABLE_URL=${serviceUrl}/1`);
        console.log(`DEPARTMENTS_TABLE_URL=${serviceUrl}/2`);
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

main();
