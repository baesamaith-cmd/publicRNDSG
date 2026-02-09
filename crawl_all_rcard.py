#!/usr/bin/env python3
"""
crawl_all_rcard.py - Batch crawl all researchers from researcher_data.csv

Usage:
    python crawl_all_rcard.py                   # Crawl all (skip already cached)
    python crawl_all_rcard.py --force            # Re-crawl everything
    python crawl_all_rcard.py --dry-run          # Show slugs only, don't crawl
    python crawl_all_rcard.py --embed-only       # Add embeddings to existing cache (no re-crawl)
"""

import asyncio
import csv
import json
import os
import re
import sys
import time
from urllib.parse import quote, unquote, urlparse

import numpy as np
from playwright.async_api import async_playwright

# -------------------------------------------------------------------
# Paths
# -------------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.path.join(BASE_DIR, 'researcher_data.csv')
CACHE_DIR = os.path.join(BASE_DIR, 'dashboard', 'data', 'rcard-cache')
API_BASE = "https://api-v2.rcard.re.kr"
RCARD_BASE = "https://rcard.re.kr/detail"

# Rate limiting
DELAY_BETWEEN_CRAWLS = 2  # seconds between each crawl

# Embedding model (MUST match generate_embeddings.py)
EMBEDDING_MODEL = 'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2'
_model_cache = None

def get_embedding_model():
    """Load model once and cache it."""
    global _model_cache
    if _model_cache is None:
        from sentence_transformers import SentenceTransformer
        print(f"  Loading embedding model: {EMBEDDING_MODEL} ...")
        _model_cache = SentenceTransformer(EMBEDDING_MODEL)
    return _model_cache


def generate_embedding(text: str) -> list:
    """Generate 384-dim embedding for text."""
    model = get_embedding_model()
    vec = model.encode(text, normalize_embeddings=True)
    return np.round(vec, 4).tolist()


def extract_keywords_from_text(text: str) -> list:
    """
    Extract keywords from cached text (no API responses needed).
    Parses the structured text format to find keyword lines.
    """
    keywords = set()
    for line in text.split('\n'):
        line = line.strip()
        # "Keywords: IoT, AIoT, ..."
        if line.startswith('Keywords:'):
            for k in line[len('Keywords:'):].split(','):
                k = k.strip()
                if k and len(k) > 1:
                    keywords.add(k)
        # "Top Keywords (by frequency): ..."
        if line.startswith('Top Keywords (by frequency):'):
            for k in line[len('Top Keywords (by frequency):'):].split(','):
                k = k.strip()
                if k and len(k) > 1:
                    keywords.add(k)
        # "(Keywords: ...)" in project/paper lines
        kw_match = re.search(r'\(Keywords:\s*(.+?)\)', line)
        if kw_match:
            for k in kw_match.group(1).split(','):
                k = k.strip()
                if k and len(k) > 1:
                    keywords.add(k)
    return sorted(keywords)


def slug_to_filename(slug: str) -> str:
    """
    Convert standard base64 slug to URL-safe filename.
    Standard base64: +, /, =  →  URL-safe: -, _ (strip =)
    This matches what matcher.js does when looking up cache files.
    """
    return slug.replace('+', '-').replace('/', '_').rstrip('=')


def extract_slug_from_url(url: str) -> str:
    """
    Extract slug from R-Card URL.
    URL format: https://rcard.re.kr/detail/{encoded_slug}/information
    The slug is URL-encoded (e.g., %2B → +, %2F → /, %3D → =)
    Returns the raw slug (standard base64 with +, /, =).
    """
    # Decode URL encoding
    decoded = unquote(url)
    # Extract slug between /detail/ and /information
    match = re.search(r'/detail/(.+?)(/information)?$', decoded)
    if match:
        return match.group(1)
    return ""


def load_researchers(csv_path: str) -> list[dict]:
    """Load researcher data from CSV. Returns list of {name, emp_id, url, slug}."""
    researchers = []
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        header = next(reader)  # Skip header: 이름,사원번호,주소,,
        for row in reader:
            if len(row) < 3 or not row[2].strip():
                continue
            name = row[0].strip()
            emp_id = row[1].strip()
            url = row[2].strip()
            slug = extract_slug_from_url(url)
            if slug:
                researchers.append({
                    'name': name,
                    'emp_id': emp_id,
                    'url': url,
                    'slug': slug,
                    'cache_name': slug_to_filename(slug)  # URL-safe filename
                })
    return researchers


