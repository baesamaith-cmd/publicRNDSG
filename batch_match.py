#!/usr/bin/env python3
"""
batch_match.py - Batch match all R-Card researchers against IGMS projects.

Reads pre-computed embeddings (no ML model needed) and generates CSV reports.

Usage:
    python batch_match.py                        # Match all, top-10, output to reports/
    python batch_match.py --top-k 20             # Top 20 matches per researcher
    python batch_match.py --output-dir ./results # Custom output directory
    python batch_match.py --researcher 10520     # Single researcher by employee ID
"""

import argparse
import csv
import json
import os
import re
import sys
import time
from datetime import datetime
from urllib.parse import unquote

import numpy as np

# -------------------------------------------------------------------
# Paths
# -------------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.path.join(BASE_DIR, 'researcher_data.csv')
CACHE_DIR = os.path.join(BASE_DIR, 'dashboard', 'data', 'rcard-cache')
PROJECTS_PATH = os.path.join(BASE_DIR, 'dashboard', 'data', 'projects.json')
EMBEDDINGS_PATH = os.path.join(BASE_DIR, 'dashboard', 'data', 'embeddings.json')
DEFAULT_OUTPUT_DIR = os.path.join(BASE_DIR, 'reports')

# Scoring weights (must match matcher.js)
SEMANTIC_WEIGHT = 0.7
KEYWORD_WEIGHT = 0.3


# -------------------------------------------------------------------
# Utility functions (copied from crawl_all_rcard.py to avoid playwright dep)
# -------------------------------------------------------------------

def slug_to_filename(slug: str) -> str:
    """Convert standard base64 slug to URL-safe filename."""
    return slug.replace('+', '-').replace('/', '_').rstrip('=')


def extract_slug_from_url(url: str) -> str:
    """Extract slug from R-Card URL."""
    decoded = unquote(url)
    match = re.search(r'/detail/(.+?)(/information)?$', decoded)
    if match:
        return match.group(1)
    return ""


def load_researchers(csv_path: str) -> list:
    """Load researcher data from CSV."""
    researchers = []
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        next(reader)  # skip header
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
                    'cache_name': slug_to_filename(slug),
                })
    return researchers


# -------------------------------------------------------------------
# Data loading
# -------------------------------------------------------------------

