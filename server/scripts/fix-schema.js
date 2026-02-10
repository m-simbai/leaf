const { request } = require('@esri/arcgis-rest-request');
const { ApplicationSession } = require('@esri/arcgis-rest-auth');
require('dotenv').config({ path: '../.env' });

const EMPLOYEES_URL = process.env.EMPLOYEES_TABLE_URL;
const CLIENT_ID = process.env.ARCGIS_CLIENT_ID;
const CLIENT_SECRET = process.env.ARCGIS_CLIENT_SECRET;

async function run() {
    try {
        const session = new ApplicationSession({
            clientId: CLIENT_ID,
            clientSecret: CLIENT_SECRET
        });
        await session.getToken(EMPLOYEES_URL);

        console.log('Attempting to update definition for IsActive alias...');
        
        // Update alias to remove space
        const updateDef = {
            fields: [
                { name: 'IsActive', alias: 'IsActive' }, // Changed from "Is Active"
                { name: 'EmployeeID', alias: 'EmployeeID' }, // Also fix others just in case? "Employee ID" -> "EmployeeID"
                { name: 'FirstName', alias: 'FirstName' }, // "First Name"
                { name: 'LastName', alias: 'LastName' }    // "Last Name"
            ]
        };
        
        const updateUrl = `${EMPLOYEES_URL}/updateDefinition`;
        
        console.log(`Sending update request to ${updateUrl}...`);
        
        const response = await request(updateUrl, {
            params: {
                updateDefinition: JSON.stringify(updateDef),
                 f: 'json'
            },
            authentication: session,
            httpMethod: 'POST'
        });
        
        console.log('Update Result:', JSON.stringify(response, null, 2));

    } catch (e) {
        console.error('Error:', JSON.stringify(e, null, 2));
    }
}

run();