async def crawl_single(page, slug: str) -> dict:
    """
    Crawl a single R-Card page using an existing Playwright page.
    Reuses same browser context for efficiency (no launch/close per researcher).
    """
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
        except Exception:
            pass

    page.on("response", handle_response)

    # URL-encode the slug (+ → %2B, / → %2F, = → %3D)
    encoded_slug = quote(slug, safe='')
    target_url = f"{RCARD_BASE}/{encoded_slug}/information"
    try:
        await page.goto(target_url, wait_until="networkidle", timeout=25000)
    except Exception:
        pass  # Still use captured data

    # Wait for delayed API calls
    await page.wait_for_timeout(4000)

    # Remove listener to avoid stacking
    page.remove_listener("response", handle_response)

    return format_data(slug, captured)


def format_data(slug: str, api_responses: dict) -> dict:
    """Format captured API data into aggregated text + metadata."""

    def unwrap(body):
        if isinstance(body, dict) and 'data' in body:
            return body['data']
        return body

    # --- Profile ---
    profile = None
    for endpoint, data in api_responses.items():
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
    for endpoint, data in api_responses.items():
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
                        for pi in p.get('projectItems', []):
                            desc = pi.get('description', '')
                            if desc:
                                projects_text += f"  Description: {desc}\n"
                    projects_text += "\n"
            break

    # --- Papers/Theses ---
    papers_text = ""
    for endpoint, data in api_responses.items():
        if '/thesis/detail/' in endpoint:
            body = unwrap(data['body'])
            if isinstance(body, dict):
                items = body.get('thesisInfoList', [])
                if items:
                    papers_text = f"Papers ({len(items)} total):\n"
                    for t in items[:30]:
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
    for endpoint, data in api_responses.items():
        if '/patent/detail/' in endpoint:
            body = unwrap(data['body'])
            if isinstance(body, dict):
                items = body.get('patentInfoList', body.get('content', []))
                if isinstance(items, list):
                    patent_items_all.extend(items)
    if patent_items_all:
        patents_text = f"Patents ({len(patent_items_all)} total):\n"
        for p in patent_items_all[:30]:
            if isinstance(p, dict):
                title = p.get('title', p.get('inventionTitle', ''))
                patents_text += f"- {title}\n"

    # --- Keywords frequency ---
    keyword_freq_text = ""
    for endpoint, data in api_responses.items():
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


