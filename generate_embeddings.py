
import json
import os
import pandas as pd
from sentence_transformers import SentenceTransformer
from tqdm import tqdm
import numpy as np

# Configuration
DATA_DIR = 'dashboard/data'
INPUT_FILE = os.path.join(DATA_DIR, 'projects.json')
OUTPUT_FILE = os.path.join(DATA_DIR, 'embeddings.json')
MODEL_NAME = 'sentence-transformers/all-MiniLM-L6-v2'

def main():
    print(f"Loading data from {INPUT_FILE}...")
    
    # Load projects
    if not os.path.exists(INPUT_FILE):
        print(f"Error: {INPUT_FILE} not found.")
        return

    with open(INPUT_FILE, 'r', encoding='utf-8') as f:
        projects = json.load(f)
    
    print(f"Found {len(projects)} projects.")

    # Prepare text for embedding
    # We combine Title + Abstract + Keywords
    print("Preparing text corpus...")
    corpus = []
    
    for p in projects:
        # Handle potential None/null values
        title = p.get('title', '') or ''
        abstract = p.get('abs', '') or ''
        keywords = p.get('kw', '') or ''
        
        # Combine fields with separators
        text = f"{title}. {abstract}. {keywords}"
        corpus.append(text)

    # Load Model
    print(f"Loading model {MODEL_NAME}...")
    model = SentenceTransformer(MODEL_NAME)

    # Generate Embeddings
    print("Generating embeddings (this may take a while)...")
    embeddings = model.encode(corpus, show_progress_bar=True, convert_to_numpy=True)
    
    # Normalize embeddings for Cosine Similarity
    # (all-MiniLM-L6-v2 already produces normalized vectors, but good safety measure)
    print("Normalizing vectors...")
    norm = np.linalg.norm(embeddings, axis=1, keepdims=True)
    embeddings = embeddings / norm

    # Convert to list for JSON serialization
    # We round to 4 decimal places to save space without losing much precision
    print("Converting to rounded list...")
    embeddings_list = np.round(embeddings, 4).tolist()

    # Save to JSON
    # Structure: array of arrays. Index matches projects.json index.
    print(f"Saving to {OUTPUT_FILE}...")
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(embeddings_list, f)
        
    print(f"Done! Saved {len(embeddings_list)} vectors.")
    
    # Calculate file size
    size_mb = os.path.getsize(OUTPUT_FILE) / (1024 * 1024)
    print(f"Embedding file size: {size_mb:.2f} MB")

if __name__ == "__main__":
    main()
