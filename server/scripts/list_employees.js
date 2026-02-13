const { ApplicationSession } = require('@esri/arcgis-rest-auth');
require('dotenv').config();
const { queryFeatures } = require('@esri/arcgis-rest-feature-layer');

const EMPLOYEES_URL = process.env.EMPLOYEES_TABLE_URL;

function getSession() {
    return new ApplicationSession({
        clientId: process.env.ARCGIS_CLIENT_ID,
        clientSecret: process.env.ARCGIS_CLIENT_SECRET
    });
}

const fs = require('fs');
const path = require('path');

async function listEmployees() {
    let log = '🔍 Listing all employees...\n';
    const authentication = getSession();

    try {
        const response = await queryFeatures({
            url: EMPLOYEES_URL,
            where: '1=1',
            outFields: '*',
            returnGeometry: false,
            authentication
        });

        if (!response.features || response.features.length === 0) {
            log += 'No employees found.\n';
        } else {
            log += `Found ${response.features.length} employees:\n`;
            log += '-----------------------------------\n';
            response.features.forEach(f => {
                const attr = f.attributes;
                log += `ID: ${attr.EmployeeID} | User: ${attr.Username} | Name: ${attr.FirstName} ${attr.LastName} | Role: ${attr.Role} | Email: ${attr.Email} | Manager: ${attr.ManagerID}\n`;
                log += `  - Full Attributes: ${JSON.stringify(attr)}\n`;
            });
            log += '-----------------------------------\n';
        }

        const outputPath = path.join(__dirname, '../outputs/employees_list.txt');
        fs.writeFileSync(outputPath, log);
        console.log(`List written to ${outputPath}`);

    } catch (error) {
        console.error('Error listing employees:', error);
    }
}

listEmployees();
