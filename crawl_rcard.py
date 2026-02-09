#!/usr/bin/env python3
"""
crawl_rcard.py - R-Card Playwright Crawler + Multilingual Embedding + Semantic Search Pipeline

Usage:
    python crawl_rcard.py                                    # Default slug
    python crawl_rcard.py dVqRU4SC-9BOoKUhEZHj2w            # Custom slug
    python crawl_rcard.py --no-search dVqRU4SC-9BOoKUhEZHj2w  # Skip semantic search
"""

import asyncio
import json
import re
import sys
import os
import numpy as np
from playwright.async_api import async_playwright

# -------------------------------------------------------------------
# Paths (relative to project root)
# -------------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DICT_PATH = os.path.join(BASE_DIR, 'dashboard', 'data', 'ko-en-dict.json')
EMBEDDINGS_PATH = os.path.join(BASE_DIR, 'dashboard', 'data', 'embeddings.json')
PROJECTS_PATH = os.path.join(BASE_DIR, 'dashboard', 'data', 'projects.json')

# -------------------------------------------------------------------
# R-Card URLs
# -------------------------------------------------------------------
RCARD_BASE = "https://rcard.re.kr/detail"
API_BASE = "https://api-v2.rcard.re.kr"
CACHE_DIR = os.path.join(BASE_DIR, 'dashboard', 'data', 'rcard-cache')

DEFAULT_SLUG = "dVqRU4SC-9BOoKUhEZHj2w"


# ===================================================================
# KO→EN Translation (mirrors matcher.js exactly)
# ===================================================================
class KoEnTranslator:
    def __init__(self, dict_path: str):
        with open(dict_path, 'r', encoding='utf-8') as f:
            self.dictionary = json.load(f)
        # Sort keys by length descending (longest match first)
        self.keys = sorted(self.dictionary.keys(), key=len, reverse=True)
        print(f"  [KO→EN] Dictionary loaded: {len(self.keys)} entries")

    def translate(self, text: str) -> tuple[str, list]:
        """
        Translate Korean text to English using dictionary lookup.
        Returns (translated_text, list_of_matches_found).
        """
        if not text:
            return text, []

        translated = text
        matches_found = []

        # Step 1: Replace dictionary matches (longest first)
        for ko in self.keys:
            if ko in translated:
                en = self.dictionary[ko]
                count = translated.count(ko)
                translated = translated.replace(ko, en)
                matches_found.append((ko, en, count))

        # Step 2: Strip remaining Korean characters
        # Hangul syllables: \uAC00-\uD7AF
        # Hangul Jamo: \u1100-\u11FF
        # Compatibility Jamo: \u3130-\u318F
        translated = re.sub(r'[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]', '', translated)

        # Step 3: Clean up whitespace
        translated = re.sub(r'\s+', ' ', translated).strip()

        return translated, matches_found


