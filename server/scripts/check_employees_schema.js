const { ApplicationSession, UserSession } = require('@esri/arcgis-rest-auth');
require('dotenv').config();
const { request } = require('@esri/arcgis-rest-request');

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

async function checkSchema() {
    console.log('🔍 Checking Employees table schema...');
    const authentication = getSession();

    try {
        const response = await request(EMPLOYEES_URL + '?f=json', { authentication });
        
        const tokenFields = response.fields.filter(f => 
            f.name === 'SetupToken' || f.name === 'ResetToken'
        );
        
        console.log('Token Fields Configuration:');
        console.log(JSON.stringify(tokenFields, null, 2));

    } catch (error) {
        console.error('Failed to fetch schema:', error);
    }
}

checkSchema();
