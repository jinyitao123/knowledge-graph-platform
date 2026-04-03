"""Document parsing + chunking + episode creation."""

from datetime import datetime, timezone

import structlog

from src.exceptions import IngestionError
from src.models.requests import IngestRequest
from src.models.responses import IngestResponse

logger = structlog.get_logger()


async def ingest_chunks(request: IngestRequest) -> IngestResponse:
    """Ingest document chunks via Graphiti add_episode()."""
    from src.main import graphiti_client
    from graphiti_core.nodes import EpisodeType

    if not graphiti_client:
        raise IngestionError("Graphiti client not initialized")

    episode_ids: list[str] = []
    total_entities = 0
    total_relations = 0

    for i, chunk in enumerate(request.chunks):
        try:
            result = await graphiti_client.add_episode(
                name=f"doc_{request.doc_id}_chunk_{i}",
                episode_body=chunk.text,
                source=EpisodeType.text,
                reference_time=datetime.now(timezone.utc),
                source_description=(
                    f"Document: {chunk.metadata.source_doc}, "
                    f"Page: {chunk.metadata.page_number}"
                ),
                group_id=request.ontology_id,
            )
            episode_ids.append(result.episode.uuid)
            total_entities += len(result.nodes)
            total_relations += len(result.edges)
        except Exception as e:
            logger.error(
                "chunk ingestion failed",
                doc_id=request.doc_id,
                chunk_index=i,
                error=str(e),
            )
            raise IngestionError(f"Failed to ingest chunk {i}: {e}") from e

    logger.info(
        "ingestion complete",
        doc_id=request.doc_id,
        episodes=len(episode_ids),
        entities=total_entities,
        relations=total_relations,
    )

    return IngestResponse(
        episode_ids=episode_ids,
        entities_extracted=total_entities,
        relations_extracted=total_relations,
    )
