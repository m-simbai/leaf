/**
 * Reset admin password to 'admin'
 */
require('dotenv').config();
const crypto = require('crypto');
const { ApplicationSession } = require('@esri/arcgis-rest-auth');

async function main() {
    console.log('🔄 Resetting admin password...\n');
    
    const session = new ApplicationSession({
        clientId: process.env.ARCGIS_CLIENT_ID,
        clientSecret: process.env.ARCGIS_CLIENT_SECRET
    });
    const token = await session.getToken('https://www.arcgis.com');
    
    // Find admin user
    const queryUrl = `${process.env.EMPLOYEES_TABLE_URL}/query?where=Username='simbai'&outFields=OBJECTID,Username&f=json&token=${token}`;
    const queryRes = await fetch(queryUrl);
    const queryData = await queryRes.json();
    
    if (!queryData.features || queryData.features.length === 0) {
        console.log('❌ No admin user found!');
        return;
    }
    
    const objectId = queryData.features[0].attributes.OBJECTID;
    console.log('Found admin user with OBJECTID:', objectId);
    
    // Calculate password hash
    const passwordHash = crypto.createHash('sha256').update('admin').digest('hex');
    console.log('New password hash:', passwordHash);
    
    // Update password
    const updateData = [{
        attributes: {
            OBJECTID: objectId,
            PasswordHash: passwordHash,
            PasswordSet: 1
        }
    }];
    
    const updateUrl = `${process.env.EMPLOYEES_TABLE_URL}/updateFeatures`;
    const updateRes = await fetch(updateUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            features: JSON.stringify(updateData),
            f: 'json',
            token: token
        })
    });
    
    const updateResult = await updateRes.json();
    
    if (updateResult.updateResults?.[0]?.success) {
        console.log('✅ Password reset successfully!');
        console.log('\nLogin credentials:');
        console.log('   Username: simbai');
        console.log('   Password: admin');
    } else {
        console.log('❌ Update failed:', JSON.stringify(updateResult));
    }
}

main().catch(console.error);
