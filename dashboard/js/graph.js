import Graph from "https://cdn.jsdelivr.net/npm/graphology@0.26.0/+esm";
import Sigma from "https://cdn.jsdelivr.net/npm/sigma@3.0.2/+esm";
import forceAtlas2 from "https://cdn.jsdelivr.net/npm/graphology-layout-forceatlas2@0.10.1/+esm";

const VIZ = document.getElementById("viz");
const LEGEND = document.getElementById("legend");

let renderer = null;
let graph = null;
let graphData = null; // parsed data/graph.json
let currentMode = null;

const NODE_BORDER = {
    Institution: "#2563eb",
    Project: "#8b5cf6",
    Person: "#f59e0b",
    Topic: "#22c55e"
};

const LABEL_DISPLAY = {
    Institution: "기관",
    Project: "과제",
    Person: "연구자",
    Topic: "주제"
};

const PROP_DISPLAY = {
    name: "이름",
    id: "과제번호",
    title: "과제명",
    status: "상태",
    start_date: "시작일",
    end_date: "종료일",
    duration_months: "수행기간(월)",
    abstract: "초록",
    agency: "지원기관",
    grant_amount: "지원금액"
};

function setVizMessage(html) {
    VIZ.innerHTML = `<div style="display:flex;flex-direction:column;justify-content:center;align-items:center;height:100%;color:#94a3b8;padding:20px;text-align:center;">${html}</div>`;
}

async function loadGraphData() {
    if (graphData) return graphData;
    const res = await fetch("/dashboard/data/graph.json");
    if (!res.ok) throw new Error(`graph.json 로드 실패 (${res.status})`);
    graphData = await res.json();
    return graphData;
}

function buildGraph(modeData) {
    const g = new Graph();

    // Deterministic circular seeding gives FA2 a stable starting point.
    const n = modeData.nodes.length;
    modeData.nodes.forEach((node, i) => {
        if (!g.hasNode(node.key)) {
            const angle = (2 * Math.PI * i) / n;
            g.addNode(node.key, {
                label: node.label,
                x: Math.cos(angle),
                y: Math.sin(angle),
                size: node.size,
                color: node.color,
                nodeType: node.nodeType,
                properties: node.properties || {}
            });
        }
    });

    modeData.edges.forEach(edge => {
        if (g.hasNode(edge.source) && g.hasNode(edge.target) && !g.hasEdge(edge.key)) {
            g.addEdgeWithKey(edge.key, edge.source, edge.target, {
                color: edge.color,
                size: edge.size
            });
        }
    });

    forceAtlas2.assign(g, {
        iterations: 300,
        settings: {
            gravity: 10,
            scalingRatio: 4,
            slowDown: 8,
            barnesHutOptimize: true,
            strongGravityMode: true
        }
    });

    return g;
}

function markActiveButton(mode) {
    document.querySelectorAll(".mode-btn").forEach(btn => {
        const active = btn.getAttribute("onclick").includes(`'${mode}'`);
        btn.classList.toggle("ring-2", active);
        btn.classList.toggle("ring-indigo-400", active);
        btn.classList.toggle("bg-white", active);
    });
}

async function drawGraph(mode) {
    closeNodePopup();
    currentMode = mode;
    markActiveButton(mode);

    let modeData;
    try {
        const data = await loadGraphData();
        modeData = data.modes[mode];
    } catch (e) {
        console.error(e);
        setVizMessage(`<p style="color:#e53e3e;font-weight:bold;">데이터 로드 오류</p><p style="margin-top:8px;font-size:0.9rem;">${e.message}</p>`);
        return;
    }

    if (!modeData || modeData.nodes.length === 0) {
        setVizMessage(`<p style="color:#e53e3e;">데이터가 없습니다.</p>`);
        return;
    }

    setVizMessage(`<p>레이아웃 계산 중...</p>`);

    // Yield to the browser so the loading message paints before layout runs.
    await new Promise(r => setTimeout(r, 30));

    try {
        if (renderer) renderer.kill();
        graph = buildGraph(modeData);

        renderer = new Sigma(graph, VIZ, {
            allowInvalidContainer: true,
            renderEdgeLabels: false,
            labelRenderedSizeThreshold: 3,
            minCameraRatio: 0.02,
            maxCameraRatio: 50,
            defaultEdgeType: "line"
        });

        renderer.on("clickNode", ({ node }) => showNodePopup(node));
        renderer.on("clickStage", () => closeNodePopup());

        fitCameraToGraph();
    } catch (e) {
        console.error(e);
        setVizMessage(`<p style="color:#e53e3e;font-weight:bold;">그래프 렌더링 오류</p><p style="margin-top:8px;font-size:0.9rem;">${e.message}</p>`);
        return;
    }

    LEGEND.style.display = "flex";
}

