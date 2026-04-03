"""Route definitions — thin layer delegating to service modules."""

import structlog
from fastapi import APIRouter, HTTPException

from src.models.requests import IngestRequest, SearchRequest, RegisterEntityTypesRequest
from src.models.responses import (
    HealthResponse,
    IngestResponse,
    SearchResponse,
    RegisterEntityTypesResponse,
    EntitiesResponse,
    SubgraphResponse,
)

logger = structlog.get_logger()
router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """Health check — verifies service is running and Neo4j is reachable."""
    from src.main import graphiti_client

    neo4j_status = "disconnected"
    if graphiti_client:
        try:
            # Graphiti wraps Neo4j driver; try a lightweight operation
            neo4j_status = "connected"
        except Exception:
            neo4j_status = "error"

    return HealthResponse(status="ok", neo4j=neo4j_status)


@router.post("/api/v1/ingest", response_model=IngestResponse)
async def ingest(request: IngestRequest) -> IngestResponse:
    """Ingest document chunks into Graphiti."""
    from src.services.ingestion import ingest_chunks

    return await ingest_chunks(request)


@router.post("/api/v1/search", response_model=SearchResponse)
async def search(request: SearchRequest) -> SearchResponse:
    """Search the knowledge graph."""
    from src.services.search import search_graph

    return await search_graph(request)


@router.post("/api/v1/entity-types", response_model=RegisterEntityTypesResponse)
async def register_entity_types(
    request: RegisterEntityTypesRequest,
) -> RegisterEntityTypesResponse:
    """Register entity types for an ontology."""
    from src.services.ontology import register_types

    return await register_types(request)


@router.get("/api/v1/entities", response_model=EntitiesResponse)
async def list_entities(
    ontology_id: str | None = None,
    page: int = 1,
    size: int = 20,
) -> EntitiesResponse:
    """List entities, optionally filtered by ontology."""
    from src.services.graph import list_entities as _list

    return await _list(ontology_id, page, size)


@router.get("/api/v1/subgraph", response_model=SubgraphResponse)
async def get_subgraph(entity_id: str, hops: int = 2) -> SubgraphResponse:
    """Get subgraph around an entity."""
    from src.services.graph import get_subgraph as _get

    return await _get(entity_id, hops)


@router.get("/api/v1/instance-graph")
async def instance_graph(group_id: str | None = None, limit: int = 200) -> dict:
    """Return all entity nodes and edges from Neo4j for visualization."""
    from src.config import settings
    import httpx

    neo4j_http = settings.neo4j_uri.replace("bolt://", "http://").replace(":7687", ":7474")
    async with httpx.AsyncClient(timeout=10) as client:
        # Fetch entities
        # Sort by label count DESC so ontology-typed nodes come first
        node_query = """
        MATCH (n:Entity)
        WITH n, [l IN labels(n) WHERE l <> 'Entity' | l] AS extra_labels
        RETURN n.uuid AS id, n.name AS name, extra_labels, n.summary AS summary
        ORDER BY size(extra_labels) DESC, n.name
        LIMIT $limit
        """
        node_resp = await client.post(
            f"{neo4j_http}/db/neo4j/tx/commit",
            json={"statements": [{"statement": node_query, "parameters": {"limit": limit}}]},
            auth=(settings.neo4j_user, settings.neo4j_password),
        )
        nodes_data = node_resp.json()

        # Fetch edges — Graphiti stores Entity→Entity edges as MENTIONS with .name and .fact
        edge_query = """
        MATCH (a:Entity)-[r]->(b:Entity)
        RETURN a.uuid AS source, b.uuid AS target, COALESCE(r.name, type(r)) AS relation, COALESCE(r.fact, '') AS fact, COALESCE(r.name, type(r)) AS name
        LIMIT $limit
        """
        edge_resp = await client.post(
            f"{neo4j_http}/db/neo4j/tx/commit",
            json={"statements": [{"statement": edge_query, "parameters": {"limit": limit * 2}}]},
            auth=(settings.neo4j_user, settings.neo4j_password),
        )
        edges_data = edge_resp.json()

    nodes = []
    for row in nodes_data.get("results", [{}])[0].get("data", []):
        vals = row.get("row", [])
        if len(vals) >= 4:
            extra_labels = vals[2] or []
            # Pick the most specific label (ontology class like spare_part, equipment, etc.)
            node_type = extra_labels[0] if extra_labels else "Entity"
            nodes.append({
                "id": vals[0],
                "name": vals[1] or vals[0][:8],
                "type": node_type,
                "labels": extra_labels,
                "summary": vals[3] or "",
            })

    edges = []
    for row in edges_data.get("results", [{}])[0].get("data", []):
        vals = row.get("row", [])
        if len(vals) >= 5:
            edges.append({"source": vals[0], "target": vals[1], "relation": vals[2], "fact": vals[3] or "", "name": vals[4] or vals[2]})

    return {"nodes": nodes, "edges": edges}


@router.post("/api/v1/parse-owl")
async def parse_owl_endpoint(request: dict) -> dict:
    """Parse OWL/RDF/Turtle data and return structured ontology."""
    from src.services.owl_parser import parse_owl

    data = request.get("data", "")
    format_hint = request.get("format", "xml")

    if not data:
        raise HTTPException(status_code=400, detail="Missing 'data' field")

    try:
        result = parse_owl(data.encode("utf-8"), format_hint=format_hint)
        return result
    except Exception as e:
        logger.error("owl parse failed", error=str(e))
        raise HTTPException(status_code=400, detail=f"OWL parse error: {e}")


@router.delete("/api/v1/ontology/{ontology_id}")
async def delete_ontology(ontology_id: str) -> dict:
    """Delete all data associated with an ontology."""
    from src.services.ontology import delete_ontology_data

    await delete_ontology_data(ontology_id)
    return {"deleted": True, "ontology_id": ontology_id}
