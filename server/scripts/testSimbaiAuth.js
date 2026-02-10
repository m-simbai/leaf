require('dotenv').config();

async function main() {
    const username = 'simbaim';
    const password = 'Adverntist11#'; // Using quotes to handle special char
    const portalUrl = 'https://africanparks.maps.arcgis.com';

    console.log(`🔐 Testing auth for ${username} at ${portalUrl}...`);

    try {
        const response = await fetch(`${portalUrl}/sharing/rest/generateToken`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                username: username,
                password: password,
                client: 'referer',
                referer: portalUrl,
                expiration: 60,
                f: 'json'
            })
        });

        const data = await response.json();

        if (data.error) {
            console.error('❌ Error:', data.error.message);
            console.log('   Code:', data.error.code);
            console.log('   Details:', data.error.details);
        } else {
            console.log('✅ Authenticated successfully!');
            console.log('   Token:', data.token.substring(0, 15) + '...');
        }
    } catch (e) {
        console.error('Network Error:', e.message);
    }
}

main();
