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

async function listEmployees() {
    console.log('🔍 Listing ALL employees for debugging...');
    const authentication = getSession();

    try {
        const response = await queryFeatures({
            url: EMPLOYEES_URL,
            where: '1=1',
            outFields: 'OBJECTID,Username,Email,FirstName,LastName,SetupToken,ResetToken',
            authentication
        });

        const users = response.features?.map(f => f.attributes) || [];
        console.log(`Found ${users.length} users.`);
        
        users.forEach(u => {
            console.log(`- ${u.FirstName} ${u.LastName} | ${u.Email} | User: ${u.Username} | Setup: ${u.SetupToken ? 'SET' : 'null'} | Reset: ${u.ResetToken ? 'SET' : 'null'}`);
            if (u.Email === 'tagwireyip@gmail.com' || u.Email === 'simbaimutematemi@gmail.com') {
                console.log('  DEBUG:', JSON.stringify(u, null, 2));
            }
        });

    } catch (error) {
        console.error('Failed to fetch users:', error);
    }
}

listEmployees();
