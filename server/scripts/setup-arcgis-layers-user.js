/**
 * ArcGIS Feature Layer Setup Script - User Authentication Version
 * 
 * This script uses your ArcGIS username/password to create Feature Layers.
 * The client credentials OAuth flow doesn't have permissions to create services.
 * 
 * Usage: node scripts/setup-arcgis-layers-user.js
 * 
 * You'll need to add these to your .env:
 * ARCGIS_USERNAME=your_username
 * ARCGIS_PASSWORD=your_password
 */

require('dotenv').config();
const fetch = require('node-fetch');

const ARCGIS_ORG_URL = process.env.ARCGIS_ORG_URL || 'https://www.arcgis.com';
const USERNAME = process.env.ARCGIS_USERNAME;
const PASSWORD = process.env.ARCGIS_PASSWORD;

// Generate token using username/password
async function getToken() {
  console.log('🔐 Getting token with user credentials...');
  
  const tokenUrl = `${ARCGIS_ORG_URL}/sharing/rest/generateToken`;
  const params = new URLSearchParams({
    username: USERNAME,
    password: PASSWORD,
    referer: 'http://localhost:3000',
    expiration: 120,
    f: 'json'
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
  return data.token;
}

// Create a Feature Service
async function createFeatureService(token, serviceName) {
  console.log(`\n📦 Creating Feature Service: ${serviceName}...`);
  
  const createServiceUrl = `${ARCGIS_ORG_URL}/sharing/rest/content/users/${USERNAME}/createService`;
  
  const serviceDefinition = {
    name: serviceName,
    serviceDescription: 'Leave Tracker Application Data',
    hasStaticData: false,
    maxRecordCount: 2000,
    supportedQueryFormats: 'JSON',
    capabilities: 'Create,Delete,Query,Update,Editing',
    allowGeometryUpdates: false,
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
    if (data.error.message && data.error.message.includes('already exists')) {
      console.log(`⚠️ Service "${serviceName}" already exists`);
      // Try to find the existing service
      return await findExistingService(token, serviceName);
    }
    throw new Error(`Create service error: ${JSON.stringify(data.error)}`);
  }
  
  console.log(`✅ Feature Service created!`);
  console.log(`   Service URL: ${data.serviceurl}`);
  console.log(`   Item ID: ${data.itemId}`);
  
  return data;
}

// Find an existing service by name
async function findExistingService(token, serviceName) {
  console.log(`🔍 Looking for existing service: ${serviceName}...`);
  
  const searchUrl = `${ARCGIS_ORG_URL}/sharing/rest/search`;
  const params = new URLSearchParams({
    q: `title:"${serviceName}" AND owner:${USERNAME} AND type:"Feature Service"`,
    f: 'json',
    token: token
  });

  const response = await fetch(`${searchUrl}?${params}`);
  const data = await response.json();
  
  if (data.results && data.results.length > 0) {
    const service = data.results[0];
    console.log(`✅ Found existing service: ${service.url}`);
    return { serviceurl: service.url, itemId: service.id, existing: true };
  }
  
  return null;
}

// Add layers to Feature Service
async function addLayersToService(token, serviceUrl) {
  console.log('\n📋 Adding tables to Feature Service...');
  
  // Convert service URL to admin URL
  const adminUrl = serviceUrl.replace('/rest/services/', '/rest/admin/services/');
  const addToDefinitionUrl = `${adminUrl}/addToDefinition`;

  console.log(`   Admin URL: ${addToDefinitionUrl}`);

  // Table definitions (non-spatial tables)
  const tables = [
    {
      name: 'Employees',
      type: 'Table',
      displayField: 'Username',
      objectIdField: 'OBJECTID',
      globalIdField: 'GlobalID',
      hasGlobalId: true,
      fields: [
        { name: 'OBJECTID', type: 'esriFieldTypeOID', alias: 'OBJECTID' },
        { name: 'GlobalID', type: 'esriFieldTypeGlobalID', alias: 'GlobalID' },
        { name: 'EmployeeID', type: 'esriFieldTypeString', alias: 'Employee ID', length: 50, nullable: false },
        { name: 'Username', type: 'esriFieldTypeString', alias: 'Username', length: 100, nullable: false },
        { name: 'PasswordHash', type: 'esriFieldTypeString', alias: 'Password Hash', length: 256, nullable: false },
        { name: 'FirstName', type: 'esriFieldTypeString', alias: 'First Name', length: 100, nullable: false },
        { name: 'LastName', type: 'esriFieldTypeString', alias: 'Last Name', length: 100, nullable: false },
        { name: 'Email', type: 'esriFieldTypeString', alias: 'Email', length: 255, nullable: false },
        { name: 'Department', type: 'esriFieldTypeString', alias: 'Department', length: 100, nullable: true },
        { name: 'Role', type: 'esriFieldTypeString', alias: 'Role', length: 20, nullable: false, defaultValue: 'staff' },
        { name: 'ManagerID', type: 'esriFieldTypeString', alias: 'Manager ID', length: 50, nullable: true },
        { name: 'AnnualLeaveBalance', type: 'esriFieldTypeInteger', alias: 'Annual Leave Balance', nullable: true, defaultValue: 20 },
        { name: 'SickLeaveBalance', type: 'esriFieldTypeInteger', alias: 'Sick Leave Balance', nullable: true, defaultValue: 15 },
        { name: 'OtherLeaveBalance', type: 'esriFieldTypeInteger', alias: 'Other Leave Balance', nullable: true, defaultValue: 5 },
        { name: 'IsActive', type: 'esriFieldTypeSmallInteger', alias: 'Is Active', nullable: true, defaultValue: 1 },
        { name: 'CreatedDate', type: 'esriFieldTypeDate', alias: 'Created Date', nullable: true }
      ]
    },
    {
      name: 'LeaveRequests',
      type: 'Table',
      displayField: 'EmployeeName',
      objectIdField: 'OBJECTID',
      globalIdField: 'GlobalID',
      hasGlobalId: true,
      fields: [
        { name: 'OBJECTID', type: 'esriFieldTypeOID', alias: 'OBJECTID' },
        { name: 'GlobalID', type: 'esriFieldTypeGlobalID', alias: 'GlobalID' },
        { name: 'RequestID', type: 'esriFieldTypeString', alias: 'Request ID', length: 50, nullable: false },
        { name: 'EmployeeID', type: 'esriFieldTypeString', alias: 'Employee ID', length: 50, nullable: false },
        { name: 'EmployeeName', type: 'esriFieldTypeString', alias: 'Employee Name', length: 200, nullable: true },
        { name: 'LeaveType', type: 'esriFieldTypeString', alias: 'Leave Type', length: 20, nullable: false },
        { name: 'StartDate', type: 'esriFieldTypeDate', alias: 'Start Date', nullable: false },
        { name: 'EndDate', type: 'esriFieldTypeDate', alias: 'End Date', nullable: false },
        { name: 'DaysRequested', type: 'esriFieldTypeInteger', alias: 'Days Requested', nullable: true },
        { name: 'Reason', type: 'esriFieldTypeString', alias: 'Reason', length: 1000, nullable: true },
        { name: 'Status', type: 'esriFieldTypeString', alias: 'Status', length: 20, nullable: false, defaultValue: 'pending' },
        { name: 'ReviewedBy', type: 'esriFieldTypeString', alias: 'Reviewed By', length: 50, nullable: true },
        { name: 'ReviewedDate', type: 'esriFieldTypeDate', alias: 'Reviewed Date', nullable: true },
        { name: 'RejectionReason', type: 'esriFieldTypeString', alias: 'Rejection Reason', length: 1000, nullable: true },
        { name: 'SubmittedDate', type: 'esriFieldTypeDate', alias: 'Submitted Date', nullable: true }
      ]
    },
    {
      name: 'Departments',
      type: 'Table',
      displayField: 'DepartmentName',
      objectIdField: 'OBJECTID',
      globalIdField: 'GlobalID',
      hasGlobalId: true,
      fields: [
        { name: 'OBJECTID', type: 'esriFieldTypeOID', alias: 'OBJECTID' },
        { name: 'GlobalID', type: 'esriFieldTypeGlobalID', alias: 'GlobalID' },
        { name: 'DepartmentID', type: 'esriFieldTypeString', alias: 'Department ID', length: 50, nullable: false },
        { name: 'DepartmentName', type: 'esriFieldTypeString', alias: 'Department Name', length: 100, nullable: false },
        { name: 'ManagerID', type: 'esriFieldTypeString', alias: 'Manager ID', length: 50, nullable: true }
      ]
    }
  ];

  const addDefinition = {
    tables: tables
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
    console.log('⚠️ Add tables error:', JSON.stringify(data.error));
    if (data.error.message && data.error.message.includes('already exists')) {
      console.log('   Tables may already exist');
      return data;
    }
    throw new Error(`Add tables error: ${JSON.stringify(data.error)}`);
  }
  
  console.log('✅ Tables added successfully!');
  console.log(`   Added: Employees, LeaveRequests, Departments`);
  return data;
}

// Add sample data to Employees table
async function addSampleData(token, serviceUrl) {
  console.log('\n📝 Adding sample employee data...');
  
  // Table indices: 0=Employees, 1=LeaveRequests, 2=Departments
  const employeesUrl = `${serviceUrl}/0/addFeatures`;
  
  const sampleEmployees = [
    {
      attributes: {
        EmployeeID: 'EMP001',
        Username: 'admin',
        PasswordHash: '$2b$10$dummyhashforadmin', // In production, use bcrypt
        FirstName: 'Admin',
        LastName: 'Manager',
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
        PasswordHash: '$2b$10$dummyhashforemployee',
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
    },
    {
      attributes: {
        EmployeeID: 'EMP003',
        Username: 'jane',
        PasswordHash: '$2b$10$dummyhashforjane',
        FirstName: 'Jane',
        LastName: 'Smith',
        Email: 'jane.smith@company.com',
        Department: 'HR',
        Role: 'staff',
        ManagerID: 'EMP001',
        AnnualLeaveBalance: 18,
        SickLeaveBalance: 10,
        OtherLeaveBalance: 4,
        IsActive: 1,
        CreatedDate: Date.now()
      }
    }
  ];

  try {
    const params = new URLSearchParams({
      features: JSON.stringify(sampleEmployees),
      f: 'json',
      token: token
    });

    const response = await fetch(employeesUrl, {
      method: 'POST',
      body: params
    });

    const data = await response.json();
    
    if (data.addResults) {
      const success = data.addResults.filter(r => r.success).length;
      const failed = data.addResults.filter(r => !r.success).length;
      console.log(`✅ Added ${success} sample employees`);
      if (failed > 0) {
        console.log(`⚠️ ${failed} failed to add`);
      }
    } else if (data.error) {
      console.log('⚠️ Could not add sample data:', data.error.message);
    }
  } catch (err) {
    console.log('⚠️ Could not add sample data:', err.message);
  }
}

// Add sample department data
async function addSampleDepartments(token, serviceUrl) {
  console.log('\n📝 Adding sample department data...');
  
  const departmentsUrl = `${serviceUrl}/2/addFeatures`;
  
  const sampleDepartments = [
    { attributes: { DepartmentID: 'DEPT001', DepartmentName: 'IT', ManagerID: 'EMP001' } },
    { attributes: { DepartmentID: 'DEPT002', DepartmentName: 'HR', ManagerID: 'EMP001' } },
    { attributes: { DepartmentID: 'DEPT003', DepartmentName: 'Finance', ManagerID: null } }
  ];

  try {
    const params = new URLSearchParams({
      features: JSON.stringify(sampleDepartments),
      f: 'json',
      token: token
    });

    const response = await fetch(departmentsUrl, {
      method: 'POST',
      body: params
    });

    const data = await response.json();
    
    if (data.addResults) {
      console.log(`✅ Added ${data.addResults.filter(r => r.success).length} departments`);
    }
  } catch (err) {
    console.log('⚠️ Could not add department data:', err.message);
  }
}

// Main execution
async function main() {
  console.log('🚀 Leave Tracker - ArcGIS Feature Layer Setup');
  console.log('   Using User Authentication');
  console.log('='.repeat(50));

  if (!USERNAME || !PASSWORD) {
    console.error('\n❌ Error: ARCGIS_USERNAME and ARCGIS_PASSWORD must be set in .env');
    console.log('\nAdd these lines to your .env file:');
    console.log('ARCGIS_USERNAME=your_arcgis_username');
    console.log('ARCGIS_PASSWORD=your_arcgis_password');
    process.exit(1);
  }

  try {
    // Get token using username/password
    const token = await getToken();
    
    // Create Feature Service
    const serviceName = 'LeaveTracker';
    const serviceResult = await createFeatureService(token, serviceName);
    
    if (serviceResult && serviceResult.serviceurl) {
      const serviceUrl = serviceResult.serviceurl;
      
      // Add layers if this is a new service
      if (!serviceResult.existing) {
        await addLayersToService(token, serviceUrl);
        
        // Add sample data
        await addSampleData(token, serviceUrl);
        await addSampleDepartments(token, serviceUrl);
      }
      
      console.log('\n' + '='.repeat(50));
      console.log('🎉 Setup complete!');
      console.log('\n📋 Table URLs:');
      console.log(`   Employees:     ${serviceUrl}/0`);
      console.log(`   LeaveRequests: ${serviceUrl}/1`);
      console.log(`   Departments:   ${serviceUrl}/2`);
      console.log('\n📝 Update your .env file with:');
      console.log(`LEAVE_TRACKER_SERVICE_URL=${serviceUrl}`);
      console.log(`EMPLOYEES_TABLE_URL=${serviceUrl}/0`);
      console.log(`LEAVE_REQUESTS_TABLE_URL=${serviceUrl}/1`);
      console.log(`DEPARTMENTS_TABLE_URL=${serviceUrl}/2`);
    } else {
      console.log('\n❌ Could not create or find service');
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();
