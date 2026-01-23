// Netlify Serverless Function - Fetch data from private repo (with gzip)
const https = require('https');
const zlib = require('zlib');

exports.handler = async (event, context) => {
    // CORS headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept-Encoding',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Content-Type': 'application/json',
        'Content-Encoding': 'gzip'
    };

    // Handle preflight
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    // Check password
    const authHeader = event.headers.authorization || event.headers.Authorization;
    const password = process.env.APP_PASSWORD;

    if (!authHeader || authHeader !== `Bearer ${password}`) {
        return {
            statusCode: 401,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ error: 'Unauthorized' })
        };
    }

    try {
        // Fetch from private GitHub repo
        const githubToken = process.env.GITHUB_TOKEN;

        const jsonData = await new Promise((resolve, reject) => {
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
                        resolve(body);
                    } else {
                        reject(new Error(`GitHub API error: ${res.statusCode}`));
                    }
                });
            });

            req.on('error', reject);
            req.end();
        });

        // Compress with gzip
        const compressed = zlib.gzipSync(jsonData);

        return {
            statusCode: 200,
            headers,
            body: compressed.toString('base64'),
            isBase64Encoded: true
        };
    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ error: 'Failed to fetch data', details: error.message })
        };
    }
};
