
import { env, pipeline } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.14.0/dist/transformers.min.js';

// Configuration
env.allowLocalModels = false;
env.useBrowserCache = true;

const EMBEDDINGS_PATH = 'data/embeddings.json';
const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';

// State
let embeddingModel = null;
let projectEmbeddings = null;
let isModelLoading = false;

// UI Elements
const progressDiv = document.getElementById('aiProgress');
const statusText = document.getElementById('aiStatusText');
const progressBar = document.getElementById('aiProgressBar');
const progressPercent = document.getElementById('aiProgressPercent');

/**
 * Initialize AI Search
 * Loads the model and embeddings.
 */
export async function initAISearch() {
    if (embeddingModel && projectEmbeddings) return true;
    if (isModelLoading) return false;

    isModelLoading = true;
    showProgress(true);

    try {
        // 1. Load Embeddings (JSON)
        updateStatus('임베딩 데이터 다운로드 중...', 10);
        const response = await fetch(EMBEDDINGS_PATH);
        if (!response.ok) throw new Error('Embeddings file not found');
        projectEmbeddings = await response.json();
        updateStatus('임베딩 데이터 로드 완료', 30);

        // 2. Load Model
        updateStatus('AI 모델 로딩 중... (최초 1회 다운로드)', 40);

        // Custom progress callback
        const progressCallback = (data) => {
            if (data.status === 'progress') {
                const percent = Math.round(data.progress || 0);
                // Map model loading (40-90%)
                const totalPercent = 40 + (percent * 0.5);
                updateStatus(`AI 모델 다운로드 중... ${percent}%`, totalPercent);
            }
        };

        embeddingModel = await pipeline('feature-extraction', MODEL_NAME, {
            progress_callback: progressCallback
        });

        updateStatus('AI 모델 준비 완료!', 100);
        setTimeout(() => showProgress(false), 2000); // Hide after 2s
        isModelLoading = false;
        return true;

    } catch (error) {
        console.error('AI Init Error:', error);
        updateStatus('오류 발생: ' + error.message, 0);
        isModelLoading = false;
        return false;
    }
}

/**
 * Perform Semantic Search
 * @param {string} query - User search query
 * @param {Array} projects - All projects array (to map back to IDs)
 * @param {number} topK - Number of results to return
 * @returns {Array} - List of project IDs sorted by similarity
 */
export async function searchSemantic(query, projects, topK = 50) {
    if (!embeddingModel || !projectEmbeddings) {
        console.warn('AI Model not initialized');
        return [];
    }

    if (!query || query.trim().length < 2) return [];

    // Encode Query
    const output = await embeddingModel(query, { pooling: 'mean', normalize: true });
    const queryVector = output.data;

    // Calculate Cosine Similarity
    // dot product since vectors are normalized
    const scores = [];

    for (let i = 0; i < projectEmbeddings.length; i++) {
        const embedding = projectEmbeddings[i];
        let dot = 0;
        for (let j = 0; j < embedding.length; j++) {
            dot += queryVector[j] * embedding[j];
        }
        scores.push({ index: i, score: dot });
    }

    // Sort by Score Descending
    scores.sort((a, b) => b.score - a.score);

    // Return Top K Project IDs
    // Assuming projectEmbeddings index matches projects array index
    return scores.slice(0, topK).map(item => ({
        id: projects[item.index].id,
        score: item.score
    }));
}

// UI Helpers
function showProgress(show) {
    if (show) {
        progressDiv.classList.remove('hidden');
    } else {
        progressDiv.classList.add('hidden');
    }
}

function updateStatus(text, percent) {
    statusText.textContent = text;
    progressBar.style.width = `${percent}%`;
    progressPercent.textContent = `${Math.round(percent)}%`;
}

// Expose to Global Scope for app.js
window.initAISearch = initAISearch;
window.searchSemantic = searchSemantic;

console.log('AI Search Module Loaded', { initAISearch: !!window.initAISearch });
