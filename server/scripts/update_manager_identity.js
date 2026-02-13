const { ApplicationSession, UserSession } = require('@esri/arcgis-rest-auth');
require('dotenv').config();
const { updateFeatures, queryFeatures } = require('@esri/arcgis-rest-feature-layer');

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

async function updateManager() {
    console.log('🔧 Updating Employee EMP001 (Manager) identity...');
    const authentication = getSession();

    try {
        // 1. Get OBJECTID for EMP001
        const queryRes = await queryFeatures({
            url: EMPLOYEES_URL,
            where: "EmployeeID = 'EMP001'",
            outFields: 'OBJECTID',
            returnGeometry: false,
            authentication
        });

        if (!queryRes.features || queryRes.features.length === 0) {
            console.error('Employee EMP001 not found.');
            return;
        }

        const objectId = queryRes.features[0].attributes.OBJECTID;
        console.log(`Found EMP001 with OBJECTID: ${objectId}`);

        // 2. Update with new identity
        const response = await updateFeatures({
            url: EMPLOYEES_URL,
            features: [{
                attributes: {
                    OBJECTID: objectId,
                    FirstName: 'System',
                    LastName: 'Manager',
                    Email: 'simbaimutematemi+manager@gmail.com'
                }
            }],
            authentication
        });

        if (response.updateResults && response.updateResults[0].success) {
            console.log('✅ Manager identity updated successfully (EMP001).');
        } else {
            console.error('❌ Update failed:', response);
        }

    } catch (error) {
        console.error('Error updating manager:', error);
    }
}

updateManager();
