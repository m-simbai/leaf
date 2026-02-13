require('dotenv').config();
const { queryFeatures } = require('@esri/arcgis-rest-feature-layer');
const { ApplicationSession } = require('@esri/arcgis-rest-auth');

async function checkSchema() {
    const session = new ApplicationSession({
        clientId: process.env.ARCGIS_CLIENT_ID,
        clientSecret: process.env.ARCGIS_CLIENT_SECRET
    });

    try {
        console.log('Checking LeaveRequests schema...');
        const response = await queryFeatures({
            url: process.env.LEAVE_REQUESTS_TABLE_URL,
            where: '1=1',
            outFields: '*',
            resultRecordCount: 1,
            authentication: session
        });

        if (response.features && response.features.length > 0) {
            console.log('Available fields in LeaveRequests:');
            console.log(Object.keys(response.features[0].attributes).join(', '));
        } else {
            console.log('No features found in LeaveRequests table.');
            // Try to get service info
            const res = await fetch(process.env.LEAVE_REQUESTS_TABLE_URL + '?f=json');
            const data = await res.json();
            console.log('Fields from service metadata:');
            console.log(data.fields.map(f => f.name).join(', '));
        }
    } catch (error) {
        console.error('Error checking schema:', error);
    }
}

checkSchema();