# ===================================================================
# Playwright R-Card Crawler (API Interception)
# ===================================================================
class RCardCrawler:
    def __init__(self):
        self.api_responses = {}

    async def crawl(self, slug: str) -> dict:
        """
        Navigate to R-Card page, intercept API calls, extract researcher data.
        Returns dict with raw_text, metadata.
        """
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(
                user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            )
            page = await context.new_page()

            # Block unnecessary resources for speed
            await page.route(
                re.compile(r"\.(png|jpg|jpeg|gif|svg|woff|woff2|ttf|eot|ico)$"),
                lambda route: route.abort()
            )

            # Set up response listener for API calls
            captured = {}

            async def handle_response(response):
                url = response.url
                if API_BASE not in url:
                    return
                try:
                    status = response.status
                    endpoint = url.replace(API_BASE, '')
                    body = await response.json()
                    captured[endpoint] = {'status': status, 'body': body}
                    print(f"  Captured: {endpoint} -> {status}")
                except Exception as e:
                    print(f"  [warn] Failed to parse response from {url}: {e}")

            page.on("response", handle_response)

            # Navigate to R-Card page
            target_url = f"{RCARD_BASE}/{slug}/information"
            print(f"  Navigating to: {target_url}")

            try:
                await page.goto(target_url, wait_until="networkidle", timeout=20000)
            except Exception as e:
                print(f"  [warn] Page load: {e}")
                # Still try to use whatever we captured

            # Give extra time for delayed API calls
            # The SPA fires all API calls (profile, projects, theses, patents) on the information page
            await page.wait_for_timeout(5000)

            await browser.close()

        self.api_responses = captured
        return self._format_data(slug)

    def _format_data(self, slug: str) -> dict:
        """
        Format captured API data into aggregated text (same format as fetch-rcard.mts).

        R-Card API v2 response structure:
          - /account/detail/{id}     -> {"status":0, "data":{"name":"...", "keywords":"k1,k2", "keywordList":[...], "departmentCdDesc":"...", "introduction":"..."}}
          - /project/detail/{id}     -> {"status":0, "data":{"projectInfoList":[{"title":"...", "keywords":"...", "projectItems":[{"description":"..."}]}]}}
          - /thesis/detail/{id}      -> {"status":0, "data":{"thesisInfoList":[{"title":"...", "keywords":"..."}]}}
          - /patent/detail/{id}      -> {"status":0, "data":{"patentInfoList":[{"title":"..."}] or similar}}
          Also captures: /account/keyword/{id}, /account/detail/similarity/{id}, /account/detail/collaboration/{id}
        """

        # --- Helper: unwrap {"status":0, "data": {...}} ---
        def unwrap(body):
            if isinstance(body, dict) and 'data' in body:
                return body['data']
            return body

        # --- Profile ---
        profile = None
        for endpoint, data in self.api_responses.items():
            # Match /account/detail/{numeric_id} but NOT /similarity/ or /collaboration/
            if re.match(r'^/account/detail/\d+$', endpoint):
                profile = unwrap(data['body'])
                break

        name = ""
        affiliation = ""
        keywords_str = ""
        introduction = ""
        researcher_id = None

        if profile and isinstance(profile, dict):
            name = profile.get('name') or profile.get('engName') or ""
            eng_name = profile.get('engName') or ""
            if eng_name and eng_name not in name:
                name = f"{name} ({eng_name})"
            affiliation = profile.get('departmentCdDesc') or ""
            # Keywords can be a comma-separated string or a list
            kw = profile.get('keywordList') or profile.get('keywords', '')
            if isinstance(kw, list):
                keywords_str = ", ".join(str(k) for k in kw)
            elif isinstance(kw, str):
                keywords_str = kw.replace(',', ', ')
            introduction = profile.get('introduction') or ""
            researcher_id = profile.get('employeeNumber') or profile.get('accountIdx')

        aggregated = f"Researcher: {name}\nAffiliation: {affiliation}\nKeywords: {keywords_str}\n"
        if introduction:
            aggregated += f"Introduction: {introduction}\n"
        aggregated += "\n"

        # --- Projects ---
        projects_text = ""
        for endpoint, data in self.api_responses.items():
            if '/project/detail/' in endpoint and 'account' not in endpoint:
                body = unwrap(data['body'])
                if isinstance(body, dict):
                    items = body.get('projectInfoList', [])
                    if items:
                        projects_text = "Projects:\n"
                        for p in items:
                            title = p.get('title', '')
                            pkw = p.get('keywords', '')
                            projects_text += f"- {title} (Keywords: {pkw})\n"
                            # Also include project descriptions
                            for pi in p.get('projectItems', []):
                                desc = pi.get('description', '')
                                if desc:
                                    projects_text += f"  Description: {desc}\n"
                        projects_text += "\n"
                break

        # --- Papers/Theses ---
        papers_text = ""
        for endpoint, data in self.api_responses.items():
            if '/thesis/detail/' in endpoint:
                body = unwrap(data['body'])
                if isinstance(body, dict):
                    items = body.get('thesisInfoList', [])
                    if items:
                        papers_text = f"Papers ({len(items)} total):\n"
                        for t in items[:30]:  # Limit to first 30 for manageable text size
                            title = t.get('title', '')
                            tkw = t.get('keywords', '')
                            journal = t.get('journalName', '')
                            papers_text += f"- {title}"
                            if journal:
                                papers_text += f" [{journal}]"
                            if tkw:
                                papers_text += f" (Keywords: {tkw})"
                            papers_text += "\n"
                        papers_text += "\n"
                break

        # --- Patents ---
        patents_text = ""
        patent_items_all = []
        for endpoint, data in self.api_responses.items():
            if '/patent/detail/' in endpoint:
                body = unwrap(data['body'])
                if isinstance(body, dict):
                    # Patents may have patentInfoList or similar structure
                    items = body.get('patentInfoList', body.get('content', []))
                    if isinstance(items, list):
                        patent_items_all.extend(items)
        if patent_items_all:
            patents_text = f"Patents ({len(patent_items_all)} total):\n"
            for p in patent_items_all[:30]:  # Limit
                if isinstance(p, dict):
                    title = p.get('title', p.get('inventionTitle', ''))
                    patents_text += f"- {title}\n"

        # --- Keywords from /account/keyword/ endpoint ---
        keyword_freq_text = ""
        for endpoint, data in self.api_responses.items():
            if '/account/keyword/' in endpoint:
                body = unwrap(data['body'])
                if isinstance(body, list):
                    top_kw = [item.get('keyword', '') for item in body[:20] if isinstance(item, dict)]
                    if top_kw:
                        keyword_freq_text = f"Top Keywords (by frequency): {', '.join(top_kw)}\n\n"
                break

        aggregated += keyword_freq_text + projects_text + papers_text + patents_text

        metadata = {
            'name': name,
            'affiliation': affiliation,
            'id': researcher_id,
            'url': f"https://rcard.re.kr/detail/{slug}"
        }

        return {
            'text': aggregated.strip(),
            'metadata': metadata
        }


