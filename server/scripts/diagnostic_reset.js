const { ApplicationSession, UserSession } = require('@esri/arcgis-rest-auth');
require('dotenv').config();
const { queryFeatures, updateFeatures } = require('@esri/arcgis-rest-feature-layer');
const crypto = require('crypto');

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

async function diagnostic() {
    const email = 'tagwireyip@gmail.com';
    console.log(`🧪 Diagnostic for ${email}...`);
    const authentication = getSession();

    try {
        // 1. Find user
        const findResp = await queryFeatures({
            url: EMPLOYEES_URL,
            where: `Email = '${email}'`,
            outFields: 'OBJECTID,Username,Email,ResetToken',
            authentication
        });

        if (!findResp.features || findResp.features.length === 0) {
            console.error('❌ User not found with this email!');
            return;
        }

        const user = findResp.features[0].attributes;
        console.log(`✅ Found User: ${user.Username} (OID: ${user.OBJECTID})`);
        console.log(`Current Token in DB: ${user.ResetToken || 'null'}`);

        // 2. Generate new token
        const testToken = crypto.randomBytes(32).toString('hex');
        const expiry = Date.now() + 3600000;
        console.log(`🆕 Generated Test Token: ${testToken}`);

        // 3. Update DB
        console.log('⏳ Updating database...');
        const updateResp = await updateFeatures({
            url: EMPLOYEES_URL,
            features: [{
                attributes: {
                    OBJECTID: user.OBJECTID,
                    ResetToken: testToken,
                    ResetTokenExpiry: expiry
                }
            }],
            authentication
        });

        if (updateResp.updateResults?.[0]?.success) {
            console.log('✅ Database update successful!');
        } else {
            console.error('❌ Database update failed:', JSON.stringify(updateResp.updateResults, null, 2));
            return;
        }

        // 4. Verify immediately
        console.log('🔍 Verifying token retrieval...');
        const verifyResp = await queryFeatures({
            url: EMPLOYEES_URL,
            where: `ResetToken = '${testToken}'`,
            outFields: 'OBJECTID,Email,ResetToken,ResetTokenExpiry',
            authentication
        });

        if (verifyResp.features && verifyResp.features.length > 0) {
            const result = verifyResp.features[0].attributes;
            console.log('✅ Token VERIFIED in database!');
            console.log(`Retrieved Token: ${result.ResetToken}`);
            console.log(`Match: ${result.ResetToken === testToken}`);
        } else {
            console.error('❌ Token NOT FOUND in database after update!');
            
            // Try searching by OBJECTID to see what's actually there
            const oidCheck = await queryFeatures({
                url: EMPLOYEES_URL,
                where: `OBJECTID = ${user.OBJECTID}`,
                outFields: 'OBJECTID,Email,ResetToken',
                authentication
            });
            console.log('Value currently at OBJECTID:', oidCheck.features?.[0]?.attributes.ResetToken);
        }

    } catch (error) {
        console.error('Diagnostic error:', error);
    }
}

diagnostic();
