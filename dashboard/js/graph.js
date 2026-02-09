// graph.js - Neo4j driver + vis-network (direct, no NeoVis)

let network = null;
let nodeDataMap = new Map(); // stores raw Neo4j node data for click popups

const QUERIES = {
    'inst-collab': `
        MATCH (p:Project)-[r:HOSTED_BY]->(i:Institution)
        WHERE i.name <> "Unknown"
        RETURN p, r, i
        LIMIT 100
    `,
    'pi-topic': `
        MATCH (p:Person)-[r1:LEADS]->(proj:Project)-[r2:TAGGED]->(t:Topic)
        RETURN p, r1, proj, r2, t
        LIMIT 50
    `,
    'topic-connect': `
        MATCH (p1:Person)-[r1:LEADS]->(proj1:Project)-[r2:TAGGED]->(t:Topic)<-[r3:TAGGED]-(proj2:Project)<-[r4:LEADS]-(p2:Person)
        WHERE id(p1) < id(p2)
        RETURN p1, r1, proj1, r2, t, r3, proj2, r4, p2
        LIMIT 80
    `,
    'custom': ''
};

let currentMode = 'inst-collab';

// Node style by label
const NODE_STYLES = {
    Institution: {
        size: 30,
        color: { background: '#93c5fd', border: '#2563eb', highlight: { background: '#3b82f6', border: '#1d4ed8' } },
        font: { size: 13, color: '#1e293b', strokeWidth: 3, strokeColor: '#ffffff' },
        shape: 'dot',
        borderWidth: 2
    },
    Project: {
        size: 12,
        color: { background: '#c4b5fd', border: '#8b5cf6', highlight: { background: '#a78bfa', border: '#7c3aed' } },
        font: { size: 9, color: '#64748b', strokeWidth: 2, strokeColor: '#ffffff' },
        shape: 'dot',
        borderWidth: 1
    },
    Person: {
        size: 22,
        color: { background: '#fcd34d', border: '#f59e0b', highlight: { background: '#fbbf24', border: '#d97706' } },
        font: { size: 12, color: '#1e293b', strokeWidth: 3, strokeColor: '#ffffff' },
        shape: 'dot',
        borderWidth: 2
    },
    Topic: {
        size: 18,
        color: { background: '#86efac', border: '#22c55e', highlight: { background: '#4ade80', border: '#16a34a' } },
        font: { size: 11, color: '#1e293b', strokeWidth: 3, strokeColor: '#ffffff' },
        shape: 'dot',
        borderWidth: 2
    }
};

const EDGE_STYLES = {
    HOSTED_BY: { color: { color: '#64748b', highlight: '#3b82f6' }, width: 2 },
    TAGGED: { color: { color: '#cbd5e1', highlight: '#22c55e' }, width: 1 },
    LEADS: { color: { color: '#f59e0b', highlight: '#d97706' }, width: 2 },
    AFFILIATED_WITH: { color: { color: '#a78bfa', highlight: '#7c3aed' }, width: 1 }
};

function toggleCustomCypher(show) {
    const el = document.getElementById('cypher-container');
    if (show) el.classList.remove('hidden');
    else el.classList.add('hidden');
}

function getNodeLabel(node) {
    const labels = node.labels || [];
    const props = {};
    for (const [k, v] of Object.entries(node.properties)) {
        props[k] = (v && typeof v === 'object' && 'low' in v) ? v.low : v;
    }

    if (labels.includes('Institution')) return props.name || 'Institution';
    if (labels.includes('Person')) return props.name || 'Person';
    if (labels.includes('Topic')) return props.name || 'Topic';
    if (labels.includes('Project')) return props.id || props.title || 'Project';
    return props.name || props.id || labels[0] || '';
}

function getNodeStyle(node) {
    const labels = node.labels || [];
    for (const label of labels) {
        if (NODE_STYLES[label]) return NODE_STYLES[label];
    }
    return NODE_STYLES.Project;
}

