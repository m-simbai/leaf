/**
 * ArcGIS Feature Layer Setup Script
 * 
 * This script creates the required Feature Layers for the Leave Tracker app:
 * 1. Employees - User accounts and authentication
 * 2. LeaveRequests - Leave request submissions
 * 3. Departments - Department information
 * 
 * Usage: node scripts/setup-arcgis-layers.js
 */

require('dotenv').config();
const fetch = require('node-fetch');

const ARCGIS_ORG_URL = process.env.ARCGIS_ORG_URL || 'https://www.arcgis.com';
const CLIENT_ID = process.env.ARCGIS_CLIENT_ID;
const CLIENT_SECRET = process.env.ARCGIS_CLIENT_SECRET;

// Generate OAuth token
async function getToken() {
  console.log('🔐 Getting OAuth token...');
  
  const tokenUrl = `${ARCGIS_ORG_URL}/sharing/rest/oauth2/token`;
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: 'client_credentials',
    expiration: 120
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    body: params
  });

  const data = await response.json();
  
  if (data.error) {
    throw new Error(`Token error: ${data.error.message}`);
  }
  
  console.log('✅ Token obtained successfully');
  return data.access_token;
}

// Create a Feature Service
async function createFeatureService(token, serviceName) {
  console.log(`\n📦 Creating Feature Service: ${serviceName}...`);
  
  const createServiceUrl = `${ARCGIS_ORG_URL}/sharing/rest/content/users/${await getUsername(token)}/createService`;
  
  const serviceDefinition = {
    name: serviceName,
    serviceDescription: 'Leave Tracker Application Data',
    hasStaticData: false,
    maxRecordCount: 2000,
    supportedQueryFormats: 'JSON',
    capabilities: 'Create,Delete,Query,Update,Editing',
    allowGeometryUpdates: true,
    units: 'esriMeters',
    xssPreventionInfo: {
      xssPreventionEnabled: true,
      xssPreventionRule: 'InputOnly',
      xssInputRule: 'rejectInvalid'
    }
  };

  const params = new URLSearchParams({
    createParameters: JSON.stringify(serviceDefinition),
    outputType: 'featureService',
    f: 'json',
    token: token
  });

  const response = await fetch(createServiceUrl, {
    method: 'POST',
    body: params
  });

  const data = await response.json();
  
  if (data.error) {
    if (data.error.message.includes('already exists')) {
      console.log(`⚠️ Service "${serviceName}" already exists`);
      return null;
    }
    throw new Error(`Create service error: ${JSON.stringify(data.error)}`);
  }
  
  console.log(`✅ Feature Service created: ${data.serviceurl}`);
  return data;
}

// Get username from token
async function getUsername(token) {
  const selfUrl = `${ARCGIS_ORG_URL}/sharing/rest/community/self?f=json&token=${token}`;
  const response = await fetch(selfUrl);
  const data = await response.json();
  return data.username;
}

// Add layers to Feature Service
async function addLayersToService(token, serviceUrl) {
  console.log('\n📋 Adding layers to Feature Service...');
  
  const adminUrl = serviceUrl.replace('/rest/services/', '/rest/admin/services/');
  const addToDefinitionUrl = `${adminUrl}/addToDefinition`;

  // Layer definitions
  const layers = [
    {
      name: 'Employees',
      type: 'Table',
      displayField: 'Username',
      objectIdField: 'OBJECTID',
      fields: [
        { name: 'OBJECTID', type: 'esriFieldTypeOID', alias: 'OBJECTID' },
        { name: 'EmployeeID', type: 'esriFieldTypeString', alias: 'Employee ID', length: 50 },
        { name: 'Username', type: 'esriFieldTypeString', alias: 'Username', length: 100 },
        { name: 'PasswordHash', type: 'esriFieldTypeString', alias: 'Password Hash', length: 256 },
        { name: 'FirstName', type: 'esriFieldTypeString', alias: 'First Name', length: 100 },
        { name: 'LastName', type: 'esriFieldTypeString', alias: 'Last Name', length: 100 },
        { name: 'Email', type: 'esriFieldTypeString', alias: 'Email', length: 255 },
        { name: 'Department', type: 'esriFieldTypeString', alias: 'Department', length: 100 },
        { name: 'Role', type: 'esriFieldTypeString', alias: 'Role', length: 20 },
        { name: 'ManagerID', type: 'esriFieldTypeString', alias: 'Manager ID', length: 50 },
        { name: 'AnnualLeaveBalance', type: 'esriFieldTypeInteger', alias: 'Annual Leave Balance' },
        { name: 'SickLeaveBalance', type: 'esriFieldTypeInteger', alias: 'Sick Leave Balance' },
        { name: 'OtherLeaveBalance', type: 'esriFieldTypeInteger', alias: 'Other Leave Balance' },
        { name: 'IsActive', type: 'esriFieldTypeInteger', alias: 'Is Active' },
        { name: 'CreatedDate', type: 'esriFieldTypeDate', alias: 'Created Date' }
      ],
      indexes: [
        { name: 'idx_username', fields: 'Username', isUnique: true },
        { name: 'idx_employeeid', fields: 'EmployeeID', isUnique: true },
        { name: 'idx_email', fields: 'Email', isUnique: true }
      ]
    },
    {
      name: 'LeaveRequests',
      type: 'Table',
      displayField: 'EmployeeName',
      objectIdField: 'OBJECTID',
      fields: [
        { name: 'OBJECTID', type: 'esriFieldTypeOID', alias: 'OBJECTID' },
        { name: 'RequestID', type: 'esriFieldTypeString', alias: 'Request ID', length: 50 },
        { name: 'EmployeeID', type: 'esriFieldTypeString', alias: 'Employee ID', length: 50 },
        { name: 'EmployeeName', type: 'esriFieldTypeString', alias: 'Employee Name', length: 200 },
        { name: 'LeaveType', type: 'esriFieldTypeString', alias: 'Leave Type', length: 20 },
        { name: 'StartDate', type: 'esriFieldTypeDate', alias: 'Start Date' },
        { name: 'EndDate', type: 'esriFieldTypeDate', alias: 'End Date' },
        { name: 'DaysRequested', type: 'esriFieldTypeInteger', alias: 'Days Requested' },
        { name: 'Reason', type: 'esriFieldTypeString', alias: 'Reason', length: 500 },
        { name: 'Status', type: 'esriFieldTypeString', alias: 'Status', length: 20 },
        { name: 'ReviewedBy', type: 'esriFieldTypeString', alias: 'Reviewed By', length: 50 },
        { name: 'ReviewedDate', type: 'esriFieldTypeDate', alias: 'Reviewed Date' },
        { name: 'RejectionReason', type: 'esriFieldTypeString', alias: 'Rejection Reason', length: 500 },
        { name: 'SubmittedDate', type: 'esriFieldTypeDate', alias: 'Submitted Date' }
      ],
      indexes: [
        { name: 'idx_requestid', fields: 'RequestID', isUnique: true },
        { name: 'idx_employeeid_lr', fields: 'EmployeeID', isUnique: false },
        { name: 'idx_status', fields: 'Status', isUnique: false }
      ]
    },
    {
      name: 'Departments',
      type: 'Table',
      displayField: 'DepartmentName',
      objectIdField: 'OBJECTID',
      fields: [
        { name: 'OBJECTID', type: 'esriFieldTypeOID', alias: 'OBJECTID' },
        { name: 'DepartmentID', type: 'esriFieldTypeString', alias: 'Department ID', length: 50 },
        { name: 'DepartmentName', type: 'esriFieldTypeString', alias: 'Department Name', length: 100 },
        { name: 'ManagerID', type: 'esriFieldTypeString', alias: 'Manager ID', length: 50 }
      ],
      indexes: [
        { name: 'idx_deptid', fields: 'DepartmentID', isUnique: true }
      ]
    }
  ];

  const addDefinition = {
    tables: layers
  };

  const params = new URLSearchParams({
    addToDefinition: JSON.stringify(addDefinition),
    f: 'json',
    token: token
  });

  const response = await fetch(addToDefinitionUrl, {
    method: 'POST',
    body: params
  });

  const data = await response.json();
  
  if (data.error) {
    throw new Error(`Add layers error: ${JSON.stringify(data.error)}`);
  }
  
  console.log('✅ Layers added successfully');
  return data;
}

