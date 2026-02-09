// dashboard-graph.js - Network graph for filtered dashboard projects (no Neo4j)

let dashNetwork = null;
let dashGraphVisible = false;
let dashNodeDataMap = new Map();
let dashVisibleTypes = new Set(['Institution', 'Project', 'Person', 'Topic']);
let dashAllNodes = []; // full node list before filtering
let dashAllEdges = []; // full edge list before filtering
let dashVisNodes = null; // vis.DataSet references for live updates
let dashVisEdges = null;
let dashFocusedNode = null; // currently focused node id (null = no focus)
const DASH_MAX_PROJECTS = 200;

// Node styles (same as graph.js)
const DASH_NODE_STYLES = {
    Institution: {
        size: 30,
        color: { background: '#93c5fd', border: '#2563eb', highlight: { background: '#3b82f6', border: '#1d4ed8' } },
        font: { size: 13, color: '#1e293b', strokeWidth: 3, strokeColor: '#ffffff' },
        shape: 'dot',
        borderWidth: 2
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
    },
    Project: {
        size: 12,
        color: { background: '#c4b5fd', border: '#8b5cf6', highlight: { background: '#a78bfa', border: '#7c3aed' } },
        font: { size: 9, color: '#64748b', strokeWidth: 2, strokeColor: '#ffffff' },
        shape: 'dot',
        borderWidth: 1
    }
};

const DASH_EDGE_STYLES = {
    HOSTED_BY: { color: { color: '#64748b', highlight: '#3b82f6' }, width: 2 },
    LEADS: { color: { color: '#f59e0b', highlight: '#d97706' }, width: 2 },
    TAGGED: { color: { color: '#cbd5e1', highlight: '#22c55e' }, width: 1 }
};

function buildGraphData(projects) {
    const nodesMap = new Map();
    const edges = [];
    let edgeId = 0;

    // Pre-compute topic frequency
    const topicFreq = {};
    projects.forEach(p => {
        const kw = p.kw || '';
        if (kw) {
            kw.replace(/;/g, ',').split(',').map(k => k.trim()).filter(k => k.length > 2).forEach(k => {
                topicFreq[k] = (topicFreq[k] || 0) + 1;
            });
        }
    });
    const topTopics = new Set(
        Object.entries(topicFreq)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 30)
            .map(e => e[0])
    );

    projects.forEach(p => {
        // Project node
        const projId = 'proj_' + p.id;
        if (!nodesMap.has(projId)) {
            nodesMap.set(projId, { id: projId, label: p.id || 'Project', nodeType: 'Project', ...DASH_NODE_STYLES.Project });
            dashNodeDataMap.set(projId, {
                type: 'Project',
                properties: { id: p.id, title: p.title, status: p.status, pi: p.pi, inst: p.inst, date: p.date, dur: p.dur }
            });
        }

        // Institution node + edge
        if (p.inst) {
            const instId = 'inst_' + p.inst;
            if (!nodesMap.has(instId)) {
                nodesMap.set(instId, { id: instId, label: p.inst.length > 25 ? p.inst.substring(0, 25) + '...' : p.inst, nodeType: 'Institution', ...DASH_NODE_STYLES.Institution });
                dashNodeDataMap.set(instId, { type: 'Institution', properties: { name: p.inst } });
            }
            edges.push({ id: 'e' + (edgeId++), from: projId, to: instId, ...DASH_EDGE_STYLES.HOSTED_BY, arrows: { to: { enabled: true, scaleFactor: 0.5 } }, smooth: { type: 'continuous' } });
        }

        // PI node + edge
        if (p.pi) {
            const piId = 'pi_' + p.pi;
            if (!nodesMap.has(piId)) {
                nodesMap.set(piId, { id: piId, label: p.pi, nodeType: 'Person', ...DASH_NODE_STYLES.Person });
                dashNodeDataMap.set(piId, { type: 'Person', properties: { name: p.pi, institution: p.inst } });
            }
            edges.push({ id: 'e' + (edgeId++), from: piId, to: projId, ...DASH_EDGE_STYLES.LEADS, arrows: { to: { enabled: true, scaleFactor: 0.5 } }, smooth: { type: 'continuous' } });
        }

        // Topic nodes + edges
        if (p.kw) {
            const keywords = p.kw.replace(/;/g, ',').split(',').map(k => k.trim()).filter(k => k.length > 2);
            keywords.forEach(kw => {
                if (!topTopics.has(kw)) return;
                const topicId = 'topic_' + kw;
                if (!nodesMap.has(topicId)) {
                    nodesMap.set(topicId, { id: topicId, label: kw.length > 20 ? kw.substring(0, 20) + '...' : kw, nodeType: 'Topic', ...DASH_NODE_STYLES.Topic });
                    dashNodeDataMap.set(topicId, { type: 'Topic', properties: { name: kw, count: topicFreq[kw] } });
                }
                edges.push({ id: 'e' + (edgeId++), from: projId, to: topicId, ...DASH_EDGE_STYLES.TAGGED, arrows: { to: { enabled: true, scaleFactor: 0.5 } }, smooth: { type: 'continuous' } });
            });
        }
    });

    // Calculate degrees
    const degrees = new Map();
    edges.forEach(e => {
        degrees.set(e.from, (degrees.get(e.from) || 0) + 1);
        degrees.set(e.to, (degrees.get(e.to) || 0) + 1);
    });

    // Scale node sizes based on degree
    for (const node of nodesMap.values()) {
        const degree = degrees.get(node.id) || 0;
        const baseSize = DASH_NODE_STYLES[node.nodeType]?.size || 12;
        // Logarithmic scaling to prevent huge nodes: base + (log(degree+1) * 8)
        // or simple linear with cap. Let's try simple linear first but capped.
        // Actually log is better for networks.
        // Let's use: size = baseSize + (degree * 1.5) capped at baseSize * 2.5
        // Or for hubs:
        const addedSize = Math.min(degree * 2, 40); // Cap added size at 40
        node.size = baseSize + addedSize;

        // Update tooltip to show degree
        node.title = `${node.label} (${degree} connections)`;
    }

    return { nodes: Array.from(nodesMap.values()), edges };
}

