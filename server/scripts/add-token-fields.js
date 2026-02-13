/**
 * Add Token Fields to Employees Layer
 * 
 * This script adds missing token fields to the Employees layer:
 * - ResetToken (String)
 * - ResetTokenExpiry (Date/Double) - We'll use Double (msg) to match typically timestamp usage or String
 * 
 * Actually, looking at index.js, we pass these as:
 * ResetToken: string (hex)
 * ResetTokenExpiry: number (timestamp) => esriFieldTypeDouble or esriFieldTypeDate
 * 
 * Let's use:
 * - ResetToken: esriFieldTypeString (256)
 * - ResetTokenExpiry: esriFieldTypeDouble (for raw timestamp) OR esriFieldTypeDate
 * 
 * In index.js: `Date.now() + ...` returns a number. 
 * valid-setup-token compares it: `if (user.SetupTokenExpiry < Date.now())`
 * 
 * So it should be a number (Double) or a Date. 
 * Let's use esriFieldTypeDouble for simplicity as it stores the raw timestamp number, 
 * avoiding timezone issues with Date fields if not handled carefully.
 */

require('dotenv').config();
const fetch = require('node-fetch');

const ARCGIS_ORG_URL = process.env.ARCGIS_ORG_URL || 'https://www.arcgis.com';
const CLIENT_ID = process.env.ARCGIS_CLIENT_ID;
const CLIENT_SECRET = process.env.ARCGIS_CLIENT_SECRET;
// We need the FEATURE_SERVICE_URL from .env
const FEATURE_SERVICE_URL = process.env.FEATURE_SERVICE_URL;  

const ARCGIS_USERNAME = process.env.ARCGIS_USERNAME;
const ARCGIS_PASSWORD = process.env.ARCGIS_PASSWORD;

async function getToken() {
  console.log('🔐 Getting Token via generateToken (User Credentials)...');
  
  const params = new URLSearchParams({
    username: ARCGIS_USERNAME,
    password: ARCGIS_PASSWORD,
    referer: 'https://www.arcgis.com',
    f: 'json',
    expiration: 60
  });

  const response = await fetch(`${ARCGIS_ORG_URL}/sharing/rest/generateToken`, {
    method: 'POST', body: params
  });
  
  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  return data.token;
}

async function addFields() {
  if (!FEATURE_SERVICE_URL) {
    console.error('❌ FEATURE_SERVICE_URL not found in .env');
    return;
  }

  try {
    const token = await getToken();
    console.log('✅ Token obtained');

    // Defines the fields to add
    const fieldsToAdd = [
      {
        name: 'ResetToken',
        type: 'esriFieldTypeString',
        alias: 'Reset Token',
        sqlType: 'sqlTypeNVarchar',
        length: 256,
        nullable: true,
        editable: true
      },
      {
        name: 'ResetTokenExpiry',
        type: 'esriFieldTypeDouble', 
        alias: 'Reset Token Expiry',
        sqlType: 'sqlTypeFloat',
        nullable: true,
        editable: true
      },
      {
        name: 'SetupToken',
        type: 'esriFieldTypeString',
        alias: 'Setup Token',
        sqlType: 'sqlTypeNVarchar',
        length: 256,
        nullable: true,
        editable: true
      },
      {
        name: 'SetupTokenExpiry',
        type: 'esriFieldTypeDouble',
        alias: 'Setup Token Expiry',
        sqlType: 'sqlTypeFloat',
        nullable: true,
        editable: true
      },
       {
        name: 'PasswordSet',
        type: 'esriFieldTypeInteger',
        alias: 'Password Set',
        sqlType: 'sqlTypeInteger',
        nullable: true,
        editable: true
      }
    ];

    // The Employees layer is typically at index 0, verify logic if needed. 
    // Usually standard setup puts Employees at /0
    const layerUrl = `${FEATURE_SERVICE_URL}/0`; 
    const adminLayerUrl = layerUrl.replace('/rest/services/', '/rest/admin/services/');
    const addToDefinitionUrl = `${adminLayerUrl}/addToDefinition`;

    console.log(`\nAdding ${fieldsToAdd.length} fields to: ${layerUrl}...`);

    const definition = {
      fields: fieldsToAdd
    };

    const params = new URLSearchParams({
      addToDefinition: JSON.stringify(definition),
      f: 'json',
      token: token
    });

    const response = await fetch(addToDefinitionUrl, {
      method: 'POST',
      body: params
    });

    const data = await response.json();

    if (data.error) {
      console.error('❌ Error adding fields:', JSON.stringify(data.error, null, 2));
    } else {
      console.log('✅ Fields added successfully:', JSON.stringify(data, null, 2));
    }

  } catch (err) {
    console.error('❌ Script failed:', err);
  }
}

addFields();
