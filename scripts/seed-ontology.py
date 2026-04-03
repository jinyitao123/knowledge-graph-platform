#!/usr/bin/env python3
"""Seed a sample ontology for testing the platform.

Usage:
    python scripts/seed-ontology.py [--backend-url http://localhost:8080]

Creates a "Company & Investment" ontology with entity and relation types.
"""
import argparse
import json
import sys

import httpx

SAMPLE_ONTOLOGY = {
    "name": "Company & Investment",
    "description": "Tracks companies, people, investment rounds, and acquisitions.",
}

ENTITY_TYPES = [
    {"name": "Person", "description": "An individual (founder, executive, investor)", "properties": {"title": {"type": "string"}, "nationality": {"type": "string"}}},
    {"name": "Company", "description": "A business entity (startup, corporation)", "properties": {"industry": {"type": "string"}, "founded_year": {"type": "number"}}},
    {"name": "InvestmentRound", "description": "A funding round (Seed, Series A, etc.)", "properties": {"round_type": {"type": "string"}, "amount_usd": {"type": "number"}}},
    {"name": "Product", "description": "A product or service offered by a company", "properties": {"category": {"type": "string"}}},
]

RELATION_TYPES = [
    {"name": "FOUNDED", "description": "Person founded a company", "source_type": "Person", "target_type": "Company"},
    {"name": "WORKS_AT", "description": "Person works at a company", "source_type": "Person", "target_type": "Company"},
    {"name": "INVESTED_IN", "description": "Person or company invested in another", "source_type": "Person", "target_type": "InvestmentRound"},
    {"name": "RAISED", "description": "Company raised an investment round", "source_type": "Company", "target_type": "InvestmentRound"},
    {"name": "ACQUIRED", "description": "Company acquired another company", "source_type": "Company", "target_type": "Company"},
    {"name": "OFFERS", "description": "Company offers a product", "source_type": "Company", "target_type": "Product"},
]


def main():
    parser = argparse.ArgumentParser(description="Seed sample ontology")
    parser.add_argument("--backend-url", default="http://localhost:8080")
    args = parser.parse_args()

    base = args.backend_url.rstrip("/")
    client = httpx.Client(timeout=30)

    # Create ontology
    print("Creating ontology...")
    resp = client.post(f"{base}/api/v1/ontologies", json=SAMPLE_ONTOLOGY)
    resp.raise_for_status()
    ontology = resp.json()
    oid = ontology["id"]
    print(f"  Created: {oid} ({ontology['name']})")

    # Add entity types
    print("Adding entity types...")
    resp = client.post(f"{base}/api/v1/ontologies/{oid}/entity-types", json={"types": ENTITY_TYPES})
    resp.raise_for_status()
    print(f"  Added {len(ENTITY_TYPES)} entity types")

    # Add relation types
    print("Adding relation types...")
    resp = client.post(f"{base}/api/v1/ontologies/{oid}/relation-types", json={"types": RELATION_TYPES})
    resp.raise_for_status()
    print(f"  Added {len(RELATION_TYPES)} relation types")

    print(f"\nDone! Ontology ID: {oid}")
    print(f"You can now upload documents targeting this ontology.")


if __name__ == "__main__":
    main()
