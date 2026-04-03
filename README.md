# Knowledge Graph Platform

A document-to-knowledge-graph platform powered by **Graphiti** (temporal knowledge graphs) and **Eino** (Go agent framework).

Upload documents, define domain ontologies, automatically extract structured knowledge, and query the graph through natural language — with full evidence traceability.

## Quick Start

```bash
# 1. Clone and configure
cp .env.example .env
# Edit .env with your OPENAI_API_KEY

# 2. Start infrastructure + services
docker compose up -d

# 3. Wait for services to be healthy
docker compose ps

# 4. Seed sample ontology (optional)
pip install httpx
python scripts/seed-ontology.py

# 5. Open the UI
open http://localhost:5173
```

## Architecture

| Service | Language | Purpose |
|---------|----------|---------|
| `graphiti-server` | Python | Graphiti wrapper: doc parsing, extraction, graph search |
| `backend` | Go | API gateway, Eino agent orchestration, ontology management |
| `frontend` | React/TS | UI: ontology editor, doc upload, graph explorer, chat |

See `CLAUDE.md` for detailed architecture, API contracts, and coding standards.

## Development

### Prerequisites
- Docker & Docker Compose
- Go 1.22+ (for backend development)
- Python 3.11+ (for graphiti-server development)
- Node.js 20+ (for frontend development)
- OpenAI API key

### Running services individually

```bash
# Infrastructure only
docker compose up neo4j postgres redis minio minio-init -d

# Python service (local)
cd services/graphiti-server
pip install -e ".[dev]"
uvicorn src.main:app --host 0.0.0.0 --port 8100 --reload

# Go backend (local)
cd services/backend
go run ./cmd/server

# Frontend (local)
cd frontend
npm install
npm run dev
```

### Running tests

```bash
# Python
cd services/graphiti-server && pytest

# Go
cd services/backend && go test ./...

# E2E (requires all services running)
./scripts/test-e2e.sh
```

## Project Structure

```
├── CLAUDE.md                          ← Master project spec (for Claude Code)
├── docker-compose.yml                 ← Full dev environment
├── .env.example                       ← Environment variables template
├── proto/
│   └── graphiti-service-openapi.yaml  ← Python ↔ Go API contract
├── services/
│   ├── graphiti-server/               ← Python: Graphiti + doc parsing
│   │   ├── CLAUDE.md                  ← Service-specific spec
│   │   └── src/...
│   └── backend/                       ← Go: API + Eino agents
│       ├── CLAUDE.md                  ← Service-specific spec
│       ├── migrations/                ← SQL schema
│       └── internal/...
├── frontend/                          ← React UI
│   ├── CLAUDE.md                      ← Frontend-specific spec
│   └── src/...
└── scripts/                           ← Dev/test utilities
```

## Key Technologies

- **[Graphiti](https://github.com/getzep/graphiti)** — Temporal knowledge graph engine with entity resolution, bi-temporal fact management, and hybrid search
- **[Eino](https://github.com/cloudwego/eino)** — Go-based LLM agent framework with ADK for tool use, multi-agent coordination, and human-in-the-loop
- **[TrustGraph workbench-ui](https://github.com/trustgraph-ai/workbench-ui)** — UI design reference for graph exploration and evidence display

## License

MIT
