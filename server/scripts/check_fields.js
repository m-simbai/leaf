const { ApplicationSession, UserSession } = require('@esri/arcgis-rest-auth');
require('dotenv').config();
const { queryFeatures } = require('@esri/arcgis-rest-feature-layer');

const LEAVE_REQUESTS_URL = process.env.LEAVE_REQUESTS_TABLE_URL;

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

async function checkFields() {
    const authentication = getSession();
    try {
        const response = await queryFeatures({
            url: LEAVE_REQUESTS_URL,
            where: '1=1',
            outFields: '*',
            resultRecordCount: 1,
            authentication
        });

        if (response.features && response.features.length > 0) {
            console.log('--- FIELDS ---');
            console.log(Object.keys(response.features[0].attributes).join(', '));
            console.log('--- DATA ---');
            console.log(JSON.stringify(response.features[0].attributes, null, 2));
        }
    } catch (error) {
        console.error(error);
    }
}

checkFields();
