const { ApplicationSession } = require('@esri/arcgis-rest-auth');
require('dotenv').config();
const { updateFeatures, queryFeatures } = require('@esri/arcgis-rest-feature-layer');

const EMPLOYEES_URL = process.env.EMPLOYEES_TABLE_URL;

function getSession() {
    return new ApplicationSession({
        clientId: process.env.ARCGIS_CLIENT_ID,
        clientSecret: process.env.ARCGIS_CLIENT_SECRET
    });
}

async function fixEmail() {
    console.log('🔧 Updating Employee EMP_ADMIN_01 email...');
    const authentication = getSession();

    try {
        // 1. Get OBJECTID
        const queryRes = await queryFeatures({
            url: EMPLOYEES_URL,
            where: "EmployeeID = 'EMP_ADMIN_01'",
            outFields: 'OBJECTID',
            returnGeometry: false,
            authentication
        });

        if (!queryRes.features || queryRes.features.length === 0) {
            console.error('Employee EMP_ADMIN_01 not found.');
            return;
        }

        const objectId = queryRes.features[0].attributes.OBJECTID;
        console.log(`Found EMP_ADMIN_01 with OBJECTID: ${objectId}`);

        // 2. Update
        const response = await updateFeatures({
            url: EMPLOYEES_URL,
            features: [{
                attributes: {
                    OBJECTID: objectId,
                    Email: 'simbaimutematemi@gmail.com'
                }
            }],
            authentication
        });

        if (response.updateResults && response.updateResults[0].success) {
            console.log('✅ Email updated successfully for EMP_ADMIN_01.');
        } else {
            console.error('❌ Update failed:', response);
        }

    } catch (error) {
        console.error('Error updating email:', error);
    }
}

fixEmail();
