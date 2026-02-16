const { ApplicationSession, UserSession } = require('@esri/arcgis-rest-auth');
require('dotenv').config();
const { queryFeatures } = require('@esri/arcgis-rest-feature-layer');

const EMPLOYEES_URL = process.env.EMPLOYEES_TABLE_URL;

function getSession() {
    if (process.env.ARCGIS_USERNAME && process.env.ARCGIS_PASSWORD) {
        return new UserSession({
            username: process.env.ARCGIS_USERNAME,
            password: process.env.ARCGIS_PASSWORD
        });
    }
    return new ApplicationSession({
        clientId: process.env.ARCGIS_CLIENT_ID,
        clientSecret: process.env.ARCGIS_CLIENT_SECRET
    });
}

async function fullCheck() {
    console.log('🔍 Full Check of affected users...');
    const authentication = getSession();

    try {
        const response = await queryFeatures({
            url: EMPLOYEES_URL,
            where: "Email IN ('simbaimutematemi@gmail.com', 'tagwireyip@gmail.com')",
            outFields: '*',
            authentication
        });

        console.log(`Found ${response.features?.length || 0} matching records.`);
        
        response.features?.forEach(f => {
            console.log('--- RECORD ---');
            console.log(JSON.stringify(f.attributes, null, 2));
        });

    } catch (error) {
        console.error('Check failed:', error);
    }
}

fullCheck();
