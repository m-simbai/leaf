const { ApplicationSession, UserSession } = require('@esri/arcgis-rest-auth');
require('dotenv').config();
const { updateFeatures, queryFeatures } = require('@esri/arcgis-rest-feature-layer');

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

async function migrateFields() {
    console.log('🔧 Migrating legacy Days data to DaysRequested...');
    const authentication = getSession();

    try {
        const response = await queryFeatures({
            url: LEAVE_REQUESTS_URL,
            where: 'DaysRequested IS NULL',
            outFields: 'OBJECTID,Days',
            authentication
        });

        if (!response.features || response.features.length === 0) {
            console.log('✨ All records already have DaysRequested populated.');
            return;
        }

        const updates = response.features.map(f => {
            // Note: If Days is also missing, default to 1
            const days = f.attributes.Days || 1;
            return {
                attributes: {
                    OBJECTID: f.attributes.OBJECTID,
                    DaysRequested: parseInt(days)
                }
            };
        });

        const res = await updateFeatures({
            url: LEAVE_REQUESTS_URL,
            features: updates,
            authentication
        });

        console.log(`✅ Migrated ${updates.length} records.`);
        console.log(JSON.stringify(res.updateResults));

    } catch (error) {
        console.error('Migration failed:', error);
    }
}

migrateFields();
