/**
 * Migration Script: Add Leave Modification Fields to LeaveRequests Table
 * 
 * This script adds fields needed for:
 * - Early check-ins
 * - Leave extensions
 * - Manager-initiated extensions
 */

require('dotenv').config();
const fetch = require('node-fetch');

const LEAVE_REQUESTS_URL = process.env.LEAVE_REQUESTS_TABLE_URL;
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
    console.log('🔧 Adding modification fields to LeaveRequests table...\n');
    
    const token = await getToken();
    
    // Define new fields
    const newFields = [
        {
            name: 'OriginalEndDate',
            type: 'esriFieldTypeDate',
            alias: 'Original End Date',
            sqlType: 'sqlTypeOther',
            nullable: true,
            editable: true,
            length: 8
        },
        {
            name: 'ActualEndDate',
            type: 'esriFieldTypeDate',
            alias: 'Actual End Date',
            sqlType: 'sqlTypeOther',
            nullable: true,
            editable: true,
            length: 8
        },
        {
            name: 'DaysTaken',
            type: 'esriFieldTypeInteger',
            alias: 'Days Taken',
            sqlType: 'sqlTypeOther',
            nullable: true,
            editable: true
        },
        {
            name: 'ModificationType',
            type: 'esriFieldTypeString',
            alias: 'Modification Type',
            sqlType: 'sqlTypeOther',
            length: 50,
            nullable: true,
            editable: true,
            defaultValue: 'none'
        },
        {
            name: 'ModificationReason',
            type: 'esriFieldTypeString',
            alias: 'Modification Reason',
            sqlType: 'sqlTypeOther',
            length: 1000,
            nullable: true,
            editable: true
        },
        {
            name: 'ModificationStatus',
            type: 'esriFieldTypeString',
            alias: 'Modification Status',
            sqlType: 'sqlTypeOther',
            length: 20,
            nullable: true,
            editable: true
        },
        {
            name: 'ModificationRequestedDate',
            type: 'esriFieldTypeDate',
            alias: 'Modification Requested Date',
            sqlType: 'sqlTypeOther',
            nullable: true,
            editable: true,
            length: 8
        },
        {
            name: 'ModificationReviewedBy',
            type: 'esriFieldTypeString',
            alias: 'Modification Reviewed By',
            sqlType: 'sqlTypeOther',
            length: 50,
            nullable: true,
            editable: true
        },
        {
            name: 'ModificationReviewedDate',
            type: 'esriFieldTypeDate',
            alias: 'Modification Reviewed Date',
            sqlType: 'sqlTypeOther',
            nullable: true,
            editable: true,
            length: 8
        }
    ];
    
    // Use the SERVICE-level addToDefinition endpoint (not the layer /1)
    const serviceUrl = LEAVE_REQUESTS_URL.replace('/1', '');
    const addFieldsUrl = `${serviceUrl}/addToDefinition`;
    
    console.log('Using Service URL:', addFieldsUrl);
    
    const body = new URLSearchParams({
        f: 'json',
        token: token,
        addToDefinition: JSON.stringify({
            layers: [{
                id: 1,
                fields: newFields
            }]
        })
    });
    
    const response = await fetch(addFieldsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body
    });
    
    const result = await response.json();
    
    console.log('\nAPI Response:', JSON.stringify(result, null, 2));
    
    if (result.success || (result.layers && result.layers[0] && result.layers[0].success)) {
        console.log('\n✅ Successfully added modification fields!');
        console.log('\nAdded fields:');
        newFields.forEach(field => {
            console.log(`  - ${field.name} (${field.type})`);
        });
    } else {
        console.error('\n❌ Failed to add fields');
        if (result.error) {
            console.error('Error details:', JSON.stringify(result.error, null, 2));
        }
    }
    
    console.log('\n✅ Migration complete!');
}

addFields().catch(console.error);
