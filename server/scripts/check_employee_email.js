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

async function checkEmployee() {
    console.log('🔍 Checking Employee EMP_ADMIN_01...');
    const authentication = getSession();

    try {
        const response = await queryFeatures({
            url: EMPLOYEES_URL,
            where: "EmployeeID = 'EMP_ADMIN_01'",
            outFields: '*',
            returnGeometry: false,
            authentication
        });

        if (!response.features || response.features.length === 0) {
            console.log('Employee not found.');
            return;
        }

        const attr = response.features[0].attributes;
        console.log('-----------------------------------');
        console.log(`Name: ${attr.FirstName} ${attr.LastName}`);
        console.log(`EmployeeID: ${attr.EmployeeID}`);
        console.log(`Role: ${attr.Role}`);
        console.log(`Email: ${attr.Email}`);
        console.log(`ManagerID: ${attr.ManagerID}`);
        console.log('-----------------------------------');

    } catch (error) {
        console.error('Error:', error);
    }
}

checkEmployee();
