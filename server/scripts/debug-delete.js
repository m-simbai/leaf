const { deleteFeatures } = require('@esri/arcgis-rest-feature-layer');
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


        
        const objectId = 6;
        const SERVICE_URL = process.env.LEAVE_TRACKER_SERVICE_URL;
        const applyEditsUrl = `${SERVICE_URL}/applyEdits`;
        const token = await session.getToken(SERVICE_URL);

        // Service-level applyEdits uses 'edits' parameter
        const editsPayload = [
            {
                id: 0, // Layer ID for Employees
                deletes: [objectId]
            }
        ];

        const params = new URLSearchParams({
            f: 'json',
            token: token,
            edits: JSON.stringify(editsPayload),
            rollbackOnFailure: false
        });
        
        console.log('Sending Params to Service Root:', params.toString());
        
        const response = await fetch(applyEditsUrl, {
            method: 'POST',
            body: params
        });
        
        const data = await response.json();
        console.log('Manual ApplyEdits Result:', JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Error:', e);
    }
}

run();
