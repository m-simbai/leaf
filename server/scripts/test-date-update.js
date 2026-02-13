
require('dotenv').config();
const { ApplicationSession } = require('@esri/arcgis-rest-auth');
const { updateFeatures, queryFeatures } = require('@esri/arcgis-rest-feature-layer');
const fetch = require('node-fetch');

// Polyfill fetch and form-data for Node environment
if (!global.fetch) {
    global.fetch = fetch;
    global.Headers = fetch.Headers;
    global.Request = fetch.Request;
    global.Response = fetch.Response;
}
const FormData = require('form-data');
if (!global.FormData) {
    global.FormData = FormData;
}

async function testUpdate() {
    console.log('Testing StartDate update...');
    
    // 1. Authenticate (simulate server session)
    const authentication = new ApplicationSession({
        clientId: process.env.ARCGIS_CLIENT_ID,
        clientSecret: process.env.ARCGIS_CLIENT_SECRET
    });
    
    const employeesUrl = process.env.EMPLOYEES_TABLE_URL;
    
    // 2. Get testuser
    const queryRes = await queryFeatures({
        url: employeesUrl,
        where: "Username = 'testuser'",
        outFields: '*',
        authentication
    });
    
    if (!queryRes.features || queryRes.features.length === 0) {
        console.error('Test user not found');
        return;
    }
    
    const user = queryRes.features[0];
    console.log('Current StartDate:', user.attributes.StartDate);
    
    // 3. Try update with ISO String (since Int64 failed)
    console.log('Attempt 2: Update with ISO String...');
    try {
        const isoString = new Date('2026-01-01').toISOString();
        const res2 = await updateFeatures({
            url: employeesUrl,
            features: [{
                attributes: {
                    OBJECTID: user.attributes.OBJECTID,
                    StartDate: isoString
                }
            }],
            authentication
        });
        console.log('Result 2:', JSON.stringify(res2, null, 2));
    } catch (e) {
        console.error('Error 2:', e.message);
        if (e.response) console.error('Response:', await e.response.text());
    }
}

testUpdate().catch(console.error);
