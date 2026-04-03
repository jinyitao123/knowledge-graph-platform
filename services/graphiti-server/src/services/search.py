"""Wraps Graphiti search — returns edges with resolved entity names."""

import structlog
import httpx

from src.config import settings
from src.exceptions import SearchError
from src.models.requests import SearchRequest
from src.models.responses import SearchResponse, SearchResultItem

logger = structlog.get_logger()


async def _resolve_entity_names(uuids: set[str]) -> dict[str, str]:
    """Batch-resolve entity UUIDs to names via Neo4j HTTP API."""
    if not uuids:
        return {}

    try:
        neo4j_http = settings.neo4j_uri.replace("bolt://", "http://").replace(":7687", ":7474")
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.post(
                f"{neo4j_http}/db/neo4j/tx/commit",
                json={"statements": [{"statement": "MATCH (n:Entity) WHERE n.uuid IN $uuids RETURN n.uuid AS uuid, n.name AS name", "parameters": {"uuids": list(uuids)}}]},
                auth=(settings.neo4j_user, settings.neo4j_password),
            )
            data = resp.json()
            result = {}
            for row in data.get("results", [{}])[0].get("data", []):
                vals = row.get("row", [])
                if len(vals) >= 2 and vals[1]:
                    result[vals[0]] = vals[1]
            return result
    except Exception as e:
        logger.warning("entity name resolution failed", error=str(e))
        return {}


async def search_graph(request: SearchRequest) -> SearchResponse:
    """Search the knowledge graph using Graphiti hybrid search."""
    from src.main import graphiti_client

    if not graphiti_client:
        raise SearchError("Graphiti client not initialized")

    try:
        edges = await graphiti_client.search(
            query=request.query,
            group_ids=[request.ontology_id] if request.ontology_id else None,
            num_results=request.top_k,
        )
    except Exception as e:
        logger.error("search failed", query=request.query, error=str(e))
        raise SearchError(f"Search failed: {e}") from e

    # Collect all entity UUIDs for batch name resolution
    all_uuids = set()
    for edge in edges:
        all_uuids.add(edge.source_node_uuid)
        all_uuids.add(edge.target_node_uuid)

    uuid_to_name = await _resolve_entity_names(all_uuids)

    results = []
    for edge in edges:
        src_name = uuid_to_name.get(edge.source_node_uuid, edge.source_node_uuid[:8])
        tgt_name = uuid_to_name.get(edge.target_node_uuid, edge.target_node_uuid[:8])
        results.append(
            SearchResultItem(
                entity={
                    "source_id": edge.source_node_uuid,
                    "target_id": edge.target_node_uuid,
                    "source_name": src_name,
                    "target_name": tgt_name,
                    "relation": edge.name,
                },
                relations=[],
                score=0.0,
                evidence=edge.fact if hasattr(edge, "fact") else "",
            )
        )

    return SearchResponse(results=results)
