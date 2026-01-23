// Netlify Serverless Function - Fetch data from private repo
exports.handler = async (event, context) => {
    // CORS headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    // Check password
    const authHeader = event.headers.authorization;
    const password = process.env.APP_PASSWORD;

    if (!authHeader || authHeader !== `Bearer ${password}`) {
        return {
            statusCode: 401,
            headers,
            body: JSON.stringify({ error: 'Unauthorized' })
        };
    }

    try {
        // Fetch from private GitHub repo
        const githubToken = process.env.GITHUB_TOKEN;
        const response = await fetch(
            'https://raw.githubusercontent.com/baesamaith-cmd/privateRNDSG/main/dashboard/data/projects.json',
            {
                headers: {
                    'Authorization': `token ${githubToken}`,
                    'Accept': 'application/vnd.github.v3.raw'
                }
            }
        );

        if (!response.ok) {
            throw new Error(`GitHub API error: ${response.status}`);
        }

        const data = await response.json();

        return {
            statusCode: 200,
            headers: {
                ...headers,
                'Content-Type': 'application/json',
                'Cache-Control': 'max-age=300'
            },
            body: JSON.stringify(data)
        };
    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Failed to fetch data' })
        };
    }
};