async function drawGraph(mode, evt) {
    if (mode === 'custom') {
        currentMode = 'custom';
        toggleCustomCypher(true);
        const clickedElement = evt?.target || window.event?.target;
        if (clickedElement?.id !== 'connectBtn') return;
    } else if (mode !== 'current') {
        currentMode = mode;
        toggleCustomCypher(false);
    }

    const uri = document.getElementById('neo_uri').value.trim();
    const user = document.getElementById('neo_user').value.trim();
    const password = document.getElementById('neo_pass').value.trim();
    const vizContainer = document.getElementById('viz');

    if (!uri || !password) {
        alert("Neo4j URI와 Password를 입력하세요.");
        return;
    }

    let query = QUERIES[currentMode];
    if (currentMode === 'custom') {
        query = document.getElementById('cypher').value;
        if (!query.trim()) {
            alert("Cypher 쿼리를 입력하세요.");
            return;
        }
    }

    // Show loading
    vizContainer.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:100%;color:#666;"><p>Neo4j 연결 중...</p></div>';

    let driver;
    try {
        driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
        const session = driver.session({ defaultAccessMode: neo4j.session.READ });

        const result = await session.run(query);
        await session.close();

        // Parse nodes and edges from Neo4j records
        const nodesMap = new Map();
        nodeDataMap = new Map();
        const edgesArr = [];
        let edgeId = 0;

        result.records.forEach(record => {
            record.keys.forEach(key => {
                const field = record.get(key);
                if (!field) return;

                if (field.identity !== undefined && field.labels) {
                    // It's a Node
                    const id = field.identity.low !== undefined ? field.identity.low : field.identity;
                    if (!nodesMap.has(id)) {
                        const style = getNodeStyle(field);
                        nodesMap.set(id, {
                            id: id,
                            label: getNodeLabel(field),
                            ...style
                        });
                        // Store raw data for click popup
                        const props = {};
                        for (const [k, v] of Object.entries(field.properties)) {
                            props[k] = (v && typeof v === 'object' && 'low' in v) ? v.low : v;
                        }
                        nodeDataMap.set(id, {
                            labels: field.labels,
                            properties: props
                        });
                    }
                } else if (field.start !== undefined && field.end !== undefined && field.type) {
                    // It's a Relationship
                    const from = field.start.low !== undefined ? field.start.low : field.start;
                    const to = field.end.low !== undefined ? field.end.low : field.end;
                    const relStyle = EDGE_STYLES[field.type] || { color: { color: '#94a3b8' }, width: 1 };
                    edgesArr.push({
                        id: 'e' + (edgeId++),
                        from: from,
                        to: to,
                        ...relStyle,
                        _relType: field.type,
                        arrows: { to: { enabled: true, scaleFactor: 0.5 } },
                        smooth: { type: 'continuous' }
                    });
                }
            });
        });

        // Split semicolon-separated Topic nodes into individual keyword nodes
        let syntheticId = -1;
        const edgesToAdd = [];
        const nodesToDelete = [];

        for (const [id, node] of nodesMap) {
            const raw = nodeDataMap.get(id);
            if (!raw || !raw.labels.includes('Topic')) continue;
            const name = raw.properties.name || '';
            if (!name.includes(';')) continue;

            // This Topic has semicolon-separated keywords — split it
            const keywords = name.split(';').map(k => k.trim()).filter(k => k.length > 0);
            if (keywords.length <= 1) continue;

            // Find all edges pointing to/from this compound node
            const relatedEdges = edgesArr.filter(e => e.from === id || e.to === id);

            // Remove original compound node
            nodesToDelete.push(id);

            // Create individual keyword nodes and re-link edges
            keywords.forEach(keyword => {
                // Check if a node with this keyword already exists
                let existingId = null;
                for (const [nid, nd] of nodesMap) {
                    const nRaw = nodeDataMap.get(nid);
                    if (nRaw && nRaw.labels.includes('Topic') && nRaw.properties.name === keyword) {
                        existingId = nid;
                        break;
                    }
                }

                const targetId = existingId !== null ? existingId : syntheticId--;

                if (existingId === null) {
                    // Create new node
                    nodesMap.set(targetId, {
                        id: targetId,
                        label: keyword,
                        ...NODE_STYLES.Topic
                    });
                    nodeDataMap.set(targetId, {
                        labels: ['Topic'],
                        properties: { name: keyword }
                    });
                }

                // Re-link edges to the new individual node
                relatedEdges.forEach(edge => {
                    edgesToAdd.push({
                        id: 'e' + (edgeId++),
                        from: edge.from === id ? targetId : edge.from,
                        to: edge.to === id ? targetId : edge.to,
                        ...EDGE_STYLES[edge._relType || 'TAGGED'] || { color: { color: '#cbd5e1' }, width: 1 },
                        arrows: edge.arrows,
                        smooth: edge.smooth
                    });
                });
            });
        }

        // Apply deletions and additions
        nodesToDelete.forEach(id => {
            nodesMap.delete(id);
            nodeDataMap.delete(id);
        });
        // Remove edges that pointed to deleted compound nodes
        const deletedSet = new Set(nodesToDelete);
        for (let i = edgesArr.length - 1; i >= 0; i--) {
            if (deletedSet.has(edgesArr[i].from) || deletedSet.has(edgesArr[i].to)) {
                edgesArr.splice(i, 1);
            }
        }
        edgesToAdd.forEach(e => edgesArr.push(e));

        console.log('After topic split — nodes:', nodesMap.size, 'edges:', edgesArr.length);

        if (nodesMap.size === 0) {
            vizContainer.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:100%;color:#e53e3e;"><p>데이터가 없습니다. Neo4j 데이터베이스를 확인하세요.</p></div>';
            return;
        }

        // Build vis-network
        vizContainer.innerHTML = '';
        const nodes = new vis.DataSet(Array.from(nodesMap.values()));
        const edges = new vis.DataSet(edgesArr);

        const options = {
            physics: {
                enabled: true,
                barnesHut: {
                    gravitationalConstant: -3000,
                    centralGravity: 0.3,
                    springLength: 120,
                    springConstant: 0.04,
                    damping: 0.09,
                    avoidOverlap: 0.1
                },
                stabilization: { iterations: 200, fit: true }
            },
            interaction: {
                hover: true,
                tooltipDelay: 200,
                zoomView: true,
                dragView: true
            }
        };

        network = new vis.Network(vizContainer, { nodes, edges }, options);

        network.once('stabilizationIterationsDone', function () {
            console.log('Stabilization done, fitting...');
            network.fit({ animation: { duration: 800, easingFunction: 'easeInOutQuad' } });
        });

        // Click event — show node details popup
        network.on('click', function (params) {
            const popup = document.getElementById('nodePopup');
            if (params.nodes.length > 0) {
                const nodeId = params.nodes[0];
                const raw = nodeDataMap.get(nodeId);
                if (raw) showNodePopup(raw, nodes.get(nodeId));
            } else {
                popup.style.display = 'none';
            }
        });

        // Show legend
        document.getElementById('legend').style.display = 'flex';

    } catch (e) {
        console.error('Graph error:', e);
        vizContainer.innerHTML = `<div style="display:flex;flex-direction:column;justify-content:center;align-items:center;height:100%;color:#e53e3e;padding:20px;text-align:center;">
            <p style="font-size:1.1rem;font-weight:bold;">연결 오류</p>
            <p style="margin-top:10px;font-size:0.9rem;">${e.message}</p>
        </div>`;
    } finally {
        if (driver) await driver.close();
    }
}

