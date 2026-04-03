# Claude Code Session Guide

How to work with Claude Code on this project, phase by phase.

## Before Every Session

```bash
# Let Claude Code orient itself
claude "Read CLAUDE.md and all service-level CLAUDE.md files.
Tell me the current project status and what needs to be done next."
```

## Phase 0 — Infrastructure

### Session 0.1: Docker + Service Scaffolding
```bash
claude "Phase 0: Set up the development environment.
1. Verify docker-compose.yml works: docker compose up -d
2. Implement minimal FastAPI app in graphiti-server that:
   - Connects to Neo4j on startup using Graphiti
   - Exposes GET /health returning neo4j connection status
3. Implement minimal Go HTTP server in backend that:
   - Connects to PostgreSQL on startup
   - Runs the SQL migration from migrations/001_initial.sql
   - Exposes GET /health returning db connection status
4. Test: backend can HTTP GET graphiti-server's /health
Write working code, not stubs."
```

## Phase 1 — Graphiti Service

### Session 1.1: Core Ingestion
```bash
claude "Phase 1 Session 1: Graphiti ingestion pipeline.
Read services/graphiti-server/CLAUDE.md first.
1. Implement config.py with pydantic BaseSettings
2. Implement main.py with FastAPI lifespan that initializes Graphiti
3. Write a standalone test script that:
   - Calls graphiti.add_episode() with sample text
   - Calls graphiti.search() and prints results
4. Verify it works against the running Neo4j.
Use the Graphiti usage patterns from CLAUDE.md."
```

### Session 1.2: REST Endpoints
```bash
claude "Phase 1 Session 2: REST API for graphiti-server.
1. Implement request/response Pydantic models in src/models/
2. Implement POST /api/v1/ingest — accepts chunks, calls add_episode per chunk
3. Implement POST /api/v1/search — wraps graphiti.search()
4. Implement POST /api/v1/entity-types — registers EntityTypes
5. Add error handling with custom exceptions
6. Write unit tests (mock Graphiti client)
Match the OpenAPI spec in proto/graphiti-service-openapi.yaml."
```

### Session 1.3: Document Parsing + Worker
```bash
claude "Phase 1 Session 3: Document parsing and async worker.
1. Implement ingestion.py: parse_document() using unstructured for PDF/Word/HTML/MD
2. Implement chunking with chunk_by_title strategy
3. Implement worker.py: Redis consumer that pops jobs, downloads from MinIO,
   parses, chunks, and calls add_episode per chunk
4. Add progress tracking: update Redis status key after each chunk
5. Write tests with sample fixture files."
```

## Phase 2 — Go Backend

### Session 2.1: Ontology CRUD + Graphiti Client
```bash
claude "Phase 2 Session 1: Go backend foundation.
Read services/backend/CLAUDE.md first.
1. Implement config loading from env vars
2. Implement PostgreSQL connection + migration runner
3. Implement ontology repository (CRUD in PostgreSQL)
4. Implement Graphiti HTTP client (Go client for Python service)
5. Implement ontology handlers: POST/GET/PUT/DELETE /api/v1/ontologies
6. Wire everything in main.go with graceful shutdown
7. Write table-driven tests for handlers and repository."
```

### Session 2.2: Eino Agent + Chat
```bash
claude "Phase 2 Session 2: Eino agent integration.
1. Implement GraphSearchTool: calls Graphiti service /search
2. Implement EinoAgent that satisfies the Agent interface
3. Implement POST /api/v1/chat with SSE streaming
4. Implement chat session/message persistence in PostgreSQL
5. Test: send a chat message, agent calls GraphSearchTool, returns answer
Important: keep ALL Eino usage behind the Agent interface."
```

### Session 2.3: Document Upload Flow
```bash
claude "Phase 2 Session 3: Document upload pipeline.
1. Implement MinIO file upload in storage/minio.go
2. Implement Redis job push in storage/redis.go
3. Implement POST /api/v1/documents/upload:
   - Accept multipart file + ontology_id
   - Save to MinIO, create DB record, push Redis job
4. Implement GET /api/v1/documents/:id/status:
   - Read status from Redis (set by Python worker)
5. Implement graph proxy handlers (/graph/search, /graph/subgraph)
6. Sync ontology entity types to Graphiti before first ingestion."
```

## Phase 3 — Frontend

### Session 3.1: Layout + Ontology Editor
```bash
claude "Phase 3 Session 1: Frontend foundation.
Read frontend/CLAUDE.md first.
1. Set up Vite + React + TypeScript + Tailwind + TanStack Query
2. Implement 3-panel layout (Header + left/center/right panels)
3. Implement Ontology Editor page:
   - List ontologies, create new, edit, delete
   - Add/remove entity types and relation types
4. Set up Vite proxy to Go backend on port 8080
5. Use Zustand for selected ontology state."
```

### Session 3.2: Document Upload + Graph Explorer
```bash
claude "Phase 3 Session 2: Upload and visualization.
1. Document Upload page:
   - Drag-drop zone (react-dropzone)
   - Ontology selector dropdown
   - Upload progress bar
   - Processing status polling with TanStack Query
2. Graph Explorer page:
   - Search bar for entities
   - react-force-graph-3d visualization
   - Click node to expand 2-hop subgraph
   - Node coloring by entity type
   - Edge labels from relation type"
```

### Session 3.3: Chat + Evidence
```bash
claude "Phase 3 Session 3: Chat interface and evidence display.
1. Chat page:
   - Message input with send button
   - SSE streaming display (token by token)
   - Show reasoning steps (tool calls made by agent)
   - Session list in sidebar
2. Evidence Cards:
   - Source document name + page number
   - Highlighted text excerpt
   - Confidence score + temporal validity
   - Click to view in context
3. Wire chat evidence to graph explorer (click entity → show in graph)"
```

## Phase 4 — Integration

### Session 4.1: End-to-End
```bash
claude "Phase 4: End-to-end integration.
1. Test full pipeline manually: create ontology → upload doc → wait → chat → explore
2. Fix all integration issues (type mismatches, error handling, missing states)
3. Add loading/error/empty states to every UI page
4. Run scripts/test-e2e.sh and fix any failures
5. Update all CLAUDE.md Progress sections to reflect current state"
```

## Tips

- After each session, ask Claude to update the Progress checkboxes in CLAUDE.md
- If Eino breaks, ask Claude to check github.com/cloudwego/eino issues
- For Graphiti issues, check github.com/getzep/graphiti discussions
- Keep sessions focused: one service per session, max 2-3 features
