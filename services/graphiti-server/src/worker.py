"""Redis job consumer for async document processing."""

import asyncio
import io
import json
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import structlog
from minio import Minio
from redis.asyncio import Redis

from src.config import settings

logger = structlog.get_logger()

QUEUE_NAME = "kg:jobs:ingest"
STATUS_PREFIX = "kg:jobs:status:"


def get_minio_client() -> Minio:
    return Minio(
        settings.minio_endpoint,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=False,
    )


def download_file(minio_client: Minio, file_path: str) -> bytes:
    """Download file from MinIO and return bytes."""
    response = minio_client.get_object(settings.minio_bucket, file_path)
    data = response.read()
    response.close()
    response.release_conn()
    return data


def parse_document(file_data: bytes, file_type: str, filename: str) -> list[str]:
    """Parse document into text chunks.

    Supports: plain text, markdown, HTML, PDF.
    Uses pymupdf for PDF, built-in for text formats.
    """
    chunks: list[str] = []

    if file_type in ("text/plain", "text/markdown", "application/octet-stream"):
        text = file_data.decode("utf-8", errors="replace")
        chunks = chunk_text(text)

    elif file_type == "text/html":
        text = file_data.decode("utf-8", errors="replace")
        # Strip HTML tags simply
        import re
        text = re.sub(r"<[^>]+>", " ", text)
        text = re.sub(r"\s+", " ", text).strip()
        chunks = chunk_text(text)

    elif file_type == "application/pdf" or filename.endswith(".pdf"):
        try:
            import pymupdf
            doc = pymupdf.open(stream=file_data, filetype="pdf")
            pages_text = []
            for page in doc:
                pages_text.append(page.get_text())
            doc.close()
            full_text = "\n\n".join(pages_text)
            chunks = chunk_text(full_text)
        except ImportError:
            logger.warning("pymupdf not installed, treating PDF as text")
            text = file_data.decode("utf-8", errors="replace")
            chunks = chunk_text(text)

    elif file_type in (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ) or filename.endswith(".docx"):
        try:
            import zipfile
            import xml.etree.ElementTree as ET

            with zipfile.ZipFile(io.BytesIO(file_data)) as z:
                with z.open("word/document.xml") as f:
                    tree = ET.parse(f)
            ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
            paragraphs = []
            for p in tree.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p"):
                texts = [t.text for t in p.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t") if t.text]
                if texts:
                    paragraphs.append("".join(texts))
            full_text = "\n\n".join(paragraphs)
            chunks = chunk_text(full_text)
        except Exception as e:
            logger.error("docx parse failed", error=str(e))
            text = file_data.decode("utf-8", errors="replace")
            chunks = chunk_text(text)

    else:
        # Fallback: treat as text
        text = file_data.decode("utf-8", errors="replace")
        chunks = chunk_text(text)

    return chunks


def chunk_text(text: str, max_chars: int = 1500, overlap: int = 200) -> list[str]:
    """Split text into overlapping chunks by paragraph boundaries."""
    if not text.strip():
        return []

    paragraphs = text.split("\n\n")
    chunks: list[str] = []
    current = ""

    for para in paragraphs:
        para = para.strip()
        if not para:
            continue

        if len(current) + len(para) + 2 > max_chars and current:
            chunks.append(current.strip())
            # Keep overlap from end of current chunk
            current = current[-overlap:] if len(current) > overlap else current
            current += "\n\n" + para
        else:
            current = current + "\n\n" + para if current else para

    if current.strip():
        chunks.append(current.strip())

    # If no paragraph breaks, split by sentences/character limit
    if not chunks and text.strip():
        for i in range(0, len(text), max_chars - overlap):
            chunk = text[i : i + max_chars]
            if chunk.strip():
                chunks.append(chunk.strip())

    return chunks


TYPE_MAP = {
    "string": (str, ...),
    "text": (str, ...),
    "integer": (int, ...),
    "decimal": (float, ...),
    "boolean": (bool, ...),
    "date": (str, ...),
    "datetime": (str, ...),
    "enum": (str, ...),
}


async def _fetch_entity_types(ontology_id: str) -> dict[str, type] | None:
    """Fetch entity types from Go backend and build Pydantic models for Graphiti."""
    from pydantic import BaseModel, Field, create_model

    try:
        import httpx
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(f"http://backend:8080/api/v1/ontologies/{ontology_id}/entity-types")
            if resp.status_code != 200:
                return None
            data = resp.json()

        if not data:
            return None

        result: dict[str, type] = {}
        for et in data:
            name = et.get("name", "")
            props = et.get("properties", {})
            class_id = props.get("yaml_class_id", "") or name
            attrs = props.get("attributes", [])
            desc = et.get("description", "")

            # Use English class_id as key (Neo4j label must be alphanumeric)
            # Fall back to name if class_id not available, but sanitize it
            label = class_id if class_id.isascii() and class_id.isidentifier() else name.replace(" ", "_")

            # Build Pydantic model fields from attributes
            fields: dict = {}
            for attr in attrs:
                attr_id = attr.get("id") or attr.get("ID") or ""
                attr_name = attr.get("Name") or attr.get("name") or attr_id
                attr_type = attr.get("Type") or attr.get("type", "string")
                # Use attr_id as field name (must be valid Python identifier)
                field_key = attr_id if attr_id and attr_id.isidentifier() else attr_name.replace(" ", "_")
                # Skip protected/reserved attribute names used by Graphiti internally
                if field_key and field_key not in ("name", "uuid", "labels", "created_at", "updated_at", "group_id", "summary"):
                    py_type = TYPE_MAP.get(attr_type, (str, ...))[0]
                    fields[field_key] = (py_type | None, Field(default=None, description=attr_name))

            if not fields:
                fields["description"] = (str | None, Field(default=None))

            # Model name AND dict key must be valid Neo4j label (alphanumeric)
            # Graphiti uses the dict key as Neo4j node label
            model = create_model(label, **fields)
            result[label] = model
            logger.debug("entity type model", label=label, name=name, fields=len(fields))

        return result if result else None

    except Exception as e:
        logger.warning("failed to fetch entity types", error=str(e))
        return None


async def update_status(redis: Redis, job_id: str, status: str, progress: int = 0, extra: dict | None = None) -> None:
    """Update job status in Redis and PostgreSQL (via Go backend)."""
    data = {"status": status, "progress": progress}
    if extra:
        data.update(extra)
    await redis.set(f"{STATUS_PREFIX}{job_id}", json.dumps(data), ex=86400)

    # Also update PostgreSQL via Go backend
    try:
        import httpx
        async with httpx.AsyncClient(timeout=5) as client:
            await client.put(
                f"http://backend:8080/api/v1/documents/{job_id}/status",
                json={"status": status, "progress": progress},
            )
    except Exception as e:
        logger.warning("failed to update PG status", error=str(e))


async def process_job(job_data: dict, redis: Redis) -> None:
    """Process a single ingestion job: download → parse → chunk → ingest."""
    from src.main import graphiti_client
    from graphiti_core.nodes import EpisodeType

    job_id = job_data.get("job_id", "unknown")
    payload = job_data.get("payload", {})
    doc_id = payload.get("doc_id", "")
    ontology_id = payload.get("ontology_id", "")
    file_path = payload.get("file_path", "")
    file_type = payload.get("file_type", "")

    logger.info("processing job", job_id=job_id, doc_id=doc_id, file_path=file_path)
    await update_status(redis, job_id, "processing", 5)

    # 1. Download from MinIO
    try:
        minio_client = get_minio_client()
        file_data = download_file(minio_client, file_path)
        logger.info("file downloaded", size=len(file_data))
        await update_status(redis, job_id, "processing", 15)
    except Exception as e:
        logger.error("minio download failed", error=str(e))
        await update_status(redis, job_id, "failed", 0, {"error": str(e)})
        return

    # 2. Parse document
    try:
        filename = file_path.rsplit("/", 1)[-1] if "/" in file_path else file_path
        chunks = parse_document(file_data, file_type, filename)
        logger.info("document parsed", chunks=len(chunks))
        await update_status(redis, job_id, "processing", 30)
    except Exception as e:
        logger.error("document parse failed", error=str(e))
        await update_status(redis, job_id, "failed", 0, {"error": str(e)})
        return

    if not chunks:
        logger.warning("no chunks extracted")
        await update_status(redis, job_id, "completed", 100, {"entities_extracted": 0, "relations_extracted": 0})
        return

    # 3. Fetch ontology entity types for guided extraction
    entity_types_map = None
    if ontology_id:
        entity_types_map = await _fetch_entity_types(ontology_id)
        if entity_types_map:
            logger.info("loaded entity types for extraction", count=len(entity_types_map), ontology_id=ontology_id)

    # 4. Ingest chunks via Graphiti
    if not graphiti_client:
        logger.error("graphiti client not initialized")
        await update_status(redis, job_id, "failed", 0, {"error": "graphiti not initialized"})
        return

    total_entities = 0
    total_relations = 0
    failed_chunks = 0
    sem = asyncio.Semaphore(3)  # Max 3 concurrent add_episode calls

    async def ingest_chunk(i: int, chunk: str) -> None:
        nonlocal total_entities, total_relations, failed_chunks
        async with sem:
            try:
                result = await graphiti_client.add_episode(
                    name=f"doc_{doc_id}_chunk_{i}",
                    episode_body=chunk,
                    source=EpisodeType.text,
                    reference_time=datetime.now(timezone.utc),
                    source_description=f"Document: {filename}, Chunk: {i + 1}/{len(chunks)}",
                    group_id=ontology_id if ontology_id else None,
                    entity_types=entity_types_map,
                )
                total_entities += len(result.nodes)
                total_relations += len(result.edges)
                progress = 30 + int(70 * (i + 1) / len(chunks))
                await update_status(redis, job_id, "processing", progress)
            except Exception as e:
                logger.error("chunk ingestion failed", chunk_index=i, error=str(e))
                failed_chunks += 1

    tasks = [ingest_chunk(i, chunk) for i, chunk in enumerate(chunks)]
    await asyncio.gather(*tasks)

    if failed_chunks == len(chunks):
        final_status = "failed"
    elif failed_chunks > 0:
        final_status = "partial"
    else:
        final_status = "completed"

    await update_status(redis, job_id, final_status, 100, {
        "entities_extracted": total_entities,
        "relations_extracted": total_relations,
        "failed_chunks": failed_chunks,
    })

    logger.info(
        "job completed",
        job_id=job_id,
        chunks=len(chunks),
        entities=total_entities,
        relations=total_relations,
    )


async def init_graphiti():
    """Initialize Graphiti client for the worker process."""
    from graphiti_core import Graphiti
    from graphiti_core.llm_client.openai_generic_client import OpenAIGenericClient
    from graphiti_core.llm_client.config import LLMConfig
    from graphiti_core.embedder import OpenAIEmbedder, OpenAIEmbedderConfig
    from graphiti_core.cross_encoder.openai_reranker_client import OpenAIRerankerClient

    llm_config = LLMConfig(
        api_key=settings.llm_api_key,
        model=settings.llm_model,
        base_url=settings.llm_base_url,
    )
    client = Graphiti(
        uri=settings.neo4j_uri,
        user=settings.neo4j_user,
        password=settings.neo4j_password,
        llm_client=OpenAIGenericClient(config=llm_config),
        embedder=OpenAIEmbedder(config=OpenAIEmbedderConfig(
            api_key=settings.llm_api_key or "ollama",
            embedding_model=settings.embedding_model,
            base_url=settings.embedding_base_url,
        )),
        cross_encoder=OpenAIRerankerClient(config=llm_config),
    )
    logger.info("worker graphiti initialized")
    return client


async def run_worker() -> None:
    """Main worker loop — polls Redis for ingestion jobs."""
    # Initialize Graphiti for this worker process
    import src.main as main_module
    try:
        main_module.graphiti_client = await init_graphiti()
    except Exception:
        logger.exception("failed to init graphiti in worker")
        return

    redis = Redis.from_url(settings.redis_url, decode_responses=True)
    logger.info("worker started", queue=QUEUE_NAME)

    try:
        while True:
            result = await redis.blpop(QUEUE_NAME, timeout=5)
            if result is None:
                continue

            _, raw = result
            try:
                job_data = json.loads(raw)
                await process_job(job_data, redis)
            except json.JSONDecodeError:
                logger.error("invalid job payload", raw=raw)
            except Exception:
                logger.exception("job processing failed")
    finally:
        await redis.close()


if __name__ == "__main__":
    asyncio.run(run_worker())
