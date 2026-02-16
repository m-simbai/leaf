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
    const targetToken = '3b2a03599d2a31079fd271b9c001204c0910423e78b0bc488657a59d4d9f7752';
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
            console.log(`Current Time: ${now}`);
            console.log(`Expiry Time:  ${expiry}`);
            console.log(`Is Expired:   ${now > expiry}`);
        } else {
            console.log('❌ No matching record found for this token.');
            
            // Try fuzzy search or list all again to be sure
            const allResp = await queryFeatures({
                url: EMPLOYEES_URL,
                where: "ResetToken IS NOT NULL",
                outFields: 'OBJECTID,Email,ResetToken',
                authentication
            });
            console.log('Other active reset tokens in system:');
            allResp.features?.forEach(f => {
                console.log(`- ${f.attributes.Email}: ${f.attributes.ResetToken}`);
            });
        }

    } catch (error) {
        console.error('Search failed:', error);
    }
}

findToken();