function renderDashboardGraph(projects) {
    const vizContainer = document.getElementById('dashboardViz');
    if (!vizContainer) return;

    dashNodeDataMap = new Map();

    if (projects.length === 0) {
        vizContainer.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:100%;color:#64748b;"><p>필터링된 과제가 없습니다.</p></div>';
        if (dashNetwork) { dashNetwork.destroy(); dashNetwork = null; }
        return;
    }

    const limitSelect = document.getElementById('graphLimitSelect');
    const maxProjects = limitSelect ? parseInt(limitSelect.value) : 200;

    const capped = projects.slice(0, maxProjects);
    const capMsg = document.getElementById('dashboardCapMsg');

    if (projects.length > maxProjects) {
        if (capMsg) {
            capMsg.textContent = `Performance optimized: Showing top ${maxProjects} projects (Total: ${projects.length})`;
            capMsg.style.display = 'block';
        }
    } else {
        if (capMsg) capMsg.style.display = 'none';
    }

    vizContainer.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:100%;color:#64748b;"><p>네트워크 생성 중...</p></div>';

    const { nodes, edges } = buildGraphData(capped);
    dashAllNodes = nodes;
    dashAllEdges = edges;

    // Apply type filter
    const { filteredNodes, filteredEdges } = applyTypeFilter(nodes, edges);

    vizContainer.innerHTML = '';

    dashVisNodes = new vis.DataSet(filteredNodes);
    dashVisEdges = new vis.DataSet(filteredEdges);
    dashFocusedNode = null;

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

    dashNetwork = new vis.Network(vizContainer, { nodes: dashVisNodes, edges: dashVisEdges }, options);

    dashNetwork.once('stabilizationIterationsDone', function () {
        dashNetwork.fit({ animation: { duration: 800, easingFunction: 'easeInOutQuad' } });
    });

    // Click event — focus/blur toggle
    dashNetwork.on('click', function (params) {
        const popup = document.getElementById('dashboardNodePopup');
        if (params.nodes.length > 0) {
            const nodeId = params.nodes[0];
            if (dashFocusedNode === nodeId) {
                // Clicking same node again — remove focus
                clearNodeFocus();
                dashFocusedNode = null;
            } else {
                // Focus on this node
                dashFocusedNode = nodeId;
                applyNodeFocus(nodeId);
                const raw = dashNodeDataMap.get(nodeId);
                const visNode = dashVisNodes.get(nodeId);
                if (raw && visNode) showDashboardNodePopup(raw, visNode);
            }
        } else {
            // Clicked empty space — clear focus
            if (dashFocusedNode) {
                clearNodeFocus();
                dashFocusedNode = null;
            }
            if (popup) popup.style.display = 'none';
        }
    });

    // Show legend and update active states
    const legend = document.getElementById('dashboardLegend');
    if (legend) {
        legend.classList.remove('hidden');
        updateLegendStates();
    }
}

