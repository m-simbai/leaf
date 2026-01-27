const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { deleteFeatures } = require('@esri/arcgis-rest-feature-layer');
const { ApplicationSession } = require('@esri/arcgis-rest-auth');

const LEAVE_REQUESTS_URL = process.env.LEAVE_REQUESTS_TABLE_URL;

async function clearLeaves() {
    if (!LEAVE_REQUESTS_URL) {
        console.error('LEAVE_REQUESTS_TABLE_URL is missing in .env');
        return;
    }

    console.log('Authenticating...');
    const session = new ApplicationSession({
        clientId: process.env.ARCGIS_CLIENT_ID,
        clientSecret: process.env.ARCGIS_CLIENT_SECRET
    });

    console.log(`Clearing all records from: ${LEAVE_REQUESTS_URL}`);

    try {
        const response = await deleteFeatures({
            url: LEAVE_REQUESTS_URL,
            where: '1=1', // Delete ALL records
            authentication: session
        });

        if (response.deleteResults) {
            console.log(`Successfully deleted ${response.deleteResults.length} records.`);
        } else {
            console.log('No records deleted or unexpected response:', response);
        }
    } catch (error) {
        console.error('Error clearing leaves:', error);
    }
}

clearLeaves();
