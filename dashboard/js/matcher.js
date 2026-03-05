
// matcher.js - Researcher Matching Logic (Pre-computed Embedding + Hybrid Scoring)
// Uses multilingual embeddings pre-computed by crawl_rcard.py (no browser-side ML model needed)

const NETLIFY_FUNC_URL = '/.netlify/functions/fetch-rcard';
const EMBEDDINGS_PATH = 'data/embeddings.json';

let igmsEmbeddings = null;  // 5,772 × 384 pre-computed project embeddings

/**
 * Load IGMS project embeddings (same file used by ai-search.js dashboard).
 */
async function loadIGMSEmbeddings() {
    if (igmsEmbeddings) return;
    try {
        updateStatus('IGMS 임베딩 로딩 중...', 10);
        const res = await fetch(EMBEDDINGS_PATH);
        if (!res.ok) throw new Error('Embeddings file not found');
        igmsEmbeddings = await res.json();
        console.log(`[Matcher] IGMS embeddings loaded: ${igmsEmbeddings.length} projects × ${igmsEmbeddings[0].length}d`);
    } catch (e) {
        console.error('[Matcher] Failed to load embeddings:', e);
        throw e;
    }
}

/**
 * Compute dot product of two vectors (cosine similarity for normalized vectors).
 */
function dotProduct(a, b) {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
        sum += a[i] * b[i];
    }
    return sum;
}

/**
 * Stopwords to ignore in containment matching.
 */
const STOPWORDS = new Set([
    'the', 'a', 'an', 'of', 'in', 'on', 'for', 'and', 'or', 'to', 'with',
    'by', 'is', 'are', 'at', 'from', 'as', 'its', 'into', 'using', 'based',
    'via', 'towards', 'toward', 'through', 'between', 'under', 'over', 'about',
]);

/**
 * Tokenize a keyword phrase into individual words, removing stopwords.
 * E.g., "Multi-Agent Systems" → ["multi", "agent", "systems"]
 */
function tokenizePhrase(phrase) {
    return phrase.toLowerCase().split(/[\s\-_/]+/).filter(w => w.length > 1 && !STOPWORDS.has(w));
}

/**
 * Compute containment-based keyword score.
 * For each project keyword phrase, checks how many of its constituent words
 * exist in the researcher's keyword vocabulary.
 *
 * @param {string[]} rKeywords - Researcher keywords (individual word tokens)
 * @param {string[]} pPhrases - Project keyword phrases (multi-word)
 * @returns {number} Score between 0 and 1
 */
function keywordOverlap(rKeywords, pPhrases) {
    if (!rKeywords || !pPhrases || rKeywords.length === 0 || pPhrases.length === 0) return 0;

    // Build researcher vocabulary (tokenize all their keywords too)
    const rVocab = new Set();
    for (const kw of rKeywords) {
        for (const w of kw.toLowerCase().split(/[\s\-_/]+/)) {
            if (w.length > 1 && !STOPWORDS.has(w)) rVocab.add(w);
        }
    }
    if (rVocab.size === 0) return 0;

    // Score each project phrase by containment
    let totalScore = 0;
    let validPhrases = 0;
    for (const phrase of pPhrases) {
        const tokens = tokenizePhrase(phrase);
        if (tokens.length === 0) continue;
        const matched = tokens.filter(w => rVocab.has(w)).length;
        totalScore += matched / tokens.length;
        validPhrases++;
    }

    return validPhrases > 0 ? totalScore / validPhrases : 0;
}

/**
 * Parse project keywords from semicolon/comma-delimited string.
 */
function parseProjectKeywords(kwStr) {
    if (!kwStr) return [];
    return kwStr.split(/[;,]/).map(k => k.trim()).filter(k => k.length > 1);
}