# ===================================================================
# Embedding Model (same as generate_embeddings.py — MUST match!)
# ===================================================================
EMBEDDING_MODEL = 'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2'

_model_cache = None

def get_embedding_model():
    """Load model once and cache it."""
    global _model_cache
    if _model_cache is None:
        from sentence_transformers import SentenceTransformer
        print(f"  Loading model: {EMBEDDING_MODEL} ...")
        _model_cache = SentenceTransformer(EMBEDDING_MODEL)
    return _model_cache


def generate_embedding(text: str) -> list:
    """
    Generate 384-dim embedding for text using the multilingual model.
    Returns list of floats (rounded to 4 decimals to match embeddings.json).
    """
    model = get_embedding_model()
    vec = model.encode(text, normalize_embeddings=True)
    return np.round(vec, 4).tolist()


def extract_keywords(api_responses: dict) -> list:
    """
    Extract keyword list from R-Card API responses.
    Combines: profile keywords, project keywords, paper keywords, top frequency keywords.
    Returns deduplicated keyword list.
    """
    def unwrap(body):
        if isinstance(body, dict) and 'data' in body:
            return body['data']
        return body

    keywords = set()

    for endpoint, data in api_responses.items():
        body = unwrap(data['body'])

        # Profile keywords
        if re.match(r'^/account/detail/\d+$', endpoint) and isinstance(body, dict):
            kw = body.get('keywordList') or body.get('keywords', '')
            if isinstance(kw, list):
                for k in kw:
                    if k: keywords.add(str(k).strip())
            elif isinstance(kw, str):
                for k in kw.split(','):
                    if k.strip(): keywords.add(k.strip())

        # Top frequency keywords
        if '/account/keyword/' in endpoint and isinstance(body, list):
            for item in body[:30]:
                if isinstance(item, dict):
                    kw = item.get('keyword', '')
                    if kw: keywords.add(kw.strip())

        # Project keywords
        if '/project/detail/' in endpoint and 'account' not in endpoint and isinstance(body, dict):
            for p in body.get('projectInfoList', []):
                pkw = p.get('keywords', '')
                if pkw:
                    for k in pkw.split(','):
                        if k.strip(): keywords.add(k.strip())

        # Paper keywords
        if '/thesis/detail/' in endpoint and isinstance(body, dict):
            for t in body.get('thesisInfoList', [])[:30]:
                tkw = t.get('keywords', '')
                if tkw:
                    for k in tkw.split(','):
                        if k.strip(): keywords.add(k.strip())

    # Remove very short or generic keywords
    keywords = [k for k in keywords if len(k) > 1]
    return sorted(keywords)


# ===================================================================
# Semantic Search (uses multilingual model — matches embeddings.json)
# ===================================================================
def run_semantic_search(query_embedding: list, top_k: int = 20) -> list:
    """
    Compare pre-computed query embedding against IGMS project embeddings.
    Returns list of {index, score, project} dicts.
    """
    print(f"  Loading embeddings from {EMBEDDINGS_PATH} ...")
    with open(EMBEDDINGS_PATH, 'r') as f:
        embeddings = json.load(f)

    print(f"  Loading projects from {PROJECTS_PATH} ...")
    with open(PROJECTS_PATH, 'r') as f:
        projects = json.load(f)

    print(f"  Computing cosine similarity against {len(embeddings)} project embeddings ...")
    embeddings_np = np.array(embeddings)
    query_np = np.array(query_embedding)
    scores = np.dot(embeddings_np, query_np)

    # Get top-k indices
    top_indices = np.argsort(scores)[::-1][:top_k]

    results = []
    for idx in top_indices:
        proj = projects[int(idx)]
        results.append({
            'index': int(idx),
            'score': float(scores[idx]),
            'title': proj.get('title', ''),
            'pi': proj.get('pi', ''),
            'inst': proj.get('inst', ''),
            'kw': proj.get('kw', ''),
            'url': proj.get('url', '')
        })

    return results


