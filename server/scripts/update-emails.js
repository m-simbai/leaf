/**
 * Update Employees with Email Addresses
 * Run this to add email addresses to the test users
 */

require('dotenv').config();
const fetch = require('node-fetch');

const EMPLOYEES_URL = process.env.EMPLOYEES_TABLE_URL;
const CLIENT_ID = process.env.ARCGIS_CLIENT_ID;
const CLIENT_SECRET = process.env.ARCGIS_CLIENT_SECRET;

async function getToken() {
    const response = await fetch('https://www.arcgis.com/sharing/rest/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            grant_type: 'client_credentials'
        })
    });
    const data = await response.json();
    return data.access_token;
}

async function updateEmails() {
    console.log('Getting access token...');
    const token = await getToken();
    
    // Email updates for each user
    const emailUpdates = [
        { username: 'simba', email: 'm.simbai@cheworeconservation.org' },
        { username: 'admin', email: 'p.tagwireyi@cheworeconservation.org' }
    ];
    
    for (const update of emailUpdates) {
        console.log(`\nUpdating email for ${update.username}...`);
        
        // First, find the user by username
        const queryUrl = `${EMPLOYEES_URL}/query?where=Username='${update.username}'&outFields=OBJECTID,Username,Email&f=json&token=${token}`;
        const queryResponse = await fetch(queryUrl);
        const queryData = await queryResponse.json();
        
        if (queryData.features && queryData.features.length > 0) {
            const objectId = queryData.features[0].attributes.OBJECTID;
            const currentEmail = queryData.features[0].attributes.Email;
            
            console.log(`  Found user with OBJECTID: ${objectId}`);
            console.log(`  Current email: ${currentEmail || '(none)'}`);
            
            // Update the email
            const updateUrl = `${EMPLOYEES_URL}/updateFeatures`;
            const updateBody = new URLSearchParams({
                f: 'json',
                token: token,
                features: JSON.stringify([{
                    attributes: {
                        OBJECTID: objectId,
                        Email: update.email
                    }
                }])
            });
            
            const updateResponse = await fetch(updateUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: updateBody
            });
            
            const updateResult = await updateResponse.json();
            
            if (updateResult.updateResults && updateResult.updateResults[0].success) {
                console.log(`  ✅ Email updated to: ${update.email}`);
            } else {
                console.log(`  ❌ Failed to update email:`, updateResult);
            }
        } else {
            console.log(`  ⚠️ User ${update.username} not found`);
        }
    }
    
    console.log('\n✅ Done!');
}

updateEmails().catch(console.error);
