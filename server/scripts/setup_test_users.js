require('dotenv').config();
const { ApplicationSession } = require('@esri/arcgis-rest-auth');
const { queryFeatures, addFeatures, updateFeatures } = require('@esri/arcgis-rest-feature-layer');
const crypto = require('crypto');

const EMPLOYEES_URL = process.env.EMPLOYEES_TABLE_URL;

function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

class CustomUserSession {
    constructor(username, password) {
        this.username = username;
        this.password = password;
        this.token = null;
        this.expires = 0;
    }

    async getToken(url) {
        if (this.token && Date.now() < (this.expires - 60000)) {
            return this.token;
        }
        
        console.log('🔐 Requesting new ArcGIS token for user:', this.username);
        try {
            const response = await fetch('https://www.arcgis.com/sharing/rest/generateToken', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    username: this.username,
                    password: this.password,
                    client: 'referer',
                    referer: 'https://www.arcgis.com',
                    expiration: 60,
                    f: 'json'
                })
            });
            
            const data = await response.json();
            if (data.error) throw new Error(data.error.message);
            
            this.token = data.token;
            this.expires = data.expires; 
            return this.token;
        } catch (error) {
            console.error('Network error requesting token:', error);
            throw error;
        }
    }
}

function getSession() {
    if (process.env.ARCGIS_USERNAME && process.env.ARCGIS_PASSWORD) {
        return new CustomUserSession(process.env.ARCGIS_USERNAME, process.env.ARCGIS_PASSWORD);
    } else {
        return new ApplicationSession({
            clientId: process.env.ARCGIS_CLIENT_ID,
            clientSecret: process.env.ARCGIS_CLIENT_SECRET
        });
    }
}

async function setupUsers() {
    const session = getSession();
    const TEST_PASSWORD = 'password123';
    const hashedPassword = hashPassword(TEST_PASSWORD);

    // 1. Setup Manager
    console.log('Checking for Test Manager...');
    let managerId;
    const managerQuery = await queryFeatures({
        url: EMPLOYEES_URL,
        where: "Username = 'test_manager'",
        outFields: '*',
        returnGeometry: false,
        authentication: session
    });

    if (managerQuery.features.length > 0) {
        const manager = managerQuery.features[0].attributes;
        managerId = manager.EmployeeID;
        console.log(`Manager found: ${managerId}. Updating password...`);
        await updateFeatures({
            url: EMPLOYEES_URL,
            features: [{
                attributes: {
                    OBJECTID: manager.OBJECTID,
                    PasswordHash: hashedPassword,
                    Email: 'manager@example.com',
                    FirstName: 'Test',
                    LastName: 'Manager',
                    Role: 'manager',
                    IsActive: 1
                }
            }],
            authentication: session
        });
    } else {
        console.log('Creating Test Manager...');
        managerId = `EMP${Date.now()}`;
        await addFeatures({
            url: EMPLOYEES_URL,
            features: [{
                attributes: {
                    Username: 'test_manager',
                    PasswordHash: hashedPassword,
                    Email: 'manager@example.com',
                    FirstName: 'Test',
                    LastName: 'Manager',
                    Role: 'manager',
                    EmployeeID: managerId,
                    Department: 'IT',
                    AnnualLeaveBalance: 20,
                    SickLeaveBalance: 10,
                    IsActive: 1,
                    StartDate: Date.now()
                }
            }],
            authentication: session
        });
    }

    // 2. Setup Employee
    console.log('Checking for Test Employee...');
    const empQuery = await queryFeatures({
        url: EMPLOYEES_URL,
        where: "Username = 'test_employee'",
        outFields: '*',
        returnGeometry: false,
        authentication: session
    });

    if (empQuery.features.length > 0) {
        const emp = empQuery.features[0].attributes;
        console.log(`Employee found: ${emp.EmployeeID}. Updating manager and password...`);
        await updateFeatures({
            url: EMPLOYEES_URL,
            features: [{
                attributes: {
                    OBJECTID: emp.OBJECTID,
                    PasswordHash: hashedPassword,
                    Email: 'employee@example.com',
                    ManagerID: managerId,
                    FirstName: 'Test',
                    LastName: 'Employee',
                    Role: 'staff',
                    IsActive: 1
                }
            }],
            authentication: session
        });
    } else {
        console.log('Creating Test Employee...');
        const empId = `EMP${Date.now() + 1}`;
        await addFeatures({
            url: EMPLOYEES_URL,
            features: [{
                attributes: {
                    Username: 'test_employee',
                    PasswordHash: hashedPassword,
                    Email: 'employee@example.com',
                    ManagerID: managerId,
                    FirstName: 'Test',
                    LastName: 'Employee',
                    Role: 'staff',
                    EmployeeID: empId,
                    Department: 'IT',
                    AnnualLeaveBalance: 20,
                    SickLeaveBalance: 10,
                    IsActive: 1,
                    StartDate: Date.now()
                }
            }],
            authentication: session
        });
    }

    console.log('✅ Test users setup complete.');
    console.log('Manager: test_manager / password123');
    console.log('Employee: test_employee / password123');
}

setupUsers().catch(console.error);