function fitGraph() {
    if (network) network.fit({ animation: { duration: 500, easingFunction: 'easeInOutQuad' } });
}

function zoomIn() {
    if (network) {
        const scale = network.getScale() * 1.3;
        network.moveTo({ scale });
    }
}

function zoomOut() {
    if (network) {
        const scale = network.getScale() / 1.3;
        network.moveTo({ scale });
    }
}

// Node detail popup
const LABEL_DISPLAY = {
    Institution: '기관',
    Project: '과제',
    Person: '연구자',
    Topic: '주제'
};

const PROP_DISPLAY = {
    name: '이름',
    id: '과제번호',
    title: '과제명',
    status: '상태',
    start_date: '시작일',
    end_date: '종료일',
    duration_months: '수행기간(월)',
    abstract: '초록',
    agency: '지원기관',
    grant_amount: '지원금액'
};

function showNodePopup(raw, visNode) {
    const popup = document.getElementById('nodePopup');
    const typeLabel = raw.labels.map(l => LABEL_DISPLAY[l] || l).join(', ');
    const style = NODE_STYLES[raw.labels[0]] || NODE_STYLES.Project;
    const bgColor = style.color.background;
    const borderColor = style.color.border;

    let propsHtml = '';
    for (const [key, val] of Object.entries(raw.properties)) {
        if (val === null || val === undefined || val === '') continue;
        const displayKey = PROP_DISPLAY[key] || key;
        let displayVal = val;
        if (key === 'abstract' && typeof val === 'string' && val.length > 200) {
            displayVal = val.substring(0, 200) + '...';
        }
        propsHtml += `<tr><td style="font-weight:600;color:#64748b;padding:6px 12px 6px 0;vertical-align:top;white-space:nowrap;font-size:0.85rem;">${displayKey}</td><td style="padding:6px 0;font-size:0.85rem;word-break:break-word;">${displayVal}</td></tr>`;
    }

    // Count connected edges
    const connectedEdges = network.getConnectedEdges(visNode.id);
    const connectedNodes = network.getConnectedNodes(visNode.id);
    propsHtml += `<tr><td style="font-weight:600;color:#64748b;padding:6px 12px 6px 0;font-size:0.85rem;">연결 수</td><td style="padding:6px 0;font-size:0.85rem;">${connectedNodes.length}개 노드</td></tr>`;

    popup.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
            <div style="display:flex;align-items:center;gap:10px;">
                <div style="width:16px;height:16px;border-radius:50%;background:${bgColor};border:2px solid ${borderColor};"></div>
                <span style="font-size:0.8rem;font-weight:600;color:${borderColor};text-transform:uppercase;">${typeLabel}</span>
            </div>
            <button onclick="closeNodePopup()" style="background:none;border:none;font-size:1.4rem;cursor:pointer;color:#94a3b8;line-height:1;">&times;</button>
        </div>
        <h3 style="font-size:1.1rem;font-weight:700;color:#1e293b;margin-bottom:14px;line-height:1.4;">${visNode.label}</h3>
        <table style="width:100%;border-collapse:collapse;">${propsHtml}</table>
    `;
    popup.style.display = 'block';
}

function closeNodePopup() {
    document.getElementById('nodePopup').style.display = 'none';
}
