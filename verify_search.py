
import json
import numpy as np
from sentence_transformers import SentenceTransformer
import os

# Configuration
DATA_DIR = 'dashboard/data'
PROJECTS_FILE = os.path.join(DATA_DIR, 'projects.json')
EMBEDDINGS_FILE = os.path.join(DATA_DIR, 'embeddings.json')
MODEL_NAME = 'sentence-transformers/all-MiniLM-L6-v2'

def main():
    print("Loading data...")
    with open(PROJECTS_FILE, 'r') as f:
        projects = json.load(f)
    with open(EMBEDDINGS_FILE, 'r') as f:
        embeddings = np.array(json.load(f))

    print(f"Loaded {len(projects)} projects and {len(embeddings)} embeddings.")
    
    # query = "Improving elderly care in hospitals"
    query = "AI for healthcare"
    print(f"\nTest Query: '{query}'")
    
    print("Loading model for query encoding...")
    model = SentenceTransformer(MODEL_NAME)
    query_vector = model.encode(query, convert_to_numpy=True)
    
    # Normalize query (embeddings are already normalized in generate_embeddings.py)
    norm = np.linalg.norm(query_vector)
    query_vector = query_vector / norm
    
    print("Calculating similarity...")
    # Dot product
    scores = np.dot(embeddings, query_vector)
    
    # Get Top 5
    top_k_indices = np.argsort(scores)[::-1][:5]
    
    print("\nTop 5 Results:")
    print("-" * 50)
    for idx in top_k_indices:
        project = projects[idx]
        score = scores[idx]
        print(f"[{score:.4f}] {project['title']}")
        # print(f"       Abstract snippet: {project['abs'][:100]}...")
        print("-" * 50)

if __name__ == "__main__":
    main()
