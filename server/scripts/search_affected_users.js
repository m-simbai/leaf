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

async function search() {
    const authentication = getSession();
    try {
        console.log('🔍 Searching for all users associated with Paradzayi or Tagwireyi...');
        const response = await queryFeatures({
            url: EMPLOYEES_URL,
            where: "FirstName LIKE '%Paradzayi%' OR LastName LIKE '%Tagwireyi%' OR Email LIKE '%tagwireyip%' OR Username LIKE '%tagwireyip%' OR Username LIKE '%ptagwirei%'",
            outFields: 'OBJECTID,Username,Email,FirstName,LastName,ResetToken',
            authentication
        });

        console.log(`Found ${response.features?.length || 0} records:`);
        response.features?.forEach(f => {
            console.log(JSON.stringify(f.attributes, null, 2));
        });

    } catch (e) { console.error(e); }
}

search();
