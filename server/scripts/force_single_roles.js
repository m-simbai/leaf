const { ApplicationSession, UserSession } = require('@esri/arcgis-rest-auth');
require('dotenv').config();
const { updateFeatures, queryFeatures } = require('@esri/arcgis-rest-feature-layer');

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

async function forceRoles() {
    console.log('🔧 Enforcing single Manager and single Admin...');
    const authentication = getSession();

    try {
        // 1. Fetch all employees to identify who needs updating
        const response = await queryFeatures({
            url: EMPLOYEES_URL,
            where: '1=1',
            outFields: 'OBJECTID,EmployeeID,Username,Role',
            returnGeometry: false,
            authentication
        });

        const updates = [];

        response.features.forEach(f => {
            const attr = f.attributes;
            
            // A. Manager Username Change (EMP001)
            if (attr.EmployeeID === 'EMP001') {
                if (attr.Username !== 'manager') {
                    console.log(`Setting EMP001 username to 'manager'`);
                    updates.push({
                        attributes: {
                            OBJECTID: attr.OBJECTID,
                            Username: 'manager'
                        }
                    });
                }
            }
            
            // B. Downgrade extra Managers (Anyone except EMP001 who is a manager)
            else if (attr.Role === 'manager') {
                console.log(`Downgrading ${attr.Username} (${attr.EmployeeID}) to staff`);
                updates.push({
                    attributes: {
                        OBJECTID: attr.OBJECTID,
                        Role: 'staff'
                    }
                });
            }
            
            // C. Ensure only one Admin (Anyone except EMP_ADMIN_01 who is an admin)
            else if (attr.Role === 'admin' && attr.EmployeeID !== 'EMP_ADMIN_01') {
                 console.log(`Downgrading extra admin ${attr.Username} (${attr.EmployeeID}) to staff`);
                 updates.push({
                    attributes: {
                        OBJECTID: attr.OBJECTID,
                        Role: 'staff'
                    }
                });
            }
        });

        if (updates.length > 0) {
            const res = await updateFeatures({
                url: EMPLOYEES_URL,
                features: updates,
                authentication
            });
            console.log('✅ Updates complete:', JSON.stringify(res.updateResults));
        } else {
            console.log('✨ No updates needed.');
        }

    } catch (error) {
        console.error('Error enforcing roles:', error);
    }
}

forceRoles();
