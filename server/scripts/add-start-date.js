/**
 * Admin Feature: Add StartDate field to Employees table
 */

require('dotenv').config();
const fetch = require('node-fetch');

const EMPLOYEES_URL = process.env.EMPLOYEES_TABLE_URL;
const ARCGIS_USERNAME = process.env.ARCGIS_USERNAME;
const ARCGIS_PASSWORD = process.env.ARCGIS_PASSWORD;
const ARCGIS_ORG_URL = process.env.ARCGIS_ORG_URL;

async function getToken() {
    const response = await fetch(`${ARCGIS_ORG_URL}/sharing/rest/generateToken`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            username: ARCGIS_USERNAME,
            password: ARCGIS_PASSWORD,
            referer: ARCGIS_ORG_URL,
            f: 'json'
        })
    });
    const data = await response.json();
    if (data.error) {
        throw new Error(`Token generation failed: ${JSON.stringify(data.error)}`);
    }
    return data.token;
}

async function addFields() {
    console.log('🔧 Adding StartDate field to Employees table...\n');
    
    const token = await getToken();
    
    // Define new field
    const newField = {
        name: 'StartDate',
        type: 'esriFieldTypeDate',
        alias: 'Start Date',
        sqlType: 'sqlTypeOther',
        nullable: true,
        editable: true,
        length: 8
    };
    
    // Try using the LAYER endpoint directly (layer 0)
    const layerUrl = EMPLOYEES_URL; // e.g. .../FeatureServer/0
    const addFieldsUrl = `${layerUrl}/addToDefinition`;
    
    console.log('Using Layer URL:', addFieldsUrl);
    
    // For layer endpoint, we don't wrap in "layers" array, just pass the definition object directly
    const definition = {
        fields: [newField]
    };

    const body = new URLSearchParams({
        f: 'json',
        token: token,
        addToDefinition: JSON.stringify(definition)
    });
    
    const response = await fetch(addFieldsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body
    });
    
    const result = await response.json();
    
    console.log('\nAPI Response:', JSON.stringify(result, null, 2));
    
    if (result.success || (result.layers && result.layers[0] && result.layers[0].success)) {
        console.log('\n✅ Successfully added StartDate field!');
    } else {
        console.error('\n❌ Failed to add fields');
        if (result.error) {
            console.error('Error details:', JSON.stringify(result.error, null, 2));
        }
    }
}

addFields().catch(console.error);
