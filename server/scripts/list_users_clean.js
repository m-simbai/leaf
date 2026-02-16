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

async function listUsers() {
    const authentication = getSession();
    try {
        const response = await queryFeatures({
            url: EMPLOYEES_URL,
            where: '1=1',
            outFields: 'OBJECTID,Username,Email,FirstName,LastName,ResetToken',
            authentication
        });

        console.log('--- USER LIST ---');
        response.features?.forEach(f => {
            const u = f.attributes;
            console.log(`OID:${u.OBJECTID} | User:${u.Username} | Email:${u.Email} | Name:${u.FirstName} ${u.LastName} | Token:${u.ResetToken ? u.ResetToken.substring(0,8)+'...' : 'null'}`);
        });

    } catch (e) { console.error(e); }
}

listUsers();
