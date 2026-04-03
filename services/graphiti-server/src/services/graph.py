"""Subgraph retrieval, entity listing."""

import structlog

from src.models.responses import (
    EntitiesResponse,
    SubgraphResponse,
)

logger = structlog.get_logger()


async def list_entities(
    ontology_id: str | None, page: int, size: int
) -> EntitiesResponse:
    """List entities, optionally filtered by ontology (group_id)."""
    # Phase 1: implement via Graphiti graph driver queries
    logger.info("list_entities", ontology_id=ontology_id, page=page, size=size)
    return EntitiesResponse(entities=[], total=0, page=page, size=size)


async def get_subgraph(entity_id: str, hops: int) -> SubgraphResponse:
    """Get subgraph around an entity."""
    # Phase 1: implement via Graphiti graph driver queries
    logger.info("get_subgraph", entity_id=entity_id, hops=hops)
    return SubgraphResponse(nodes=[], edges=[])
