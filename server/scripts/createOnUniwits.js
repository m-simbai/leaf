require('dotenv').config();

// Configuration
const NEW_PORTAL_URL = 'https://uniwits.maps.arcgis.com';
const USERNAME = process.env.ARCGIS_USERNAME; // 3050485_uniwits
const PASSWORD = process.env.ARCGIS_PASSWORD; // swimzie11
const SERVICE_NAME = 'LeaveTracker_V2'; // New name to avoid conflicts

async function getAuthToken() {
    console.log(`🔐 Authenticating to ${NEW_PORTAL_URL} as ${USERNAME}...`);
    const response = await fetch(`${NEW_PORTAL_URL}/sharing/rest/generateToken`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            username: USERNAME,
            password: PASSWORD,
            client: 'referer',
            referer: NEW_PORTAL_URL,
            expiration: 60,
            f: 'json'
        })
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    console.log('✅ Authenticated!');
    return { token: data.token, username: USERNAME };
}

async function createService(token) {
    console.log(`🚀 Creating new Service: ${SERVICE_NAME}...`);
    
    // Check if service exists first
    const checkUrl = `${NEW_PORTAL_URL}/sharing/rest/content/users/${USERNAME}/isServiceNameAvailable`;
    const checkRes = await fetch(checkUrl + `?name=${SERVICE_NAME}&type=Feature Service&f=json&token=${token}`);
    const checkData = await checkRes.json();
    
    if (!checkData.available) {
        console.log('⚠️ Service name exists. Finding existing service...');
        // Find it
        const searchUrl = `${NEW_PORTAL_URL}/sharing/rest/search?q=title:${SERVICE_NAME} AND owner:${USERNAME}&f=json&token=${token}`;
        const searchRes = await fetch(searchUrl);
        const searchData = await searchRes.json();
        if (searchData.results?.[0]) {
            console.log('✅ Found existing service:', searchData.results[0].url);
            return searchData.results[0].url;
        }
    }

    // Create Service Item
    const createUrl = `${NEW_PORTAL_URL}/sharing/rest/content/users/${USERNAME}/createService`;
    const createParams = new URLSearchParams({
        createParameters: JSON.stringify({
            name: SERVICE_NAME,
            serviceDescription: "Leave Tracker Application Data (V2)",
            hasStaticData: false,
            maxRecordCount: 1000,
            supportedQueryFormats: "JSON",
            capabilities: "Query,Create,Delete,Update,Editing"
        }),
        outputType: 'featureService',
        f: 'json',
        token: token
    });
    
    const createRes = await fetch(createUrl, { method: 'POST', body: createParams });
    const createData = await createRes.json();
    
    if (!createData.success) throw new Error('Create Service failed: ' + JSON.stringify(createData));
    
    console.log('✅ Service Item Created:', createData.serviceurl);
    return createData.serviceurl;
}

