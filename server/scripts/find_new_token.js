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

async function findToken() {
    const targetToken = '5d1ec82a6df18a12087e2498680cef7d19ea06bfd3bff17065763a7d3566b7e4';
    console.log(`🔍 Searching for ResetToken: ${targetToken}`);
    const authentication = getSession();

    try {
        const response = await queryFeatures({
            url: EMPLOYEES_URL,
            where: `ResetToken = '${targetToken}'`,
            outFields: 'OBJECTID,Username,Email,FirstName,LastName,ResetToken,ResetTokenExpiry',
            authentication
        });

        if (response.features && response.features.length > 0) {
            console.log('✅ Found matching record:');
            console.log(JSON.stringify(response.features[0].attributes, null, 2));
            const now = Date.now();
            const expiry = response.features[0].attributes.ResetTokenExpiry;
            console.log(`Current Time (Local): ${now}`);
            console.log(`Expiry Time:         ${expiry}`);
            console.log(`Is Expired:          ${now > expiry}`);
        } else {
            console.log('❌ No matching record found for this token.');
            
            // Search all active tokens to see what's there
            const allResp = await queryFeatures({
                url: EMPLOYEES_URL,
                where: "ResetToken IS NOT NULL",
                outFields: 'OBJECTID,Email,ResetToken,ResetTokenExpiry',
                authentication
            });
            console.log('--- Current active tokens in DB ---');
            allResp.features?.forEach(f => {
                const u = f.attributes;
                console.log(`- ${u.Email}: ${u.ResetToken} (Expires: ${u.ResetTokenExpiry})`);
            });
        }

    } catch (error) {
        console.error('Search failed:', error);
    }
}

findToken();