# ===================================================================
# Main Pipeline
# ===================================================================
async def main():
    # Parse arguments
    skip_search = '--no-search' in sys.argv
    slug = DEFAULT_SLUG
    for arg in sys.argv[1:]:
        if not arg.startswith('-'):
            slug = arg
            break

    print("=" * 60)
    print("  R-Card Crawler + Multilingual Embedding Pipeline")
    print("=" * 60)
    print(f"\nTarget slug: {slug}")
    print(f"URL: {RCARD_BASE}/{slug}/information\n")

    # ---------------------------------------------------------------
    # Step 1: Crawl R-Card page via Playwright
    # ---------------------------------------------------------------
    print(f"[Step 1/3] Crawling R-Card page via Playwright...")
    crawler = RCardCrawler()
    result = await crawler.crawl(slug)

    raw_text = result['text']
    metadata = result['metadata']

    print(f"\n{'─' * 50}")
    print("  RAW TEXT (Korean+English)")
    print(f"{'─' * 50}")
    print(raw_text[:500] + '...' if len(raw_text) > 500 else raw_text if raw_text else "(empty)")
    print(f"{'─' * 50}")
    print(f"  Total chars: {len(raw_text)}")

    if not raw_text or len(raw_text) < 20:
        print("\n[ERROR] Insufficient data crawled.")
        for ep, data in crawler.api_responses.items():
            print(f"    {ep} -> status={data['status']}")
        return

    # ---------------------------------------------------------------
    # Step 2: Generate embedding + extract keywords
    # ---------------------------------------------------------------
    print(f"\n[Step 2/3] Generating embedding with multilingual model...")
    print(f"  Model: {EMBEDDING_MODEL}")
    embedding = generate_embedding(raw_text)
    print(f"  Embedding: {len(embedding)}-dim vector")

    keywords = extract_keywords(crawler.api_responses)
    print(f"  Keywords extracted: {len(keywords)}")
    if keywords:
        print(f"  Sample: {', '.join(keywords[:10])}...")

    # ---------------------------------------------------------------
    # Save cache JSON with embedding + keywords
    # URL-safe filename: + → -, / → _, strip =
    # ---------------------------------------------------------------
    os.makedirs(CACHE_DIR, exist_ok=True)
    cache_name = slug.replace('+', '-').replace('/', '_').rstrip('=')
    cache_file = os.path.join(CACHE_DIR, f"{cache_name}.json")
    cache_data = {
        "text": raw_text,
        "metadata": metadata,
        "embedding": embedding,
        "keywords": keywords
    }
    with open(cache_file, 'w', encoding='utf-8') as f:
        json.dump(cache_data, f, ensure_ascii=False, indent=2)
    file_size = os.path.getsize(cache_file)
    print(f"\n  Cache saved → rcard-cache/{cache_name}.json ({file_size:,} bytes)")

    # ---------------------------------------------------------------
    # Step 3: Semantic Search
    # ---------------------------------------------------------------
    if skip_search:
        print("\n[Step 3/3] Semantic search skipped (--no-search flag).")
        return

    print(f"\n[Step 3/3] Running semantic search...")
    results = run_semantic_search(embedding, top_k=20)

    print(f"\n{'=' * 60}")
    print(f"  TOP 20 MATCHING IGMS PROJECTS")
    print(f"{'=' * 60}")
    for i, r in enumerate(results, 1):
        score_pct = r['score'] * 100
        print(f"\n  {i:2d}. [{score_pct:5.1f}%] {r['title']}")
        print(f"      PI: {r['pi']} | Inst: {r['inst']}")
        if r['kw']:
            kw_short = r['kw'][:100] + ('...' if len(r['kw']) > 100 else '')
            print(f"      KW: {kw_short}")

    print(f"\n{'=' * 60}")
    print("  Pipeline complete!")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    asyncio.run(main())