// DOM Elements
export async function initMatcher(projects) {
    const matchBtn = document.getElementById('matchBtn');
    const matchUrlInput = document.getElementById('matchUrl');
    const matchResults = document.getElementById('matchResults');
    const researcherInfo = document.getElementById('researcherInfo');

    if (!matchBtn) {
        console.warn('initMatcher: matchBtn not found');
        return;
    }

    matchBtn.addEventListener('click', async () => {
        const url = matchUrlInput.value.trim();
        if (!url) {
            alert('Please enter a valid R-Card URL');
            return;
        }

        // Extract Slug
        // R-Card URLs: rcard.re.kr/detail/{base64_slug}/information
        // Slugs contain +, /, = chars (URL-encoded as %2B, %2F, %3D)
        let slug = url;
        try {
            slug = decodeURIComponent(slug);
        } catch (e) { /* already decoded */ }
        const match = slug.match(/detail\/([^/]+)/);
        if (match) {
            slug = match[1];
        }
        // Normalize to URL-safe base64 for cache filename lookup
        // Standard base64: + / =  →  URL-safe: - _ (strip =)
        slug = slug.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

        if (slug.length < 5) {
            alert('Invalid R-Card URL');
            return;
        }

        setLoading(true);
        matchResults.innerHTML = '';
        researcherInfo.classList.add('hidden');

        try {
            // 1. Load IGMS embeddings (first time only, cached after)
            await loadIGMSEmbeddings();

            // 2. Fetch R-Card cached data (with pre-computed embedding)
            updateStatus('R-Card 데이터 가져오는 중...', 30);

            let data;

            // Try static cache (generated by crawl_rcard.py with embedding)
            const cacheUrl = `/dashboard/data/rcard-cache/${slug}.json`;
            try {
                const cacheRes = await fetch(cacheUrl);
                if (cacheRes.ok) {
                    data = await cacheRes.json();
                    console.log(`[Matcher] Loaded from cache: ${cacheUrl}`);
                }
            } catch (e) {
                // Cache miss — continue to fallback
            }

            // Fallback: Netlify function (production only)
            if (!data) {
                const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
                if (isLocal) {
                    throw new Error('캐시 데이터가 없습니다. 먼저 crawl_rcard.py를 실행하세요:\n  python crawl_rcard.py ' + slug);
                }
                const response = await fetch(`${NETLIFY_FUNC_URL}?slug=${slug}`);
                if (!response.ok) {
                    throw new Error(`Failed to fetch R-Card Data: ${response.statusText}`);
                }
                data = await response.json();
                console.log('[Matcher] Loaded from Netlify function');
            }

            const { text, metadata, embedding, keywords: rKeywords } = data;

            // Display Researcher Info
            displayResearcherInfo(metadata);

            // 3. Check for pre-computed embedding
            if (!embedding || !Array.isArray(embedding) || embedding.length !== 384) {
                throw new Error('캐시에 임베딩이 없습니다. crawl_rcard.py를 다시 실행하세요.');
            }

            // 4. Compute similarity scores (dot product — vectors are pre-normalized)
            updateStatus('IGMS 프로젝트 매칭 중...', 60);

            const scores = [];
            for (let i = 0; i < igmsEmbeddings.length; i++) {
                const semanticScore = dotProduct(embedding, igmsEmbeddings[i]);

                // Containment-based keyword score (fixes granularity mismatch)
                const projPhrases = parseProjectKeywords(projects[i]?.kw);
                const kwScore = keywordOverlap(rKeywords || [], projPhrases);

                // Hybrid: 70% semantic + 30% keyword
                const finalScore = 0.7 * semanticScore + 0.3 * kwScore;

                scores.push({ index: i, score: finalScore, semantic: semanticScore, kwScore: kwScore });
            }

            scores.sort((a, b) => b.score - a.score);
            const totalProjects = scores.length;
            const topMatches = scores.slice(0, 20).map((item, rank) => {
                // Percentile: count how many projects score lower
                const lowerCount = scores.filter(s => s.score < item.score).length;
                const percentile = 100 - (lowerCount / totalProjects * 100);
                return {
                    id: projects[item.index].id,
                    score: item.score,
                    semantic: item.semantic,
                    kwScore: item.kwScore,
                    percentile: percentile.toFixed(1),
                };
            });

            const kwNonZero = scores.filter(s => s.kwScore > 0).length;
            console.log(`[Matcher] Top score: ${(topMatches[0].score * 100).toFixed(1)}% (semantic: ${(topMatches[0].semantic * 100).toFixed(1)}%, kw: ${(topMatches[0].kwScore * 100).toFixed(1)}%, Top ${topMatches[0].percentile}%)`);
            console.log(`[Matcher] Keyword coverage: ${kwNonZero}/${totalProjects} (${(kwNonZero/totalProjects*100).toFixed(1)}%) non-zero`);

            // 5. Render Results
            updateStatus('결과 표시 중...', 90);
            renderMatches(topMatches, projects);
            // Track match event
            window.trackEvent('match', { researcher_url: slug, top_score: topMatches[0]?.score || 0, results_count: topMatches.length });
            updateStatus('결과 표시 중...', 90);
            renderMatches(topMatches, projects);

        } catch (error) {
            console.error(error);
            alert(`Error: ${error.message}`);
            matchResults.innerHTML = `<div class="text-red-500 p-4">Error: ${error.message}</div>`;
        } finally {
            setLoading(false);
        }
    });
}

