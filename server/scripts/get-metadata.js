require('dotenv').config();
const { ApplicationSession } = require('@esri/arcgis-rest-auth');
const fetch = require('node-fetch');

async function getMetadata() {
    const session = new ApplicationSession({
        clientId: process.env.ARCGIS_CLIENT_ID,
        clientSecret: process.env.ARCGIS_CLIENT_SECRET
    });

    try {
        const token = await session.getToken('https://www.arcgis.com/sharing/rest/generateToken');
        const url = `https://services5.arcgis.com/7XFZFIRClYfgIvW4/arcgis/rest/services/LeaveTracker_V2/FeatureServer/0?f=json&token=${token}`;
        
        const res = await fetch(url);
        const data = await res.json();
        
        if (data.error) {
            console.log('Error:', data.error.message);
            return;
        }

        console.log('--- Fields [Name (Type) - Alias] ---');
        data.fields.forEach(f => {
            console.log(`${f.name} (${f.type}) - ${f.alias}`);
        });
    } catch (e) {
        console.error(e);
    }
}

getMetadata();
