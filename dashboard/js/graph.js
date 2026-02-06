// graph.js - Neo4j Visualization Logic

let viz;

// Pre-defined Queries
const QUERIES = {
    'inst-collab': `
        MATCH path=(i:Institution)<-[:HOSTED_BY]-(p:Project)
        WHERE i.name <> "Unknown"
        RETURN path LIMIT 100
    `,
    'pi-topic': `
        MATCH path=(p:Person)-[:LEADS]->(:Project)-[:TAGGED]->(t:Topic)
        RETURN path LIMIT 50
    `,
    'custom': '' // Will read from textarea
};

// Current mode tracker
let currentMode = 'inst-collab';

function toggleCustomCypher(show) {
    const el = document.getElementById('cypher-container');
    if (show) el.classList.remove('hidden');
    else el.classList.add('hidden');
}

function drawGraph(mode, evt) {
    if (mode === 'custom') {
        currentMode = 'custom';
        toggleCustomCypher(true);
        // Don't draw yet, wait for user to type and click 'Connect'
        const clickedElement = evt?.target || window.event?.target;
        if (clickedElement?.id !== 'connectBtn') return;
    } else if (mode !== 'current') {
        currentMode = mode;
        toggleCustomCypher(false);
    }

    // Get Config
    let uri = document.getElementById('neo_uri').value.trim();
    const user = document.getElementById('neo_user').value.trim();
    const password = document.getElementById('neo_pass').value.trim();

    if (!uri || !password) {
        alert("Please enter Neo4j Connection Details (URI and Password)");
        return;
    }

    // Check for mixed content issue (HTTP page + encrypted Neo4j)
    const isSecurePage = window.location.protocol === 'https:' || window.location.hostname === 'localhost';
    const requiresEncryption = uri.includes('+s://') || uri.includes('aura') || uri.includes('neo4j.io');

    if (!window.location.protocol.startsWith('https') && requiresEncryption && window.location.hostname !== 'localhost') {
        alert("⚠️ Neo4j Aura requires HTTPS.\n\nPlease access this page via HTTPS (e.g., on Vercel) to connect to Neo4j Aura.");
        return;
    }

    // Determine Query
    let query = QUERIES[currentMode];
    if (currentMode === 'custom') {
        query = document.getElementById('cypher').value;
        if (!query.trim()) {
            alert("Please enter a Cypher query");
            return;
        }
    }

    // Neo4j connection config
    // Strip +s/+ssc from URL - Neovis 2.x has issues with encryption in URL
    // For Neo4j Aura, TLS is always required, handled automatically
    let cleanUri = uri.replace('neo4j+s://', 'neo4j://').replace('neo4j+ssc://', 'neo4j://');

    const neo4jConfig = {
        serverUrl: cleanUri,
        serverUser: user,
        serverPassword: password,
        driverConfig: {
            encrypted: true,
            trust: "TRUST_SYSTEM_CA_SIGNED_CERTIFICATES"
        }
    };

    const config = {
        containerId: "viz",
        neo4j: neo4jConfig,
        visConfig: {
            nodes: {
                shape: "dot",
                font: { size: 12 }
            },
            edges: {
                arrows: { to: { enabled: true } }
            },
            physics: {
                enabled: true,
                stabilization: { iterations: 100 }
            }
        },
        labels: {
            "Institution": {
                caption: "name",
                size: 25,
                color: "#2563eb"
            },
            "Topic": {
                caption: "name",
                size: 15,
                color: "#22c55e"
            },
            "Person": {
                caption: "name",
                size: 20,
                color: "#f59e0b"
            },
            "Project": {
                caption: "id",
                size: 10,
                color: "#8b5cf6"
            }
        },
        relationships: {
            "HOSTED_BY": {
                thickness: 2,
                caption: false,
                color: "#94a3b8"
            },
            "TAGGED": {
                thickness: 1,
                caption: false,
                color: "#cbd5e1"
            },
            "LEADS": {
                thickness: 2,
                caption: false,
                color: "#fbbf24"
            },
            "AFFILIATED_WITH": {
                thickness: 1,
                caption: false,
                color: "#a5b4fc"
            }
        },
        initialCypher: query
    };

    // Show loading state
    const vizContainer = document.getElementById('viz');
    vizContainer.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:100%;"><p style="font-size:1.2rem;color:#666;">네트워크 로딩 중...</p></div>';

    try {
        // Support different Neovis bundle formats (v2.x often exposes NeoVis directly)
        const NeoVisConstructor = window.NeoVis?.default || window.NeoVis || NeoVis?.default || NeoVis;

        if (!NeoVisConstructor) {
            throw new Error("NeoVis library not loaded. Check script include.");
        }

        console.log("Creating NeoVis with config:", JSON.stringify({...config, neo4j: {...config.neo4j, serverPassword: '***'}}, null, 2));

        viz = new NeoVisConstructor(config);

        // Add event listeners for debugging
        viz.registerOnEvent("completed", () => {
            console.log("Graph render completed. Nodes:", viz.nodes?.length || 0);
            if (viz.nodes?.length === 0) {
                vizContainer.innerHTML += '<p style="text-align:center;color:#e53e3e;margin-top:20px;">데이터가 없습니다. Neo4j에 데이터가 마이그레이션되었는지 확인하세요.</p>';
            }
        });

        viz.registerOnEvent("error", (e) => {
            console.error("NeoVis error event:", e);
        });

        viz.render();
        console.log("Graph render initiated with mode:", currentMode);
    } catch (e) {
        console.error("Error rendering graph:", e);
        vizContainer.innerHTML = `<div style="display:flex;flex-direction:column;justify-content:center;align-items:center;height:100%;color:#e53e3e;">
            <p style="font-size:1.2rem;font-weight:bold;">연결 오류</p>
            <p style="margin-top:10px;">${e.message}</p>
            <p style="margin-top:20px;color:#666;font-size:0.9rem;">콘솔에서 자세한 정보를 확인하세요.</p>
        </div>`;
    }
}

// Helper to auto-resize (optional)
window.addEventListener('resize', () => {
    if (viz) {
        // neovis handles some resize but full reload might be needed for perfect fit
    }
});
