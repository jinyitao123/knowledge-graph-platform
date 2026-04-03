# Graphiti Server — Python Service

## Role

Wraps [Graphiti](https://github.com/getzep/graphiti) as a REST API. This is the ONLY service that interacts with Neo4j. The Go backend calls this service over HTTP.

## Tech Stack

- Python 3.11+, FastAPI + Uvicorn, graphiti-core, unstructured[all-docs]
- redis[hiredis], minio, pydantic v2, structlog, pytest + pytest-asyncio

## Key Rules

1. **Use Graphiti's built-in pipeline**: Entity/relation extraction MUST go through `add_episode()`. Do NOT call LLM separately for extraction.
2. **EntityType registration first**: Before ingesting for an ontology, register entity types with Graphiti's `EntityType` class.
3. **Graphiti search only**: Use `graphiti.search()` (hybrid: semantic + BM25 + graph). No custom search logic.
4. **Async everywhere**: All handlers `async def`. Use Graphiti's async API.
5. **Neo4j via Graphiti only**: Do NOT create separate Neo4j driver instances.
6. **LLM compatibility**: Uses DeepSeek (OpenAI-compatible API). Default `deepseek-chat` for extraction and embeddings. Configure via `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`, `EMBEDDING_MODEL` env vars. Graphiti's OpenAIClient/OpenAIEmbedder work with DeepSeek by setting `base_url`.

## Structure

```
src/
├── __init__.py
├── main.py             ← FastAPI app + lifespan (startup/shutdown)
├── config.py            ← Settings from env vars (pydantic BaseSettings)
├── server.py            ← Route definitions (thin — delegates to services)
├── services/
│   ├── __init__.py
│   ├── ingestion.py     ← Doc parsing + chunking + episode creation
│   ├── extraction.py    ← Entity/relation extraction orchestration
│   ├── ontology.py      ← Ontology → Graphiti EntityType mapping
│   ├── search.py        ← Wraps Graphiti search
│   └── graph.py         ← Subgraph retrieval, entity listing
├── models/
│   ├── __init__.py
│   ├── requests.py      ← Pydantic request models
│   └── responses.py     ← Pydantic response models
├── worker.py            ← Redis job consumer (async loop)
└── exceptions.py       ← Custom exception hierarchy
tests/
├── conftest.py          ← Fixtures (mock Graphiti, sample docs)
├── test_ingestion.py
├── test_search.py
├── test_ontology.py
└── fixtures/            ← Small sample PDF, DOCX, HTML, MD files
```

## Graphiti Usage Patterns

### Initialization (in main.py lifespan)
```python
from graphiti_core import Graphiti
from graphiti_core.llm_client import OpenAIClient
from graphiti_core.embedder import OpenAIEmbedder

llm_client = OpenAIClient(
    api_key=settings.LLM_API_KEY,
    model=settings.LLM_MODEL,
    base_url=settings.LLM_BASE_URL,  # https://api.deepseek.com
)
embedder = OpenAIEmbedder(
    api_key=settings.LLM_API_KEY,
    model=settings.EMBEDDING_MODEL,
    base_url=settings.LLM_BASE_URL,
)
graphiti = Graphiti(
    neo4j_uri=settings.NEO4J_URI,
    neo4j_user=settings.NEO4J_USER,
    neo4j_password=settings.NEO4J_PASSWORD,
    llm_client=llm_client,
    embedder=embedder,
)
await graphiti.build_indices_and_constraints()
```

### Registering Entity Types
```python
from graphiti_core.nodes import EntityType

entity_types = [
    EntityType(name="Person", description="A human individual"),
    EntityType(name="Company", description="A business organization"),
]
# Pass to add_episode() for ontology-grounded extraction
```

### Ingesting Episodes
```python
from graphiti_core.nodes import EpisodeType

await graphiti.add_episode(
    name=f"doc_{doc_id}_chunk_{i}",
    episode_body=chunk_text,
    source=EpisodeType.text,
    reference_time=datetime.now(),
    entity_types=registered_entity_types,
    source_description=f"Document: {doc_name}, Page: {page_num}",
)
```

### Searching
```python
results = await graphiti.search(query="Who invested in X?", num_results=10)
# Returns edges (facts) with entity refs, scores, temporal metadata
```

## Document Parsing

Use `unstructured` with these strategies:
- PDF: `partition_pdf(strategy="hi_res")`
- Word: `partition_docx()`
- HTML: `partition_html()`
- Markdown: `partition_md()`
- Plain text: `partition_text()`

Chunking: `chunk_by_title(max_characters=1500, new_after_n_chars=1000, combine_text_under_n_chars=200)`
Each chunk carries: `{ source_doc, page_number, chunk_index, section_title }`

## Redis Job Schema

Queue name: `kg:jobs:ingest`

```json
{
  "job_id": "uuid",
  "type": "document_ingest",
  "payload": {
    "doc_id": "uuid",
    "ontology_id": "uuid",
    "file_path": "documents/abc123.pdf",
    "file_type": "application/pdf",
    "metadata": { "title": "Annual Report", "author": "..." }
  },
  "created_at": "ISO-8601"
}
```

Status key: `kg:jobs:status:{job_id}` → `{ status, progress, entities_extracted, errors }`

Worker flow: pop job → download from MinIO → parse → chunk → fetch entity types → add_episode per chunk → update status.

## Error Handling

```python
class GraphitiServiceError(Exception): ...
class IngestionError(GraphitiServiceError): ...
class SearchError(GraphitiServiceError): ...
class OntologyError(GraphitiServiceError): ...
class DocumentParseError(GraphitiServiceError): ...
```

## Testing

- Unit tests mock Graphiti client — no Neo4j needed
- Integration tests (`@pytest.mark.integration`) need Neo4j
- Sample docs in `tests/fixtures/`

## Performance Notes

- `add_episode()` = 3-8 sec/chunk with DeepSeek (multiple LLM calls internally)
- Bulk ingestion: `asyncio.gather()` with semaphore (max 5 concurrent)
- Search: <500ms after warmup