const DASH_TYPE_DISPLAY = {
    Institution: '기관',
    Project: '과제',
    Person: '연구자',
    Topic: '주제'
};

const DASH_PROP_DISPLAY = {
    name: '이름',
    id: '과제번호',
    title: '과제명',
    status: '상태',
    pi: '과제책임자',
    inst: '수행기관',
    date: '시작일',
    dur: '수행기간',
    count: '등장 횟수',
    institution: '소속기관'
};

function showDashboardNodePopup(raw, visNode) {
    const popup = document.getElementById('dashboardNodePopup');
    if (!popup) return;

    const typeLabel = DASH_TYPE_DISPLAY[raw.type] || raw.type;
    const style = DASH_NODE_STYLES[raw.type] || DASH_NODE_STYLES.Project;
    const bgColor = style.color.background;
    const borderColor = style.color.border;

    let propsHtml = '';
    for (const [key, val] of Object.entries(raw.properties)) {
        if (val === null || val === undefined || val === '') continue;
        const displayKey = DASH_PROP_DISPLAY[key] || key;
        let displayVal = val;
        if (typeof val === 'string' && val.length > 200) {
            displayVal = val.substring(0, 200) + '...';
        }
        propsHtml += `<tr><td style="font-weight:600;color:#64748b;padding:6px 12px 6px 0;vertical-align:top;white-space:nowrap;font-size:0.85rem;">${displayKey}</td><td style="padding:6px 0;font-size:0.85rem;word-break:break-word;">${displayVal}</td></tr>`;
    }

    // Count connections
    if (dashNetwork) {
        const connectedNodes = dashNetwork.getConnectedNodes(visNode.id);
        propsHtml += `<tr><td style="font-weight:600;color:#64748b;padding:6px 12px 6px 0;font-size:0.85rem;">연결 수</td><td style="padding:6px 0;font-size:0.85rem;">${connectedNodes.length}개 노드</td></tr>`;
    }

    popup.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
            <div style="display:flex;align-items:center;gap:10px;">
                <div style="width:16px;height:16px;border-radius:50%;background:${bgColor};border:2px solid ${borderColor};"></div>
                <span style="font-size:0.8rem;font-weight:600;color:${borderColor};text-transform:uppercase;">${typeLabel}</span>
            </div>
            <button onclick="closeDashboardNodePopup()" style="background:none;border:none;font-size:1.4rem;cursor:pointer;color:#94a3b8;line-height:1;">&times;</button>
        </div>
        <h3 style="font-size:1.1rem;font-weight:700;color:#1e293b;margin-bottom:14px;line-height:1.4;">${visNode.label}</h3>
        <table style="width:100%;border-collapse:collapse;">${propsHtml}</table>
    `;
    popup.style.display = 'block';
}

function closeDashboardNodePopup() {
    const popup = document.getElementById('dashboardNodePopup');
    if (popup) popup.style.display = 'none';
}

function fitDashboardGraph() {
    if (dashNetwork) dashNetwork.fit({ animation: { duration: 500, easingFunction: 'easeInOutQuad' } });
}

// Focus/blur: type-aware hop depth
// Project: 1 hop (hub node, directly connects to PI/Inst/Topic)
// Person: 2 hops (Person → Projects → Inst + Topics)
// Institution: 3 hops selective (→ Projects → Topics → peer Projects sharing Topics)
// Topic: 3 hops selective (→ Projects → PIs → peer Projects by same PIs)
function applyNodeFocus(nodeId) {
    if (!dashNetwork || !dashVisNodes || !dashVisEdges) return;

    const raw = dashNodeDataMap.get(nodeId);
    const clickedType = raw ? raw.type : 'Project';

    const connectedNodes = new Set([nodeId]);
    const connectedEdges = new Set();

    // Hop 1: direct neighbors (always)
    const hop1Nodes = dashNetwork.getConnectedNodes(nodeId);
    hop1Nodes.forEach(n => connectedNodes.add(n));
    dashNetwork.getConnectedEdges(nodeId).forEach(e => connectedEdges.add(e));

    // Hop 2: expand from hop-1 nodes (skip for Project — 1 hop already shows everything)
    if (clickedType !== 'Project') {
        hop1Nodes.forEach(nid => {
            dashNetwork.getConnectedNodes(nid).forEach(n => connectedNodes.add(n));
            dashNetwork.getConnectedEdges(nid).forEach(e => connectedEdges.add(e));
        });
    }

    // Hop 3 (selective): only for Institution and Topic
    // Institution → expand from Topic nodes to find peer projects/institutions sharing same topics
    // Topic → expand from Person nodes to find peer projects/topics by same researchers
    if (clickedType === 'Institution' || clickedType === 'Topic') {
        const expandType = clickedType === 'Institution' ? 'Topic' : 'Person';
        const hop2Snapshot = new Set(connectedNodes);
        hop2Snapshot.forEach(nid => {
            if (nid === nodeId) return;
            const nRaw = dashNodeDataMap.get(nid);
            if (nRaw && nRaw.type === expandType) {
                dashNetwork.getConnectedNodes(nid).forEach(n => connectedNodes.add(n));
                dashNetwork.getConnectedEdges(nid).forEach(e => connectedEdges.add(e));
            }
        });

        // Safety cap: if expansion is too large, fall back to 2-hop
        if (connectedNodes.size > 80) {
            connectedNodes.clear();
            connectedEdges.clear();
            connectedNodes.add(nodeId);
            hop1Nodes.forEach(n => connectedNodes.add(n));
            dashNetwork.getConnectedEdges(nodeId).forEach(e => connectedEdges.add(e));
            hop1Nodes.forEach(nid => {
                dashNetwork.getConnectedNodes(nid).forEach(n => connectedNodes.add(n));
                dashNetwork.getConnectedEdges(nid).forEach(e => connectedEdges.add(e));
            });
        }
    }

    // Dim unconnected nodes
    const nodeUpdates = [];
    dashVisNodes.forEach(node => {
        if (connectedNodes.has(node.id)) {
            const nRaw = dashNodeDataMap.get(node.id);
            const type = nRaw ? nRaw.type : 'Project';
            const style = DASH_NODE_STYLES[type];
            nodeUpdates.push({ id: node.id, color: style.color, font: style.font, opacity: 1.0 });
        } else {
            nodeUpdates.push({
                id: node.id,
                color: { background: '#e2e8f0', border: '#cbd5e1', highlight: { background: '#e2e8f0', border: '#cbd5e1' }, hover: { background: '#e2e8f0', border: '#cbd5e1' } },
                font: { color: '#cbd5e1', strokeWidth: 0 },
                opacity: 0.3,
                chosen: false
            });
        }
    });
    dashVisNodes.update(nodeUpdates);

    // Dim unconnected edges
    const edgeUpdates = [];
    dashVisEdges.forEach(edge => {
        if (connectedEdges.has(edge.id)) {
            edgeUpdates.push({ id: edge.id, color: undefined, width: undefined, hidden: false });
        } else {
            edgeUpdates.push({ id: edge.id, color: { color: '#f1f5f9', highlight: '#f1f5f9', hover: '#f1f5f9' }, width: 0.5, hidden: false, chosen: false });
        }
    });
    dashVisEdges.update(edgeUpdates);
}

function clearNodeFocus() {
    if (!dashVisNodes || !dashVisEdges) return;

    // Restore all nodes to their original styles
    const nodeUpdates = [];
    dashVisNodes.forEach(node => {
        const raw = dashNodeDataMap.get(node.id);
        const type = raw ? raw.type : 'Project';
        const style = DASH_NODE_STYLES[type];
        nodeUpdates.push({ id: node.id, color: style.color, font: style.font, opacity: 1.0, chosen: true });
    });
    dashVisNodes.update(nodeUpdates);

    // Restore all edges
    const edgeUpdates = [];
    dashVisEdges.forEach(edge => {
        // Determine original edge style from relationship
        let origStyle = DASH_EDGE_STYLES.HOSTED_BY; // default
        // Check edge endpoints to determine type
        const fromRaw = dashNodeDataMap.get(edge.from);
        const toRaw = dashNodeDataMap.get(edge.to);
        if (fromRaw && fromRaw.type === 'Person') origStyle = DASH_EDGE_STYLES.LEADS;
        else if (toRaw && toRaw.type === 'Topic') origStyle = DASH_EDGE_STYLES.TAGGED;
        else if (toRaw && toRaw.type === 'Institution') origStyle = DASH_EDGE_STYLES.HOSTED_BY;
        edgeUpdates.push({ id: edge.id, color: origStyle.color, width: origStyle.width, chosen: true });
    });
    dashVisEdges.update(edgeUpdates);
}

// Filter nodes/edges by visible types
function applyTypeFilter(nodes, edges) {
    const visibleNodeIds = new Set();
    const filteredNodes = nodes.filter(n => {
        if (dashVisibleTypes.has(n.nodeType)) {
            visibleNodeIds.add(n.id);
            return true;
        }
        return false;
    });
    const filteredEdges = edges.filter(e => visibleNodeIds.has(e.from) && visibleNodeIds.has(e.to));
    return { filteredNodes, filteredEdges };
}

// Toggle a node type via legend click
function toggleLegendType(type) {
    if (dashVisibleTypes.has(type)) {
        // Don't allow hiding all types
        if (dashVisibleTypes.size <= 1) return;
        dashVisibleTypes.delete(type);
    } else {
        dashVisibleTypes.add(type);
    }
    updateLegendStates();

    // Re-render graph with new filter
    if (dashGraphVisible && dashAllNodes.length > 0) {
        const vizContainer = document.getElementById('dashboardViz');
        if (!vizContainer) return;

        const { filteredNodes, filteredEdges } = applyTypeFilter(dashAllNodes, dashAllEdges);
        vizContainer.innerHTML = '';

        dashVisNodes = new vis.DataSet(filteredNodes);
        dashVisEdges = new vis.DataSet(filteredEdges);
        dashFocusedNode = null;

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
            interaction: { hover: true, tooltipDelay: 200, zoomView: true, dragView: true }
        };

        dashNetwork = new vis.Network(vizContainer, { nodes: dashVisNodes, edges: dashVisEdges }, options);
        dashNetwork.once('stabilizationIterationsDone', function () {
            dashNetwork.fit({ animation: { duration: 800, easingFunction: 'easeInOutQuad' } });
        });
        dashNetwork.on('click', function (params) {
            const popup = document.getElementById('dashboardNodePopup');
            if (params.nodes.length > 0) {
                const nodeId = params.nodes[0];
                if (dashFocusedNode === nodeId) {
                    clearNodeFocus();
                    dashFocusedNode = null;
                } else {
                    dashFocusedNode = nodeId;
                    applyNodeFocus(nodeId);
                    const raw = dashNodeDataMap.get(nodeId);
                    const visNode = dashVisNodes.get(nodeId);
                    if (raw && visNode) showDashboardNodePopup(raw, visNode);
                }
            } else {
                if (dashFocusedNode) {
                    clearNodeFocus();
                    dashFocusedNode = null;
                }
                if (popup) popup.style.display = 'none';
            }
        });
    }
}

// Update legend item visual states
function updateLegendStates() {
    document.querySelectorAll('.legend-item').forEach(item => {
        const type = item.dataset.type;
        if (type) {
            if (dashVisibleTypes.has(type)) {
                item.classList.add('active');
                item.classList.remove('inactive');
            } else {
                item.classList.remove('active');
                item.classList.add('inactive');
            }
        }
    });
}

// Toggle graph visibility
function toggleDashboardGraph() {
    const vizContainer = document.getElementById('dashboardViz');
    const legend = document.getElementById('dashboardLegend');
    const btn = document.getElementById('toggleGraphBtn');
    const controls = document.getElementById('dashboardGraphControls');
    const capMsg = document.getElementById('dashboardCapMsg');

    if (!vizContainer) return;

    dashGraphVisible = !dashGraphVisible;

    if (dashGraphVisible) {
        vizContainer.classList.remove('hidden');
        if (controls) controls.classList.remove('hidden');
        btn.textContent = '네트워크 숨기기';
        // Render with current filtered data
        if (window.filteredProjects) {
            renderDashboardGraph(window.filteredProjects);
        }
    } else {
        vizContainer.classList.add('hidden');
        if (legend) legend.classList.add('hidden');
        if (controls) controls.classList.add('hidden');
        if (capMsg) capMsg.style.display = 'none';
        btn.textContent = '네트워크 보기';
        closeDashboardNodePopup();
        if (dashNetwork) { dashNetwork.destroy(); dashNetwork = null; }
    }
}

// Called from app.js applyFilters()
function updateDashboardGraph(filtered) {
    // Expose filteredProjects globally for toggle use
    window.filteredProjects = filtered;
    if (dashGraphVisible) {
        renderDashboardGraph(filtered);
    }
}

// Auto-refresh when limit changes
window.onLimitChange = function () {
    // Only re-render if graph is currently visible and we have data
    if (dashGraphVisible && window.filteredProjects) {
        renderDashboardGraph(window.filteredProjects);
    }
};

// Make functions global
window.updateDashboardGraph = updateDashboardGraph;
window.toggleDashboardGraph = toggleDashboardGraph;
window.fitDashboardGraph = fitDashboardGraph;
window.closeDashboardNodePopup = closeDashboardNodePopup;
window.toggleLegendType = toggleLegendType;
window.onLimitChange = onLimitChange;
