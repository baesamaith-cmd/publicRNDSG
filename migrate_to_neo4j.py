import json
import os
import sys
from neo4j import GraphDatabase
from dotenv import load_dotenv

# Load environment variables (optional, for safety)
load_dotenv()

# Configuration - Load from .env
NEO4J_URI = os.getenv("NEO4J_URI")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD")
JSON_FILE_PATH = "dashboard/data/projects.json"

def migrate_data():
    print("🚀 Starting migration to Neo4j...")

    if not NEO4J_URI or not NEO4J_PASSWORD:
        print("❌ Error: NEO4J_URI or NEO4J_PASSWORD not found.")
        print("   Please create a .env file with your credentials:")
        print("   NEO4J_URI=neo4j+s://...\n   NEO4J_USER=neo4j\n   NEO4J_PASSWORD=...")
        return
    
    # 1. Connect to Neo4j
    try:
        driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
        driver.verify_connectivity()
        print("✅ Connected to Neo4j!")
    except Exception as e:
        print(f"❌ Connection failed: {e}")
        print("   Please check your NEO4J_URI, USER, and PASSWORD in the script.")
        return

    # 2. Load JSON Data
    try:
        with open(JSON_FILE_PATH, 'r', encoding='utf-8') as f:
            projects = json.load(f)
        print(f"📄 Loaded {len(projects)} projects from JSON.")
    except Exception as e:
        print(f"❌ Failed to read JSON file: {e}")
        return

    # 3. Define Constraints (Schema)
    with driver.session() as session:
        print("🔒 Creating constraints...")
        session.run("CREATE CONSTRAINT projectId IF NOT EXISTS FOR (p:Project) REQUIRE p.id IS UNIQUE")
        session.run("CREATE CONSTRAINT personName IF NOT EXISTS FOR (p:Person) REQUIRE p.name IS UNIQUE")
        session.run("CREATE CONSTRAINT instName IF NOT EXISTS FOR (i:Institution) REQUIRE i.name IS UNIQUE")
        session.run("CREATE CONSTRAINT topicName IF NOT EXISTS FOR (t:Topic) REQUIRE t.name IS UNIQUE")

        # 4. Ingest Data
        print("📦 Ingesting data (this may take a moment)...")
        
        # We'll do this in batches for efficiency, but for ~6k simple records, one go is often fine.
        # However, passing the whole list as a parameter is safer and faster.
        
        query = """
        UNWIND $projects AS value
        
        // 1. Create Project
        MERGE (p:Project {id: value.id})
        SET p.title = value.title,
            p.status = value.status,
            p.date = value.date,
            p.duration = value.dur,
            p.abstract = value.abs,
            p.url = value.url

        // 2. Link Institution
        MERGE (i:Institution {name: CASE WHEN value.inst IS NULL THEN "Unknown" ELSE value.inst END})
        MERGE (p)-[:HOSTED_BY]->(i)

        // 3. Link PI
        MERGE (pi:Person {name: CASE WHEN value.pi IS NULL THEN "Unknown" ELSE value.pi END})
        MERGE (pi)-[:LEADS]->(p)
        MERGE (pi)-[:AFFILIATED_WITH]->(i)

        // 4. Link Topics
        WITH p, value
        UNWIND split(value.kw, ",") AS keyword
        WITH p, trim(keyword) AS cleanKeyword
        WHERE cleanKeyword <> ""
        MERGE (t:Topic {name: cleanKeyword})
        MERGE (p)-[:TAGGED]->(t)
        """
        
        # Batch processing to avoid memory issues if list is huge
        batch_size = 1000
        total = len(projects)
        
        for i in range(0, total, batch_size):
            batch = projects[i:i + batch_size]
            print(f"   Processing batch {i} to {min(i + batch_size, total)}...")
            session.run(query, projects=batch)

    driver.close()
    print("🎉 Migration completed successfully!")

if __name__ == "__main__":
    migrate_data()