def load_rcard_caches(researchers: list) -> tuple:
    """
    Load all R-Card cache files aligned to researcher list order.

    Returns:
        embeddings: np.ndarray (N, 384) float32
        keywords:   list of list[str]
        metadata:   list of dict
        warnings:   list of str
    """
    embeddings = []
    keywords = []
    metadata = []
    warnings = []

    for r in researchers:
        cache_path = os.path.join(CACHE_DIR, f"{r['cache_name']}.json")
        if not os.path.exists(cache_path):
            warnings.append(f"MISSING_CACHE: {r['name']} ({r['emp_id']})")
            embeddings.append(np.zeros(384, dtype=np.float32))
            keywords.append([])
            metadata.append({'name': r['name'], 'affiliation': '', 'id': r['emp_id'], 'url': r['url']})
            continue

        with open(cache_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        # Embedding
        emb = data.get('embedding')
        if emb and len(emb) == 384:
            embeddings.append(np.array(emb, dtype=np.float32))
        else:
            warnings.append(f"NO_EMBEDDING: {r['name']} ({r['emp_id']})")
            embeddings.append(np.zeros(384, dtype=np.float32))

        # Keywords
        kw = data.get('keywords', [])
        keywords.append(kw if kw else [])

        # Metadata
        meta = data.get('metadata', {})
        metadata.append({
            'name': meta.get('name', r['name']),
            'affiliation': meta.get('affiliation', ''),
            'id': meta.get('id', r['emp_id']),
            'url': meta.get('url', r['url']),
        })

    return np.stack(embeddings), keywords, metadata, warnings


def load_projects(path: str) -> list:
    """Load projects.json."""
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def load_embeddings(path: str) -> np.ndarray:
    """Load embeddings.json as float32 NumPy matrix."""
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    return np.array(data, dtype=np.float32)


# -------------------------------------------------------------------
# Scoring
# -------------------------------------------------------------------

def parse_project_keywords(kw_str: str) -> frozenset:
    """Parse project keyword string (semicolon or comma delimited). Matches matcher.js logic."""
    if not kw_str:
        return frozenset()
    tokens = re.split(r'[;,]', kw_str)
    return frozenset(t.strip().lower() for t in tokens if len(t.strip()) > 1)


def compute_semantic_scores(r_emb: np.ndarray, p_emb: np.ndarray) -> np.ndarray:
    """Compute semantic similarity via matrix multiply. Returns (N_researchers, N_projects)."""
    return r_emb @ p_emb.T


def compute_keyword_scores(r_keywords: list, p_keyword_sets: list) -> np.ndarray:
    """Compute Jaccard keyword overlap for all pairs. Returns (N_researchers, N_projects)."""
    n_r = len(r_keywords)
    n_p = len(p_keyword_sets)
    scores = np.zeros((n_r, n_p), dtype=np.float32)

    # Pre-compute researcher keyword sets
    r_sets = [frozenset(k.lower() for k in kw) if kw else frozenset() for kw in r_keywords]

    for i in range(n_r):
        if not r_sets[i]:
            continue  # all zeros for this researcher
        r_set = r_sets[i]
        r_size = len(r_set)
        for j in range(n_p):
            p_set = p_keyword_sets[j]
            if not p_set:
                continue
            intersection = len(r_set & p_set)
            if intersection > 0:
                scores[i, j] = intersection / (r_size + len(p_set) - intersection)

    return scores


def get_top_k(final_scores: np.ndarray, sem_scores: np.ndarray,
              kw_scores: np.ndarray, k: int) -> list:
    """
    Extract top-k matches per researcher.
    Returns list of lists: [[{idx, final, semantic, keyword, rank}, ...], ...]
    """
    n_r = final_scores.shape[0]
    results = []

    for i in range(n_r):
        row = final_scores[i]
        # Partial sort for efficiency
        if k < len(row):
            top_indices = np.argpartition(row, -k)[-k:]
        else:
            top_indices = np.arange(len(row))
        # Sort the top-k by score descending
        top_indices = top_indices[np.argsort(row[top_indices])[::-1]]

        matches = []
        for rank, idx in enumerate(top_indices[:k], 1):
            matches.append({
                'idx': int(idx),
                'final': float(row[idx]),
                'semantic': float(sem_scores[i, idx]),
                'keyword': float(kw_scores[i, idx]),
                'rank': rank,
            })
        results.append(matches)

    return results


# -------------------------------------------------------------------
# Report generation
# -------------------------------------------------------------------

def generate_detail_csv(path: str, researchers: list, rcard_meta: list,
                        projects: list, top_matches: list):
    """Write detailed CSV: one row per researcher-project match."""
    with open(path, 'w', newline='', encoding='utf-8-sig') as f:
        writer = csv.writer(f)
        writer.writerow([
            'researcher_name', 'employee_id', 'affiliation', 'rcard_url',
            'rank', 'project_id', 'project_title', 'project_pi', 'project_inst',
            'project_keywords', 'final_score', 'semantic_score', 'keyword_score',
        ])

        for i, r in enumerate(researchers):
            meta = rcard_meta[i]
            for m in top_matches[i]:
                p = projects[m['idx']]
                writer.writerow([
                    meta['name'],
                    r['emp_id'],
                    meta['affiliation'],
                    meta['url'],
                    m['rank'],
                    p['id'],
                    p['title'],
                    p['pi'],
                    p['inst'],
                    p.get('kw', ''),
                    f"{m['final']:.4f}",
                    f"{m['semantic']:.4f}",
                    f"{m['keyword']:.4f}",
                ])


def generate_summary_csv(path: str, researchers: list, rcard_meta: list,
                         projects: list, top_matches: list):
    """Write summary CSV: one row per researcher with top-3 inline."""
    with open(path, 'w', newline='', encoding='utf-8-sig') as f:
        writer = csv.writer(f)
        writer.writerow([
            'researcher_name', 'employee_id', 'affiliation',
            'match1_id', 'match1_title', 'match1_pi', 'match1_inst', 'match1_score',
            'match2_id', 'match2_title', 'match2_pi', 'match2_inst', 'match2_score',
            'match3_id', 'match3_title', 'match3_pi', 'match3_inst', 'match3_score',
            'avg_top3', 'max_score',
        ])

        for i, r in enumerate(researchers):
            meta = rcard_meta[i]
            matches = top_matches[i]
            row = [meta['name'], r['emp_id'], meta['affiliation']]

            top3_scores = []
            for rank in range(3):
                if rank < len(matches):
                    m = matches[rank]
                    p = projects[m['idx']]
                    row.extend([p['id'], p['title'], p['pi'], p['inst'], f"{m['final']:.4f}"])
                    top3_scores.append(m['final'])
                else:
                    row.extend(['', '', '', '', ''])

            avg3 = sum(top3_scores) / len(top3_scores) if top3_scores else 0
            max_s = max(top3_scores) if top3_scores else 0
            row.extend([f"{avg3:.4f}", f"{max_s:.4f}"])
            writer.writerow(row)


def print_summary(researchers, rcard_meta, top_matches, projects, elapsed):
    """Print console summary statistics."""
    n = len(researchers)
    top1_scores = [m[0]['final'] if m else 0 for m in top_matches]

    print(f"\n{'='*60}")
    print(f"  Batch Matching Complete")
    print(f"{'='*60}")
    print(f"  Researchers:  {n}")
    print(f"  Projects:     {len(projects)}")
    print(f"  Time:         {elapsed:.1f}s")
    print(f"{'='*60}")
    print(f"\n  Score Distribution (top-1 match per researcher):")
    print(f"    Max:    {max(top1_scores)*100:.1f}%")
    print(f"    Avg:    {np.mean(top1_scores)*100:.1f}%")
    print(f"    Median: {np.median(top1_scores)*100:.1f}%")
    print(f"    Min:    {min(top1_scores)*100:.1f}%")

    # Count by score brackets
    brackets = [(50, '≥50%'), (40, '40-50%'), (30, '30-40%'), (0, '<30%')]
    counts = {}
    for s in top1_scores:
        pct = s * 100
        if pct >= 50:
            counts['≥50%'] = counts.get('≥50%', 0) + 1
        elif pct >= 40:
            counts['40-50%'] = counts.get('40-50%', 0) + 1
        elif pct >= 30:
            counts['30-40%'] = counts.get('30-40%', 0) + 1
        else:
            counts['<30%'] = counts.get('<30%', 0) + 1

    print(f"\n  Researchers by top-1 score bracket:")
    for label in ['≥50%', '40-50%', '30-40%', '<30%']:
        c = counts.get(label, 0)
        bar = '█' * (c // 2)
        print(f"    {label:>8s}: {c:3d}  {bar}")

    # Top 5 strongest matches overall
    print(f"\n  Top 5 Strongest Matches:")
    all_top1 = [(i, top_matches[i][0]) for i in range(n) if top_matches[i]]
    all_top1.sort(key=lambda x: x[1]['final'], reverse=True)
    for rank, (i, m) in enumerate(all_top1[:5], 1):
        p = projects[m['idx']]
        print(f"    {rank}. {rcard_meta[i]['name']} → {p['title'][:50]}  ({m['final']*100:.1f}%)")

    print()


# -------------------------------------------------------------------
# Main
# -------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description='Batch match R-Card researchers against IGMS projects')
    parser.add_argument('--top-k', type=int, default=10, help='Top K matches per researcher (default: 10)')
    parser.add_argument('--output-dir', type=str, default=DEFAULT_OUTPUT_DIR, help='Output directory')
    parser.add_argument('--researcher', type=str, default=None, help='Match single researcher by employee ID')
    args = parser.parse_args()

    t_start = time.time()

    # 1. Load researchers
    print("[1/6] Loading researchers...")
    researchers = load_researchers(CSV_PATH)
    print(f"  {len(researchers)} researchers loaded from CSV")

    # Filter to single researcher if requested
    if args.researcher:
        researchers = [r for r in researchers if r['emp_id'] == args.researcher]
        if not researchers:
            print(f"  ERROR: No researcher found with emp_id={args.researcher}")
            sys.exit(1)
        print(f"  Filtered to: {researchers[0]['name']} ({args.researcher})")

    # 2. Load R-Card caches
    print("[2/6] Loading R-Card cache files...")
    r_embeddings, r_keywords, r_metadata, warnings = load_rcard_caches(researchers)
    print(f"  {r_embeddings.shape[0]} embeddings loaded ({r_embeddings.shape[1]}d)")
    if warnings:
        for w in warnings:
            print(f"  WARNING: {w}")

    # 3. Load projects
    print("[3/6] Loading projects...")
    projects = load_projects(PROJECTS_PATH)
    print(f"  {len(projects)} projects loaded")

    # 4. Load IGMS embeddings
    print("[4/6] Loading project embeddings...")
    t_emb = time.time()
    p_embeddings = load_embeddings(EMBEDDINGS_PATH)
    print(f"  {p_embeddings.shape[0]} × {p_embeddings.shape[1]} embeddings loaded in {time.time()-t_emb:.1f}s")

    # Verify alignment
    assert len(projects) == p_embeddings.shape[0], \
        f"projects.json ({len(projects)}) and embeddings.json ({p_embeddings.shape[0]}) size mismatch!"

    # 5. Compute scores
    print("[5/6] Computing scores...")

    # Semantic (fast matrix multiply)
    t_sem = time.time()
    sem_scores = compute_semantic_scores(r_embeddings, p_embeddings)
    print(f"  Semantic scores: {sem_scores.shape} in {time.time()-t_sem:.2f}s")

    # Keyword (Jaccard loop)
    t_kw = time.time()
    p_keyword_sets = [parse_project_keywords(p.get('kw', '')) for p in projects]
    kw_scores = compute_keyword_scores(r_keywords, p_keyword_sets)
    print(f"  Keyword scores:  {kw_scores.shape} in {time.time()-t_kw:.1f}s")

    # Final hybrid
    final_scores = SEMANTIC_WEIGHT * sem_scores + KEYWORD_WEIGHT * kw_scores

    # Extract top-K
    top_matches = get_top_k(final_scores, sem_scores, kw_scores, args.top_k)

    # 6. Generate reports
    print("[6/6] Generating reports...")
    os.makedirs(args.output_dir, exist_ok=True)
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')

    detail_path = os.path.join(args.output_dir, f'match_detail_{timestamp}.csv')
    summary_path = os.path.join(args.output_dir, f'match_summary_{timestamp}.csv')

    generate_detail_csv(detail_path, researchers, r_metadata, projects, top_matches)
    generate_summary_csv(summary_path, researchers, r_metadata, projects, top_matches)

    total_rows = sum(len(m) for m in top_matches)
    print(f"  Detail:  {detail_path} ({total_rows} rows)")
    print(f"  Summary: {summary_path} ({len(researchers)} rows)")

    elapsed = time.time() - t_start
    print_summary(researchers, r_metadata, top_matches, projects, elapsed)


if __name__ == '__main__':
    main()