def embed_existing_caches():
    """
    Add embeddings + keywords to all existing cache files (no re-crawl needed).
    Reads each JSON, generates embedding from text, extracts keywords, saves back.
    """
    print("=" * 60)
    print("  R-Card Batch Embedding (embed-only mode)")
    print("=" * 60)

    cache_files = sorted([f for f in os.listdir(CACHE_DIR) if f.endswith('.json')])
    print(f"\n  Found {len(cache_files)} cache files")

    # Check which already have embeddings
    needs_embedding = []
    for fname in cache_files:
        fpath = os.path.join(CACHE_DIR, fname)
        with open(fpath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        if 'embedding' not in data or data['embedding'] is None:
            needs_embedding.append((fname, fpath, data))

    print(f"  Need embedding: {len(needs_embedding)}")
    if not needs_embedding:
        print("  All cache files already have embeddings!")
        return

    # Load model once
    model = get_embedding_model()
    print(f"\n  Generating embeddings...")

    start_time = time.time()
    # Batch encode all texts at once for efficiency
    texts = [d['text'] for _, _, d in needs_embedding]
    print(f"  Encoding {len(texts)} texts in batch...")
    embeddings = model.encode(texts, normalize_embeddings=True, show_progress_bar=True)
    embeddings_rounded = np.round(embeddings, 4)

    # Save back
    for idx, (fname, fpath, data) in enumerate(needs_embedding):
        data['embedding'] = embeddings_rounded[idx].tolist()
        data['keywords'] = extract_keywords_from_text(data.get('text', ''))
        with open(fpath, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    elapsed = time.time() - start_time
    print(f"\n  Done! Embedded {len(needs_embedding)} files in {elapsed:.1f}s")
    print(f"  Avg embedding dim: {len(embeddings_rounded[0])}")


async def main():
    force = '--force' in sys.argv
    dry_run = '--dry-run' in sys.argv
    embed_only = '--embed-only' in sys.argv

    # Embed-only mode: just add embeddings to existing cache files
    if embed_only:
        embed_existing_caches()
        return

    print("=" * 60)
    print("  R-Card Batch Crawler")
    print("=" * 60)

    # Load researcher list
    researchers = load_researchers(CSV_PATH)
    print(f"\n  Loaded {len(researchers)} researchers from CSV")

    # Check existing cache
    os.makedirs(CACHE_DIR, exist_ok=True)
    existing = set(f.replace('.json', '') for f in os.listdir(CACHE_DIR) if f.endswith('.json'))
    print(f"  Existing cache files: {len(existing)}")

    # Determine which to crawl
    if force:
        to_crawl = researchers
        print(f"  Force mode: will re-crawl all {len(to_crawl)}")
    else:
        to_crawl = [r for r in researchers if r['cache_name'] not in existing]
        print(f"  New to crawl: {len(to_crawl)} (skipping {len(researchers) - len(to_crawl)} cached)")

    if dry_run:
        print(f"\n  [DRY RUN] Would crawl:")
        for i, r in enumerate(to_crawl, 1):
            print(f"    {i:3d}. {r['name']} ({r['emp_id']}) → {r['cache_name']}.json")
        return

    if not to_crawl:
        print("\n  Nothing to crawl — all researchers are already cached!")
        print("  Run with --embed-only to add embeddings to existing cache files.")
        return

    print(f"\n  Starting batch crawl...")
    print(f"  Delay between crawls: {DELAY_BETWEEN_CRAWLS}s")
    est_time = len(to_crawl) * (DELAY_BETWEEN_CRAWLS + 8)  # ~8s per crawl + delay
    print(f"  Estimated time: ~{est_time // 60}m {est_time % 60}s")
    print()

    # Stats
    success = 0
    failed = 0
    skipped = 0
    start_time = time.time()

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        page = await context.new_page()

        # Block unnecessary resources
        await page.route(
            re.compile(r"\.(png|jpg|jpeg|gif|svg|woff|woff2|ttf|eot|ico)$"),
            lambda route: route.abort()
        )

        for i, r in enumerate(to_crawl, 1):
            name = r['name']
            slug = r['slug']
            elapsed = time.time() - start_time
            eta = (elapsed / i * (len(to_crawl) - i)) if i > 0 else 0

            print(f"  [{i:3d}/{len(to_crawl)}] {name} ({r['emp_id']}) ... ", end="", flush=True)

            try:
                result = await crawl_single(page, slug)
                raw_text = result['text']

                if not raw_text or len(raw_text) < 20:
                    print(f"⚠ insufficient data ({len(raw_text)} chars)")
                    failed += 1
                else:
                    # Save cache with URL-safe filename (text + metadata only, no embedding yet)
                    cache_name = r['cache_name']
                    cache_file = os.path.join(CACHE_DIR, f"{cache_name}.json")
                    with open(cache_file, 'w', encoding='utf-8') as f:
                        json.dump(result, f, ensure_ascii=False, indent=2)
                    print(f"✓ {len(raw_text):,} chars (ETA: {int(eta)}s)")
                    success += 1

            except Exception as e:
                print(f"✗ Error: {e}")
                failed += 1

            # Rate limiting
            if i < len(to_crawl):
                await asyncio.sleep(DELAY_BETWEEN_CRAWLS)

        await browser.close()

    # Summary
    total_time = time.time() - start_time
    print(f"\n{'=' * 60}")
    print(f"  BATCH CRAWL COMPLETE")
    print(f"{'=' * 60}")
    print(f"  Total time: {int(total_time // 60)}m {int(total_time % 60)}s")
    print(f"  Success: {success}")
    print(f"  Failed:  {failed}")
    print(f"  Skipped: {len(researchers) - len(to_crawl)} (already cached)")

    cached_files = [f for f in os.listdir(CACHE_DIR) if f.endswith('.json')]
    print(f"  Total cache files: {len(cached_files)}")

    # Auto-run embedding after crawl
    if success > 0:
        print(f"\n  Now generating embeddings for new files...")
        embed_existing_caches()

    print(f"{'=' * 60}")


if __name__ == "__main__":
    asyncio.run(main())