function displayResearcherInfo(metadata) {
    const researcherInfo = document.getElementById('researcherInfo');
    researcherInfo.classList.remove('hidden');

    // "문재원 (JaeWon Moon)" → "문재원"
    const korName = metadata.name.split('(')[0].trim();
    document.getElementById('rGreeting').textContent = `안녕하세요 ${korName}님!`;

    document.getElementById('rName').textContent = metadata.name;
    document.getElementById('rAffiliation').textContent = metadata.affiliation;
    document.getElementById('rLink').href = metadata.url;
}

function renderMatches(matches, projects) {
    const matchResults = document.getElementById('matchResults');
    if (matches.length === 0) {
        matchResults.innerHTML = '<div class="p-4 text-gray-500">No matches found.</div>';
        return;
    }

    const html = matches.map((m, idx) => {
        const p = projects.find(proj => proj.id === m.id);
        if (!p) return '';
        const pct = (m.score * 100).toFixed(1);
        const semPct = (m.semantic * 100).toFixed(0);
        const kwPct = (m.kwScore * 100).toFixed(0);
        const barColor = pct >= 50 ? '#9333ea' : pct >= 35 ? '#a855f7' : '#c084fc';

        return `
            <div class="match-card">
                <div class="match-card-top">
                    <span class="match-rank">${idx + 1}</span>
                    <a href="${p.url}" target="_blank" class="match-title">${p.title}</a>
                    <span class="match-score">${pct}% <span style="font-size:0.65rem;color:#a78bfa;font-weight:400">Top ${m.percentile}%</span></span>
                </div>
                <div class="match-bar-wrap">
                    <div class="match-bar" style="width:${pct}%;background:${barColor}"></div>
                </div>
                <div class="match-meta">${p.pi} · ${p.inst} <span class="match-detail">Semantic:${semPct} Keyword:${kwPct}</span></div>
            </div>
        `;
    }).join('');

    matchResults.innerHTML = html;
}

function updateStatus(message, percent) {
    console.log(`[Matcher ${percent}%] ${message}`);
}

function setLoading(isLoading) {
    const matchBtn = document.getElementById('matchBtn');
    if (isLoading) {
        matchBtn.disabled = true;
        matchBtn.innerHTML = '<span class="animate-spin inline-block w-4 h-4 border-2 border-white rounded-full border-t-transparent"></span> Processing...';
    } else {
        matchBtn.disabled = false;
        matchBtn.textContent = '매칭 시작';
    }
}

// Expose to Global Scope
window.initMatcher = initMatcher;
