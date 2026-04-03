# Knowledge Graph Platform

## Project Overview

A document-to-knowledge-graph platform that lets users define ontologies, upload documents, automatically extract structured knowledge, and query the resulting graph through natural language chat with full evidence traceability.

## Architecture

```
┌─────────────────────────────────────────────┐
│              Frontend (React/TS)             │
│  Ontology Editor │ Doc Upload │ Chat/QA     │
│  Graph Explorer  │ Evidence Cards            │
└──────────────────┬──────────────────────────┘
                   │ REST / SSE
┌──────────────────▼──────────────────────────┐
│         Go Backend (Eino ADK)               │
│  • API Gateway          • Agent Orchestration│
│  • Ontology CRUD        • Job Dispatch       │
│  • Auth (future)        • SSE Streaming      │
└──┬───────────────┬──────────────────────────┘
   │               │ REST (→ gRPC Phase 5)
   │  ┌────────────▼─────────────────────┐
   │  │  Python Service (Graphiti)       │
   │  │  • Document parsing (unstructured)│
   │  │  • Chunking strategies           │
   │  │  • Entity/Relation extraction    │
   │  │  • Ontology grounding            │
   │  │  • Temporal fact management      │
   │  │  • Hybrid search                 │
   │  └────────────┬─────────────────────┘
   │               │
   │  ┌────────────▼─────────────────────┐
   │  │  Neo4j 5.x + Embedding Store     │
   │  └──────────────────────────────────┘
   │
   ├──► PostgreSQL (ontology, users, jobs)
   ├──► Redis (task queue)
   ├──► MinIO (file storage)
   └──► LLM API (DeepSeek / OpenAI-compatible)
```

This is a **monorepo with 3 services**:

- **graphiti-server** (Python 3.11+): Wraps [Graphiti](https://github.com/getzep/graphiti) as a REST service. Handles document parsing, chunking, entity/relation extraction, ontology grounding, and graph search.
- **backend** (Go 1.22+): API gateway + [Eino](https://github.com/cloudwego/eino)-based agent orchestration. Handles user-facing API, ontology management, job scheduling, and LLM-powered QA.
- **frontend** (React 18 + TypeScript + Vite): UI for ontology editing, document upload, graph exploration, and chat. Design references [TrustGraph workbench-ui](https://github.com/trustgraph-ai/workbench-ui).

## Key Design Decisions

1. **Python ↔ Go communication**: REST (FastAPI) with OpenAPI spec as contract. gRPC planned for Phase 5+.
2. **Graphiti owns the graph**: Go backend NEVER touches Neo4j directly. All graph reads/writes go through Python service.
3. **Document parsing in Python only**: PDF, Word, HTML, Markdown parsing uses `unstructured` library. Go only handles file upload and job dispatch.
4. **Eino abstraction layer**: Eino ADK is Alpha — ALL Eino calls wrapped behind Go interfaces in `internal/agent/`. Business logic depends on the interface, not Eino types. Enables framework swap if needed.
5. **Ontology storage**: Definitions stored as JSON in PostgreSQL. Synced to Graphiti as `EntityType` on ingestion.
6. **Async document processing**: Upload → Go saves to MinIO → Redis job → Python consumes → parse, chunk, extract, write to Graphiti.
7. **Search strategy**: All searches use Graphiti hybrid search (semantic + BM25 + graph traversal). Go does NOT implement its own search.

## Infrastructure

| Component       | Purpose                              | Port      |
|-----------------|--------------------------------------|-----------|
| Neo4j 5.x       | Graphiti graph store                 | 7474/7687 |
| PostgreSQL 16    | Ontology metadata, users, job state  | 5432      |
| Redis 7          | Task queue (Go → Python)             | 6379      |
| MinIO            | Uploaded document storage            | 9000/9001 |
| graphiti-server  | Python service                       | 8100      |
| backend          | Go API gateway                       | 8080      |
| frontend         | React dev server                     | 5173      |

## API Contract — Python Service (Internal Only)

```
POST /api/v1/ingest
  Body: { doc_id, ontology_id, chunks: [{text, metadata}] }
  Response: { episode_ids, entities_extracted, relations_extracted }

POST /api/v1/search
  Body: { query, ontology_id?, filters?, top_k? }
  Response: { results: [{ entity, relations, score, evidence }] }

POST /api/v1/entity-types
  Body: { ontology_id, types: [{name, description, properties}] }
  Response: { registered }

GET  /api/v1/entities?ontology_id=X&page=N&size=M
GET  /api/v1/subgraph?entity_id=X&hops=2
DELETE /api/v1/ontology/{ontology_id}
GET  /health
```

## API Contract — Go Backend (User-Facing)

```
# Ontology
POST   /api/v1/ontologies
GET    /api/v1/ontologies
GET    /api/v1/ontologies/:id
PUT    /api/v1/ontologies/:id
DELETE /api/v1/ontologies/:id
POST   /api/v1/ontologies/:id/import
POST   /api/v1/ontologies/:id/entity-types
POST   /api/v1/ontologies/:id/relation-types

# Documents
POST   /api/v1/documents/upload
GET    /api/v1/documents
GET    /api/v1/documents/:id/status

# Chat
POST   /api/v1/chat                (SSE streaming)
GET    /api/v1/chat/sessions
GET    /api/v1/chat/sessions/:id/messages

# Graph
GET    /api/v1/graph/search?q=X&ontology_id=Y
GET    /api/v1/graph/subgraph/:entity_id
GET    /api/v1/graph/entity/:id
GET    /api/v1/graph/stats
```

## Coding Standards

- **Python**: ruff + mypy, async everywhere, pytest, structlog
- **Go**: golangci-lint, table-driven tests, zerolog, `internal/` packages
- **Frontend**: Biome, Tailwind CSS, Zustand, TanStack Query
- **All**: `/health` endpoint, structured JSON logging, graceful shutdown, >70% test coverage
- **Errors**: never swallow. Python custom exceptions, Go wrapped errors `fmt.Errorf("ctx: %w", err)`
- **Commits**: conventional format (`feat:`, `fix:`, `chore:`, `docs:`)

## Environment Variables

```env
LLM_API_KEY=sk-...
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-chat
EMBEDDING_MODEL=deepseek-chat
NEO4J_URI=bolt://neo4j:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=graphiti_dev
POSTGRES_URL=postgresql://postgres:postgres@postgres:5432/kgplatform
REDIS_URL=redis://redis:6379/0
MINIO_ENDPOINT=minio:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=documents
GRAPHITI_SERVICE_URL=http://graphiti-server:8100
BACKEND_URL=http://backend:8080
```

## Development Phases

### Phase 0 — Infrastructure ✅

- [x] docker-compose.yml with all deps
- [x] Minimal Python FastAPI ↔ Neo4j
- [x] Minimal Go HTTP ↔ PostgreSQL
- [x] Cross-service call verification

### Phase 1 — Graphiti Service Core ✅

- [x] Graphiti add_episode() with plain text
- [x] /ingest and /search endpoints
- [x] Document parsing (PDF, Word, HTML, MD)
- [x] Ontology EntityType registration
- [x] Redis job consumer
- [x] Unit tests

### Phase 2 — Go Backend ✅

- [x] Ontology CRUD (PostgreSQL)
- [x] Graphiti Go HTTP client
- [x] Eino Agent + Tools (GraphSearch, DocIngest)
- [x] /chat SSE streaming
- [x] Upload → MinIO → Redis → Python flow
- [x] Unit tests

### Phase 3 — Frontend ✅

- [x] 3-panel layout (graph | chat | evidence)
- [x] Ontology Editor
- [x] Document Upload + progress
- [x] Graph Explorer (SVG force-directed, zoom/pan/drag)
- [x] Chat with SSE streaming + graph highlight animation
- [x] Evidence Cards (EvidencePanel)
- [x] OntologySchemaGraph (left panel, interactive SVG)
- [x] InferenceGraph (right panel, highlights chat search results)

### Phase 4 — E2E Integration 🔲

- [x] Error/loading/empty states on all pages
- [ ] Full pipeline E2E test (requires Docker)
- [ ] E2E test script

### Phase 5+ — Future 🔲

- [ ] REST → gRPC, Auth, Multi-tenant, Batch processing, Export (RDF/JSON-LD)
