const { ApplicationSession, UserSession } = require('@esri/arcgis-rest-auth');
require('dotenv').config();
const { queryFeatures } = require('@esri/arcgis-rest-feature-layer');
const fs = require('fs');
const path = require('path');

const LEAVE_REQUESTS_URL = process.env.LEAVE_REQUESTS_TABLE_URL;
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

async function checkRecentRejections() {
    console.log('🔍 Checking recent rejected leave requests...');
    const authentication = getSession();

    try {
        const response = await queryFeatures({
            url: LEAVE_REQUESTS_URL,
            where: "Status = 'rejected'",
            outFields: '*',
            orderByFields: 'OBJECTID DESC',
            resultRecordCount: 5,
            authentication
        });

        if (!response.features || response.features.length === 0) {
            console.log('No rejected requests found.');
            return;
        }

        let output = '--- RECENT REJECTED REQUESTS ---\n';
        for (const feature of response.features) {
            const attr = feature.attributes;
            output += `OBJECTID: ${attr.OBJECTID} | EmployeeID: ${attr.EmployeeID} | Name: ${attr.EmployeeName} | Status: ${attr.Status}\n`;
            
            // Resolve email
            const empRes = await queryFeatures({
                url: EMPLOYEES_URL,
                where: `EmployeeID = '${attr.EmployeeID}'`,
                outFields: 'Email,FirstName,LastName',
                authentication
            });
            
            const email = empRes.features?.[0]?.attributes?.Email;
            output += `  - Resolved Email: ${email || 'NOT FOUND'}\n`;
        }

        const outputPath = path.join(__dirname, '..', 'outputs', 'rejection_debug.txt');
        fs.writeFileSync(outputPath, output);
        console.log(`Debug info written to ${outputPath}`);
        console.log(output);

    } catch (error) {
        console.error('Error checking rejections:', error);
    }
}

checkRecentRejections();