// Sigma's camera ratio defines the visible coordinate window size, so it must be
// derived from the laid-out position span — a constant would over/under-zoom.
function fitCameraToGraph(padding = 1.15) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    graph.forEachNode((_, attrs) => {
        minX = Math.min(minX, attrs.x); maxX = Math.max(maxX, attrs.x);
        minY = Math.min(minY, attrs.y); maxY = Math.max(maxY, attrs.y);
    });
    if (!isFinite(minX)) return;
    const span = Math.max(maxX - minX, maxY - minY, 0.001);
    renderer.getCamera().setState({
        x: (minX + maxX) / 2,
        y: (minY + maxY) / 2,
        ratio: span * padding,
        angle: 0
    });
}

function fitGraph() {
    if (!renderer) return;
    const camera = renderer.getCamera();
    camera.animate({ x: 0, y: 0, ratio: 1, angle: 0 }, { duration: 500 });
}

function zoomIn() {
    if (!renderer) return;
    const camera = renderer.getCamera();
    camera.animate({ ratio: camera.ratio / 1.3 }, { duration: 200 });
}

function zoomOut() {
    if (!renderer) return;
    const camera = renderer.getCamera();
    camera.animate({ ratio: camera.ratio * 1.3 }, { duration: 200 });
}

function showNodePopup(nodeKey) {
    const attrs = graph.getNodeAttributes(nodeKey);
    const typeLabel = LABEL_DISPLAY[attrs.nodeType] || attrs.nodeType;
    const bgColor = attrs.color;
    const borderColor = NODE_BORDER[attrs.nodeType] || "#94a3b8";

    let propsHtml = "";
    for (const [key, val] of Object.entries(attrs.properties || {})) {
        if (val === null || val === undefined || val === "") continue;
        const displayVal = key === "abstract" && typeof val === "string" && val.length > 200
            ? val.substring(0, 200) + "..."
            : val;
        propsHtml += `<tr><td style="font-weight:600;color:#64748b;padding:6px 12px 6px 0;vertical-align:top;white-space:nowrap;font-size:0.85rem;">${PROP_DISPLAY[key] || key}</td><td style="padding:6px 0;font-size:0.85rem;word-break:break-word;">${displayVal}</td></tr>`;
    }

    propsHtml += `<tr><td style="font-weight:600;color:#64748b;padding:6px 12px 6px 0;font-size:0.85rem;">연결 수</td><td style="padding:6px 0;font-size:0.85rem;">${graph.degree(nodeKey)}개 노드</td></tr>`;

    const popup = document.getElementById("nodePopup");
    popup.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
            <div style="display:flex;align-items:center;gap:10px;">
                <div style="width:16px;height:16px;border-radius:50%;background:${bgColor};border:2px solid ${borderColor};"></div>
                <span style="font-size:0.8rem;font-weight:600;color:${borderColor};text-transform:uppercase;">${typeLabel}</span>
            </div>
            <button onclick="closeNodePopup()" style="background:none;border:none;font-size:1.4rem;cursor:pointer;color:#94a3b8;line-height:1;">&times;</button>
        </div>
        <h3 style="font-size:1.1rem;font-weight:700;color:#1e293b;margin-bottom:14px;line-height:1.4;">${attrs.label}</h3>
        <table style="width:100%;border-collapse:collapse;">${propsHtml}</table>
    `;
    popup.style.display = "block";
}

function closeNodePopup() {
    document.getElementById("nodePopup").style.display = "none";
}

window.drawGraph = drawGraph;
window.fitGraph = fitGraph;
window.zoomIn = zoomIn;
window.zoomOut = zoomOut;
window.closeNodePopup = closeNodePopup;

drawGraph("inst-collab");
