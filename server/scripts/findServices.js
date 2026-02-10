/**
 * Script to find LeaveTracker services for the current user
 */
require('dotenv').config();
const { ApplicationSession } = require('@esri/arcgis-rest-auth');

async function main() {
    console.log('🔍 Searching for LeaveTracker services...');
    
    // We'll try to get a token with the username/password to be sure we are looking as the right user
    // Note: ApplicationSession uses ClientID/Secret, which might be linked to a different account if hardcoded
    // But let's try to search using the request parameters if possible, or just use the credentials provided
    
    const username = process.env.ARCGIS_USERNAME;
    const password = process.env.ARCGIS_PASSWORD;
    
    console.log(`User: ${username}`);
    
    try {
        // Generate token using username/password (UserSession equivalent via REST)
        const response = await fetch('https://www.arcgis.com/sharing/rest/generateToken', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                username: username,
                password: password,
                client: 'referer',
                referer: 'https://www.arcgis.com',
                expiration: 60,
                f: 'json'
            })
        });
        
        const data = await response.json();
        
        if (data.error) {
            console.error('❌ Auth Error:', data.error.message);
            console.log('  (This credentials might not be compatible with current ClientID/Secret or just wrong)');
            return;
        }
        
        const token = data.token;
        console.log('✅ Authenticated successfully');
        
        // Search for items
        const searchUrl = `https://www.arcgis.com/sharing/rest/search?q=title:LeaveTracker AND owner:${username}&f=json&token=${token}`;
        const searchRes = await fetch(searchUrl);
        const searchData = await searchRes.json();
        
        console.log(`\nFound ${searchData.results?.length || 0} items:`);
        
        if (searchData.results) {
            searchData.results.forEach(item => {
                console.log(`\n- Title: ${item.title}`);
                console.log(`  Type: ${item.type}`);
                console.log(`  ID: ${item.id}`);
                console.log(`  URL: ${item.url}`);
            });
        }
        
    } catch (error) {
        console.error('Error:', error.message);
    }
}

main();
