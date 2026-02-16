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

async function checkUsers() {
    console.log('🔍 Checking Employee records for debugging...');
    const authentication = getSession();

    try {
        const response = await queryFeatures({
            url: EMPLOYEES_URL,
            where: "Email IN ('simbaimutematemi@gmail.com', 'tagwireyip@gmail.com')",
            outFields: 'OBJECTID,Username,Email,FirstName,LastName,SetupToken,SetupTokenExpiry,ResetToken,ResetTokenExpiry',
            authentication
        });

        console.log('Employee Records:');
        console.log(JSON.stringify(response.features?.map(f => f.attributes), null, 2));

    } catch (error) {
        console.error('Failed to fetch users:', error);
    }
}

checkUsers();