// Add sample data
async function addSampleData(token, serviceUrl) {
  console.log('\n📝 Adding sample data...');
  
  // Add sample employees
  const employeesUrl = `${serviceUrl}/0/addFeatures`;
  
  const sampleEmployees = [
    {
      attributes: {
        EmployeeID: 'EMP001',
        Username: 'admin',
        PasswordHash: 'hashed_password_here', // In production, use bcrypt
        FirstName: 'Admin',
        LastName: 'User',
        Email: 'admin@company.com',
        Department: 'IT',
        Role: 'manager',
        ManagerID: null,
        AnnualLeaveBalance: 20,
        SickLeaveBalance: 15,
        OtherLeaveBalance: 5,
        IsActive: 1,
        CreatedDate: Date.now()
      }
    },
    {
      attributes: {
        EmployeeID: 'EMP002',
        Username: 'employee',
        PasswordHash: 'hashed_password_here',
        FirstName: 'John',
        LastName: 'Doe',
        Email: 'john.doe@company.com',
        Department: 'IT',
        Role: 'staff',
        ManagerID: 'EMP001',
        AnnualLeaveBalance: 15,
        SickLeaveBalance: 10,
        OtherLeaveBalance: 3,
        IsActive: 1,
        CreatedDate: Date.now()
      }
    }
  ];

  const params = new URLSearchParams({
    features: JSON.stringify(sampleEmployees),
    f: 'json',
    token: token
  });

  try {
    const response = await fetch(employeesUrl, {
      method: 'POST',
      body: params
    });

    const data = await response.json();
    
    if (data.addResults) {
      console.log(`✅ Added ${data.addResults.filter(r => r.success).length} sample employees`);
    }
  } catch (err) {
    console.log('⚠️ Could not add sample data (table may not be accessible yet)');
  }
}

// Main execution
async function main() {
  console.log('🚀 Leave Tracker - ArcGIS Feature Layer Setup');
  console.log('='.repeat(50));

  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error('❌ Error: ARCGIS_CLIENT_ID and ARCGIS_CLIENT_SECRET must be set in .env');
    process.exit(1);
  }

  try {
    // Get OAuth token
    const token = await getToken();
    
    // Create Feature Service
    const serviceName = 'LeaveTracker';
    const serviceResult = await createFeatureService(token, serviceName);
    
    if (serviceResult) {
      // Add layers to the service
      await addLayersToService(token, serviceResult.serviceurl);
      
      // Add sample data
      await addSampleData(token, serviceResult.serviceurl);
      
      console.log('\n' + '='.repeat(50));
      console.log('🎉 Setup complete!');
      console.log('\nFeature Service URL:');
      console.log(serviceResult.serviceurl);
      console.log('\nUpdate your .env file with:');
      console.log(`FEATURE_SERVICE_URL=${serviceResult.serviceurl}`);
    } else {
      console.log('\n⚠️ Service already exists. Check ArcGIS Online for the existing service.');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
