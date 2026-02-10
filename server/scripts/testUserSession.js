require('dotenv').config();
const { UserSession } = require('@esri/arcgis-rest-auth');

async function main() {
    try {
        console.log('Testing UserSession...');
        const session = new UserSession({
            username: process.env.ARCGIS_USERNAME,
            password: process.env.ARCGIS_PASSWORD
        });
        
        console.log('Getting token...');
        const token = await session.getToken('https://www.arcgis.com');
        console.log('✅ Token obtained:', token.substring(0, 10) + '...');
        
    } catch (e) {
        console.error('❌ Error:', e.message);
        console.log('Full error:', e);
    }
}

main();
