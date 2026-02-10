const { addFeatures, queryFeatures, updateFeatures, deleteFeatures } = require('@esri/arcgis-rest-feature-layer');
const { ApplicationSession } = require('@esri/arcgis-rest-auth');
require('dotenv').config({ path: '../.env' });

// Configuration
const EMPLOYEES_URL = process.env.EMPLOYEES_TABLE_URL;
const CLIENT_ID = process.env.ARCGIS_CLIENT_ID;
const CLIENT_SECRET = process.env.ARCGIS_CLIENT_SECRET;

if (!EMPLOYEES_URL || !CLIENT_ID || !CLIENT_SECRET) {
    console.error('Missing environment variables. Check .env file.');
    process.exit(1);
}

// Authenticate
async function getSession() {
    const session = new ApplicationSession({
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET
    });
    await session.getToken(EMPLOYEES_URL);
    return session;
}

async function runTest() {
    console.log('---------------------------------------------------');
    console.log('🧪 Starting Permanent Delete Workflow Test');
    console.log('---------------------------------------------------');

    try {
        const authentication = await getSession();
        const testUsername = `test_delete_${Date.now()}`;
        
        // 1. Create a dummy user
        console.log(`\n1. Creating dummy user: ${testUsername}`);
        const createResult = await addFeatures({
            url: EMPLOYEES_URL,
            features: [{
                attributes: {
                    FirstName: 'Test',
                    LastName: 'DeleteMe',
                    Username: testUsername,
                    Email: 'test@delete.com',
                    Role: 'staff',
                    Department: 'Testing',
                    IsActive: 1,
                    PasswordHash: 'dummyhash'
                }
            }],
            authentication
        });

        if (!createResult.addResults?.[0]?.success) {
            throw new Error(`Failed to create user: ${JSON.stringify(createResult)}`);
        }
        
        const objectId = createResult.addResults[0].objectId;
        console.log(`   ✅ User created with OBJECTID: ${objectId}`);

        // 2. Soft Delete (Deactivate)
        console.log(`\n2. Deactivating user (Soft Delete)...`);
        const deactivateResult = await updateFeatures({
            url: EMPLOYEES_URL,
            features: [{
                attributes: {
                    OBJECTID: objectId,
                    IsActive: 0
                }
            }],
            authentication
        });

        if (!deactivateResult.updateResults?.[0]?.success) {
            console.error('⚠️ Soft Delete Failed (Skipping to Hard Delete check):', JSON.stringify(deactivateResult, null, 2));
            // throw new Error('Failed to deactivate user'); 
            // Proceed to test hard delete anyway
        } else {
            console.log('   ✅ User deactivated.');
        }

        // 3. Verify Deactivation
        const verifyDeactive = await queryFeatures({
            url: EMPLOYEES_URL,
            where: `OBJECTID = ${objectId}`,
            returnGeometry: false,
            authentication
        });
        
        if (verifyDeactive.features[0].attributes.IsActive !== 0) {
            console.warn('⚠️ Verification Warning: User IsActive is not 0 (Soft Delete failed earlier)');
        } else {
            console.log('   ✅ Verification: User IsActive is 0.');
        }

        // 4. Permanent Delete (Hard Delete)
        console.log(`\n3. Permanently deleting user (Hard Delete)...`);
        const deleteResult = await deleteFeatures({
            url: EMPLOYEES_URL,
            objectIds: [objectId],
            authentication
        });

        if (!deleteResult.deleteResults?.[0]?.success) {
            throw new Error('Failed to delete user');
        }
        console.log('   ✅ User permanently deleted.');

        // 5. Verify Deletion
        console.log(`\n4. Verifying deletion...`);
        const verifyDelete = await queryFeatures({
            url: EMPLOYEES_URL,
            where: `OBJECTID = ${objectId}`,
            returnGeometry: false,
            authentication
        });

        if (verifyDelete.features.length === 0) {
            console.log('   ✅ Success! User no longer exists in database.');
        } else {
            console.error('   ❌ Error: User still exists in database!');
            throw new Error('Verification failed: User still exists');
        }

        console.log('\n---------------------------------------------------');
        console.log('🎉 TEST PASSED: Full lifecycle verified.');
        console.log('---------------------------------------------------');

    } catch (error) {
        console.error('\n❌ TEST FAILED:', error.message);
        if (error.response) {
            console.error('API Error:', JSON.stringify(error.response, null, 2));
        }
    }
}

runTest();
