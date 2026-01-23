// Netlify Serverless Function - Fetch data from private repo
const https = require('https');

exports.handler = async (event, context) => {
    // CORS headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Content-Type': 'application/json'
    };

    // Handle preflight
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    // Check password
    const authHeader = event.headers.authorization || event.headers.Authorization;
    const password = process.env.APP_PASSWORD;

    console.log('Auth header:', authHeader);
    console.log('Expected:', `Bearer ${password}`);

    if (!authHeader || authHeader !== `Bearer ${password}`) {
        return {
            statusCode: 401,
            headers,
            body: JSON.stringify({ error: 'Unauthorized' })
        };
    }

    try {
        // Fetch from private GitHub repo using https module
        const githubToken = process.env.GITHUB_TOKEN;

        const data = await new Promise((resolve, reject) => {
            const options = {
                hostname: 'raw.githubusercontent.com',
                path: '/baesamaith-cmd/privateRNDSG/main/dashboard/data/projects.json',
                method: 'GET',
                headers: {
                    'Authorization': `token ${githubToken}`,
                    'Accept': 'application/vnd.github.v3.raw',
                    'User-Agent': 'Netlify-Function'
                }
            };

            const req = https.request(options, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        resolve(JSON.parse(body));
                    } else {
                        reject(new Error(`GitHub API error: ${res.statusCode}`));
                    }
                });
            });

            req.on('error', reject);
            req.end();
        });

        return {
            statusCode: 200,
            headers: {
                ...headers,
                'Cache-Control': 'max-age=300'
            },
            body: JSON.stringify(data)
        };
    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Failed to fetch data', details: error.message })
        };
    }
};
