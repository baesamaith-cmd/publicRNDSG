// ai-search.js - AI Semantic Search Module (Dual Model Support)

const EMBEDDINGS_PATH_DASHBOARD = 'data/embeddings.json'; // Original English Embeddings
// const EMBEDDINGS_PATH_MATCHER = 'data/embeddings_multilingual.json'; // (Future: Pre-computed multilingual embeddings)

// Models
const MODEL_DASHBOARD = 'Xenova/all-MiniLM-L6-v2'; // Fast, English
const MODEL_MATCHER = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2'; // Multilingual

// State
const state = {
    dashboard: {
        model: null,
        embeddings: null, // Loaded from JSON
        isLoading: false,
        ready: false
    },
    matcher: {
        model: null,
        embeddings: null, // Generated on fly or loaded
        isLoading: false,
        ready: false
    },
    transformersLoaded: false
};

let Transformers = null; // Store dynamically imported module

// UI Elements (Shared)
const progressDiv = document.getElementById('aiProgress');
const statusText = document.getElementById('aiStatusText');
const progressBar = document.getElementById('aiProgressBar');
const progressPercent = document.getElementById('aiProgressPercent');

// Helper Functions
function showProgress(show) {
    if (progressDiv) {
        if (show) progressDiv.classList.remove('hidden');
        else progressDiv.classList.add('hidden');
    }
}

function updateStatus(text, percent) {
    if (statusText) statusText.textContent = text;
    if (progressBar) progressBar.style.width = `${percent}%`;
    if (progressPercent) progressPercent.textContent = `${Math.round(percent)}%`;
}

/**
 * Initialize AI Search
 * @param {string} type - 'dashboard' or 'matcher'
 */
export async function initAISearch(type = 'dashboard') {
    const targetState = state[type];
    if (!targetState) {
        console.error(`Invalid AI type: ${type}`);
        return false;
    }

    if (targetState.ready) return true;
    if (targetState.isLoading) return false;

    targetState.isLoading = true;
    showProgress(true);

    try {
        // 1. Load Transformers.js (Once)
        if (!state.transformersLoaded) {
            updateStatus('AI 라이브러리 로딩 중...', 5);
            Transformers = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.14.0/dist/transformers.min.js');
            Transformers.env.allowLocalModels = false;
            Transformers.env.useBrowserCache = ('caches' in self && self.isSecureContext);
            state.transformersLoaded = true;
        }

        // 2. Load Embeddings (Dashboard Only)
        // Matcher generates embeddings on the fly for the R-Card text
        if (type === 'dashboard' && !targetState.embeddings) {
            updateStatus('기존 과제 데이터 다운로드 중...', 10);
            const response = await fetch(EMBEDDINGS_PATH_DASHBOARD);
            if (!response.ok) throw new Error('Embeddings file not found');
            targetState.embeddings = await response.json();
            updateStatus('데이터 로드 완료', 30);
        }

        // 3. Load Model
        const modelName = type === 'dashboard' ? MODEL_DASHBOARD : MODEL_MATCHER;
        updateStatus(`${type === 'dashboard' ? '고속' : '다국어'} AI 모델 로딩 중...`, 40);

        const progressCallback = (data) => {
            if (data.status === 'progress') {
                const percent = Math.round(data.progress || 0);
                const totalPercent = 40 + (percent * 0.5);
                updateStatus(`모델 다운로드 중 (${percent}%)`, totalPercent);
            }
        };

        targetState.model = await Transformers.pipeline('feature-extraction', modelName, {
            progress_callback: progressCallback
        });

        updateStatus('AI 준비 완료!', 100);
        setTimeout(() => showProgress(false), 2000);

        targetState.isLoading = false;
        targetState.ready = true;
        return true;

    } catch (error) {
        console.error(`AI Init Error (${type}):`, error);
        updateStatus('오류 발생: ' + error.message, 0);
        targetState.isLoading = false;
        return false;
    }
}

/**
 * Get Embedding
 * @param {string} text 
 * @param {string} type - 'dashboard' or 'matcher'
 */