async function addLayers(serviceUrl, token) {
    console.log('📋 Defining Tables (Employees, LeaveRequests, Departments)...');
    
    const adminUrl = serviceUrl.replace('/rest/services/', '/rest/admin/services/');
    const addToDefUrl = `${adminUrl}/addToDefinition`;
    
    const layers = [
        {
            type: "Table",
            name: "Employees",
            fields: [
                { name: "OBJECTID", type: "esriFieldTypeOID", alias: "OBJECTID", nullable: false, editable: false },
                { name: "EmployeeID", type: "esriFieldTypeString", alias: "EmployeeID", length: 50 },
                { name: "FirstName", type: "esriFieldTypeString", alias: "First Name", length: 100 },
                { name: "LastName", type: "esriFieldTypeString", alias: "Last Name", length: 100 },
                { name: "Email", type: "esriFieldTypeString", alias: "Email", length: 255 },
                { name: "Username", type: "esriFieldTypeString", alias: "Username", length: 100 },
                { name: "PasswordHash", type: "esriFieldTypeString", alias: "Password Hash", length: 255 },
                { name: "Role", type: "esriFieldTypeString", alias: "Role", length: 50 },
                { name: "Department", type: "esriFieldTypeString", alias: "Department", length: 100 },
                { name: "ManagerID", type: "esriFieldTypeString", alias: "Manager ID", length: 50 },
                { name: "AnnualLeaveBalance", type: "esriFieldTypeDouble", alias: "Annual Leave Balance" },
                { name: "SickLeaveBalance", type: "esriFieldTypeDouble", alias: "Sick Leave Balance" },
                { name: "OtherLeaveBalance", type: "esriFieldTypeDouble", alias: "Other Leave Balance" },
                { name: "IsActive", type: "esriFieldTypeInteger", alias: "Is Active" },
                { name: "PasswordSet", type: "esriFieldTypeInteger", alias: "Password Set" },
                { name: "CreatedDate", type: "esriFieldTypeDate", alias: "Created Date" },
                { name: "ResetToken", type: "esriFieldTypeString", alias: "Reset Token", length: 255 },
                { name: "ResetTokenExpiry", type: "esriFieldTypeDate", alias: "Reset Token Expiry" },
                { name: "SetupToken", type: "esriFieldTypeString", alias: "Setup Token", length: 255 },
                { name: "SetupTokenExpiry", type: "esriFieldTypeDate", alias: "Setup Token Expiry" },
                { name: "PendingManagerID", type: "esriFieldTypeString", alias: "Pending Manager ID", length: 50 },
                { name: "AssignmentToken", type: "esriFieldTypeString", alias: "Assignment Token", length: 255 },
                { name: "AssignmentTokenExpiry", type: "esriFieldTypeDate", alias: "Assignment Token Expiry" },
                { name: "AssignmentStatus", type: "esriFieldTypeString", alias: "Assignment Status", length: 50 },
                { name: "PreviousManagerID", type: "esriFieldTypeString", alias: "Previous Manager ID", length: 50 }
            ]
        },
        {
            type: "Table",
            name: "LeaveRequests",
            fields: [
                { name: "OBJECTID", type: "esriFieldTypeOID", alias: "OBJECTID", nullable: false, editable: false },
                { name: "LeaveID", type: "esriFieldTypeString", alias: "Leave ID", length: 50 },
                { name: "EmployeeID", type: "esriFieldTypeString", alias: "Employee ID", length: 50 },
                { name: "LeaveType", type: "esriFieldTypeString", alias: "Leave Type", length: 50 },
                { name: "StartDate", type: "esriFieldTypeDate", alias: "Start Date" },
                { name: "EndDate", type: "esriFieldTypeDate", alias: "End Date" },
                { name: "Days", type: "esriFieldTypeDouble", alias: "Days" },
                { name: "Status", type: "esriFieldTypeString", alias: "Status", length: 50 },
                { name: "Reason", type: "esriFieldTypeString", alias: "Reason", length: 1000 },
                { name: "ManagerComments", type: "esriFieldTypeString", alias: "Manager Comments", length: 1000 },
                { name: "RejectionReason", type: "esriFieldTypeString", alias: "Rejection Reason", length: 1000 },
                { name: "ApprovalDate", type: "esriFieldTypeDate", alias: "Approval Date" },
                { name: "ApproverID", type: "esriFieldTypeString", alias: "Approver ID", length: 50 },
                { name: "CreatedDate", type: "esriFieldTypeDate", alias: "Created Date" },
                { name: "AttachmentUrl", type: "esriFieldTypeString", alias: "Attachment URL", length: 1000 }
            ]
        },
        {
            type: "Table",
            name: "Departments",
            fields: [
                { name: "OBJECTID", type: "esriFieldTypeOID", alias: "OBJECTID", nullable: false, editable: false },
                { name: "DepartmentID", type: "esriFieldTypeString", alias: "Department ID", length: 50 },
                { name: "Name", type: "esriFieldTypeString", alias: "Name", length: 100 },
                { name: "ManagerID", type: "esriFieldTypeString", alias: "Manager ID", length: 50 },
                { name: "Description", type: "esriFieldTypeString", alias: "Description", length: 500 }
            ]
        }
    ];

    const body = new URLSearchParams({
        addToDefinition: JSON.stringify({ layers: layers }),
        f: 'json',
        token: token
    });
    
    const response = await fetch(addToDefUrl, { method: 'POST', body });
    const data = await response.json();
    
    if (data.error) throw new Error('Add Layers failed: ' + JSON.stringify(data));
    console.log('✅ Tables created successfully!');
    
    return {
        employeesUrl: serviceUrl + '/0',
        leaveRequestsUrl: serviceUrl + '/1',
        departmentsUrl: serviceUrl + '/2'
    };
}

async function addAdmin(employeesUrl, token) {
    console.log('👤 Adding Admin User: simbai...');
    const crypto = require('crypto');
    const admin = {
        attributes: {
            EmployeeID: 'ADMIN001',
            FirstName: 'Simbai',
            LastName: 'Admin',
            Email: 'm.simbai@cheworeconservation.org',
            Username: 'simbai',
            PasswordHash: '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918', // sha256('admin')
            Role: 'admin',
            Department: 'Administration',
            IsActive: 1,
            PasswordSet: 1,
            CreatedDate: Date.now()
        }
    };
    
    const response = await fetch(`${employeesUrl}/addFeatures`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ features: JSON.stringify([admin]), f: 'json', token: token })
    });
    const data = await response.json();
    
    if (data.addResults?.[0]?.success) {
        console.log('✅ Admin user created!');
    } else {
        console.error('❌ Failed to create admin:', JSON.stringify(data));
    }
}

async function main() {
    try {
        const { token } = await getAuthToken();
        const serviceUrl = await createService(token);
        const urls = await addLayers(serviceUrl, token);
        await addAdmin(urls.employeesUrl, token);
        
        console.log('\n=============================================');
        console.log('🎉 SETUP COMPLETE on uniwits.maps.arcgis.com');
        console.log('=============================================');
        console.log('Service URL:', serviceUrl);
        console.log('Employees:', urls.employeesUrl);
        console.log('LeaveRequests:', urls.leaveRequestsUrl);
        console.log('Departments:', urls.departmentsUrl);
        console.log('---------------------------------------------');
        console.log('Please update .env manually or I will do it automatically.');
    } catch (e) {
        console.error('❌ Failed:', e.message);
    }
}

main();
