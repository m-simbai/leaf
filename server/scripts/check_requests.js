const { ApplicationSession, UserSession } = require('@esri/arcgis-rest-auth');
require('dotenv').config();
const { queryFeatures } = require('@esri/arcgis-rest-feature-layer');

const LEAVE_REQUESTS_URL = process.env.LEAVE_REQUESTS_TABLE_URL;
const EMPLOYEES_URL = process.env.EMPLOYEES_TABLE_URL;

function getSession() {
    if (process.env.ARCGIS_USERNAME && process.env.ARCGIS_PASSWORD) {
        return new UserSession({
            username: process.env.ARCGIS_USERNAME,
            password: process.env.ARCGIS_PASSWORD
        });
    } else {
        return new ApplicationSession({
            clientId: process.env.ARCGIS_CLIENT_ID,
            clientSecret: process.env.ARCGIS_CLIENT_SECRET
        });
    }
}

const fs = require('fs');

async function checkRequests() {
    let log = '🔍 Checking recent leave requests...\n';
    const authentication = getSession();

    try {
        const response = await queryFeatures({
            url: LEAVE_REQUESTS_URL,
            where: '1=1',
            outFields: '*',
            returnGeometry: false,
            orderByFields: 'SubmittedDate DESC',
            resultRecordCount: 10,
            authentication
        });

        if (!response.features || response.features.length === 0) {
            log += 'No leave requests found.\n';
            fs.writeFileSync('requests_log.txt', log);
            return;
        }

        log += `Found ${response.features.length} recent requests:\n\n`;

        for (const feature of response.features) {
            const attr = feature.attributes;
            const empId = attr.EmployeeID;
            
            // Check if employee exists and has email
            let empEmail = 'CHECKING...';
            
            if (empId) {
                const empQuery = await queryFeatures({
                    url: EMPLOYEES_URL,
                    where: `EmployeeID = '${empId}'`,
                    outFields: 'Email,FirstName,LastName',
                    returnGeometry: false,
                    authentication
                });
                if (empQuery.features.length > 0) {
                    empEmail = empQuery.features[0].attributes.Email || 'MISSING_EMAIL';
                } else {
                    empEmail = 'EMPLOYEE_NOT_FOUND';
                }
            } else {
                empEmail = 'NO_EMPLOYEE_ID';
            }

            log += `Request ID: ${attr.RequestID || attr.OBJECTID}\n`;
            log += `  Data Object ID: ${attr.OBJECTID}\n`;
            log += `  Status: ${attr.Status}\n`;
            log += `  Employee: ${attr.EmployeeName} (ID: '${empId}')\n`;
            log += `  Type: ${attr.LeaveType}\n`;
            log += `  Email Check: ${empEmail}\n`;
            log += '-----------------------------------\n';
        }

        fs.writeFileSync('requests_log.txt', log);
        console.log('Log written to requests_log.txt');

    } catch (error) {
        console.error('Error checking requests:', error);
    }
}

checkRequests().catch(console.error);
