# Go Backend — API Gateway + Agent Orchestration

## Role

User-facing API gateway. Manages ontologies (PostgreSQL), orchestrates document upload flow, runs Eino-based agents for chat/QA, and proxies graph queries to the Python Graphiti service.

## Tech Stack

- Go 1.22+
- net/http (stdlib) or chi router for HTTP
- github.com/cloudwego/eino (Agent Development Kit)
- github.com/jackc/pgx/v5 (PostgreSQL driver)
- github.com/redis/go-redis/v9 (Redis client)
- github.com/minio/minio-go/v7 (MinIO client)
- github.com/rs/zerolog (structured logging)
- encoding/json (Graphiti client — plain HTTP, no SDK)

## Key Rules

1. **NEVER touch Neo4j**: All graph operations go through the Python service's REST API.
2. **Eino behind interfaces**: ALL Eino ADK usage is wrapped in `internal/agent/`. Define Go interfaces first, then implement with Eino. If Eino breaks or changes, only the implementation changes.
3. **Graphiti client is plain HTTP**: `internal/graphiti/` contains a Go HTTP client that calls the Python service. Use `net/http` + `encoding/json`. No code generation — just typed request/response structs matching the Python API.
4. **Ontology is the source of truth**: Ontologies live in PostgreSQL as JSON. Before document ingestion, sync entity types to Graphiti via the Python service.
5. **File uploads go to MinIO**: Go handles multipart upload, stores file in MinIO, then pushes a job to Redis. It does NOT parse documents.
6. **SSE for streaming**: The /chat endpoint uses Server-Sent Events to stream agent responses token by token.

## Structure

```
cmd/
└── server/
    └── main.go              ← Entry point, wire dependencies, start server

internal/
├── config/
│   └── config.go            ← Env var loading (struct + envconfig)
├── handler/
│   ├── ontology.go          ← CRUD handlers for ontology API
│   ├── document.go          ← Upload + status handlers
│   ├── chat.go              ← Chat endpoint (SSE streaming)
│   └── graph.go             ← Graph search/subgraph proxy handlers
├── agent/
│   ├── interface.go         ← Agent interface definition (CRITICAL)
│   ├── eino_agent.go        ← Eino ADK implementation
│   └── tools.go             ← Tool definitions: GraphSearchTool, DocIngestTool
├── graphiti/
│   ├── client.go            ← HTTP client for Python Graphiti service
│   └── types.go             ← Request/response types matching Python API
├── ontology/
│   ├── repository.go        ← PostgreSQL CRUD for ontology
│   ├── models.go            ← Ontology domain models
│   └── sync.go              ← Sync ontology to Graphiti EntityTypes
├── document/
│   ├── service.go           ← Upload orchestration (MinIO + Redis job)
│   └── models.go            ← Document + job status models
├── middleware/
│   ├── cors.go
│   ├── logging.go
│   └── recovery.go
└── storage/
    ├── minio.go             ← MinIO file operations
    ├── redis.go             ← Redis job queue operations
    └── postgres.go          ← PostgreSQL connection + migrations

tests/
├── handler_test.go
├── agent_test.go
└── graphiti_client_test.go
```

## Agent Interface (CRITICAL — enables Eino swap)

```go
// internal/agent/interface.go
package agent

import "context"

type ChatRequest struct {
    SessionID string
    Message   string
    OntologyID string
}

type ChatEvent struct {
    Type    string // "token", "tool_call", "tool_result", "done", "error"
    Content string
    Data    any    // structured data for tool results, evidence, etc.
}

// Agent is the core interface. Eino implements it today; can be swapped.
type Agent interface {
    Chat(ctx context.Context, req ChatRequest) (<-chan ChatEvent, error)
}
```

The handler calls `Agent.Chat()` and streams `ChatEvent` as SSE. It never imports Eino directly.

## Eino Agent Implementation

```go
// internal/agent/eino_agent.go
package agent

import (
    "github.com/cloudwego/eino/flow/agent/adk"
    "github.com/cloudwego/eino/components/tool"
    "github.com/cloudwego/eino/compose"
)

type EinoAgent struct {
    runner *adk.Runner
}

func NewEinoAgent(chatModel model.ChatModel, tools []tool.BaseTool) (*EinoAgent, error) {
    agent, err := adk.NewChatModelAgent(ctx, &adk.ChatModelAgentConfig{
        Model: chatModel,
        ToolsConfig: adk.ToolsConfig{
            ToolsNodeConfig: compose.ToolsNodeConfig{Tools: tools},
        },
    })
    runner := adk.NewRunner(ctx, adk.RunnerConfig{Agent: agent})
    return &EinoAgent{runner: runner}, nil
}

func (e *EinoAgent) Chat(ctx context.Context, req ChatRequest) (<-chan ChatEvent, error) {
    ch := make(chan ChatEvent, 64)
    go func() {
        defer close(ch)
        iter := e.runner.Query(ctx, req.Message)
        for {
            event, ok := iter.Next()
            if !ok { break }
            ch <- convertEvent(event)
        }
    }()
    return ch, nil
}
```

## Tools

```go
// GraphSearchTool: calls Python service /search
// - Input: query string, optional ontology_id
// - Action: HTTP POST to GRAPHITI_SERVICE_URL/api/v1/search
// - Output: formatted search results with entities, relations, evidence

// DocumentIngestTool: triggers document processing
// - Input: document ID
// - Action: looks up job status or triggers re-processing
// - Output: processing status
```

## SSE Streaming Pattern

```go
func (h *ChatHandler) HandleChat(w http.ResponseWriter, r *http.Request) {
    w.Header().Set("Content-Type", "text/event-stream")
    w.Header().Set("Cache-Control", "no-cache")
    w.Header().Set("Connection", "keep-alive")

    flusher, _ := w.(http.Flusher)
    events, err := h.agent.Chat(r.Context(), req)

    for event := range events {
        data, _ := json.Marshal(event)
        fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event.Type, data)
        flusher.Flush()
    }
}
```

## PostgreSQL Schema (ontology tables)

```sql
CREATE TABLE ontologies (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    description TEXT,
    schema      JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE entity_types (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ontology_id UUID REFERENCES ontologies(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    description TEXT,
    properties  JSONB DEFAULT '{}',
    UNIQUE(ontology_id, name)
);

CREATE TABLE relation_types (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ontology_id   UUID REFERENCES ontologies(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    description   TEXT,
    source_type   TEXT,
    target_type   TEXT,
    properties    JSONB DEFAULT '{}',
    UNIQUE(ontology_id, name)
);

CREATE TABLE documents (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ontology_id UUID REFERENCES ontologies(id),
    filename    TEXT NOT NULL,
    file_type   TEXT NOT NULL,
    file_path   TEXT NOT NULL,
    status      TEXT DEFAULT 'pending',
    progress    INTEGER DEFAULT 0,
    metadata    JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE chat_sessions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ontology_id UUID REFERENCES ontologies(id),
    title       TEXT,
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE chat_messages (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id  UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role        TEXT NOT NULL,
    content     TEXT NOT NULL,
    metadata    JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT now()
);
```

## Testing

- Mock the `Agent` interface for handler tests — no Eino dependency in tests
- Mock `GraphitiClient` with httptest.Server for client tests
- Table-driven tests for all handlers
- Integration tests tagged with `//go:build integration`

## Error Handling

- Wrap all errors: `fmt.Errorf("ontology.Create: %w", err)`
- Return structured JSON errors: `{"error": "message", "code": "ONTOLOGY_NOT_FOUND"}`
- Use middleware for panic recovery and request logging
