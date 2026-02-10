const { queryFeatures } = require('@esri/arcgis-rest-feature-layer');
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

        console.log('Querying...');
        const result = await queryFeatures({
            url: EMPLOYEES_URL,
            where: '1=1',
            resultRecordCount: 1,
            authentication: session
        });
        console.log('Query Result:', JSON.stringify(result, null, 2));
    } catch (e) {
        console.error('Error:', e);
    }
}

run();