export async function getEmbedding(text, type = 'dashboard') {
    const targetState = state[type];
    if (!targetState.model) {
        console.warn(`AI Model (${type}) not initialized`);
        return null;
    }
    const output = await targetState.model(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
}

/**
 * Perform Semantic Search
 * @param {string} query 
 * @param {Array} projects 
 * @param {number} topK 
 * @param {string} type - 'dashboard' or 'matcher'
 */
export async function searchSemantic(query, projects, topK = 50, type = 'dashboard') {
    const targetState = state[type];

    // For Dashboard: Use loaded embeddings
    // For Matcher: We usually search AGAINST the loaded projects. 
    // BUT WAIT: The English Dashboard Embeddings are generated with 'all-MiniLM-L6-v2'.
    // The Matcher R-Card text is processed with 'multilingual'.
    // We CANNOT compare vectors from different models!
    // CRITICAL: We need embeddings for projects generated with the MULTILINGUAL model too if we want to match R-Card against them.
    // OR we translate R-Card to English and use the Dashboard model? No, user wanted Multilingual model.
    // So for "Matcher", we ideally need `embeddings_multilingual.json`.

    // TEMPORARY FIX:
    // If type is 'matcher', we are searching for a Korean query (or English text) against English projects.
    // If we only have English embeddings (MiniLM-L6), we MUST use the Dashboard model to encode the query/R-Card text so usage matches.
    // BUT the user specifically asked for "Multilingual" model for R-Card.
    // Use Case:
    // 1. Dashboard: Query (English) -> MiniLM-L6 -> Vector. Compare with `embeddings.json` (MiniLM-L6). OK.
    // 2. Matcher: R-Card (Korean/English mixed) -> Multilingual Model -> Vector.
    //    Compare with `embeddings.json` (MiniLM-L6). FAIL (Dimension mismatch 384 vs 384? layout diff).

    // SOLUTION: We MUST generate embeddings for projects using the Multilingual model too if we want to match against it.
    // Step 1: Check if `embeddings_multilingual.json` exists. If not, maybe fallback to Dashboard model for matching or warn user.
    // Actually, for now, let's assume the user mistakenly thinks just changing the query encoder is enough.
    // I will implement logic: For now, Matcher will use the Multilingual encoder, BUT we need a target DB.
    // Since we don't have `embeddings_multilingual.json` yet, I will use the Dashboard model for EVERYTHING involving `projects.json` matching for now,
    // AND warn the user that we need to regenerate embeddings.

    // REVISED PLAN based on "use separate vector db" request:
    // User said: "use separate vector db... for dashboard use previous english one".
    // This implies we DO need a second vector DB for Matcher.
    // I will look for `data/embeddings_multilingual.json`.
    // If not found, I will try to fetch it or fail gracefully.

    // Wait, the user hasn't generated `embeddings_multilingual.json` yet.
    // I should probably check if it exists or use a placeholder.
    // For now, I'll code it to look for `embeddings_multilingual.json` if type is `matcher`.

    let embeddingsToCheck = targetState.embeddings;

    if (type === 'matcher' && !embeddingsToCheck) {
        // Try to load multilingual embeddings if not loaded
        try {
            const res = await fetch('data/embeddings_multilingual.json');
            if (res.ok) {
                targetState.embeddings = await res.json();
                embeddingsToCheck = targetState.embeddings;
            } else {
                console.warn('Multilingual embeddings not found. Semantic search will fail for Matcher.');
            }
        } catch (e) { console.error(e); }
    }

    if (!targetState.model || !embeddingsToCheck) {
        console.warn(`AI Model or Embeddings for ${type} not ready`);
        return [];
    }

    if (!query || query.trim().length < 2) return [];

    // Encode Query
    const output = await targetState.model(query, { pooling: 'mean', normalize: true });
    const queryVector = output.data;

    // Calculate Cosine Similarity
    const scores = [];
    for (let i = 0; i < embeddingsToCheck.length; i++) {
        const embedding = embeddingsToCheck[i];
        let dot = 0;
        // Optimization: unroll loop or use typed arrays if possible, but JS loop is fine for <10k
        for (let j = 0; j < embedding.length; j++) {
            dot += queryVector[j] * embedding[j];
        }
        scores.push({ index: i, score: dot });
    }

    scores.sort((a, b) => b.score - a.score);

    return scores.slice(0, topK).map(item => ({
        id: projects[item.index].id,
        score: item.score
    }));
}

// Expose to Global Scope
window.initAISearch = initAISearch;
window.searchSemantic = searchSemantic;
window.getEmbedding = getEmbedding;
window.updateStatus = updateStatus;
window.showProgress = showProgress;

console.log('AI Search Module Loaded (Dual Model)', { initAISearch: !!window.initAISearch });
