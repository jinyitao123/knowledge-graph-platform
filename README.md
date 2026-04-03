# Knowledge Graph Platform

<p align="center">
  <a href="#english">English</a> · <a href="#中文">中文</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Go-1.22+-00ADD8?logo=go" />
  <img src="https://img.shields.io/badge/Python-3.11+-3776AB?logo=python" />
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react" />
  <img src="https://img.shields.io/badge/Neo4j-5.x-008CC1?logo=neo4j" />
  <img src="https://img.shields.io/badge/License-MIT-green" />
</p>

---

## English

### What Is This?

**Knowledge Graph Platform** converts unstructured documents into a queryable, temporal knowledge graph — and lets you interrogate it in natural language.

You define a domain **ontology** (what entities and relationships matter in your domain). The platform reads your documents, extracts structured knowledge guided by the ontology, stores it as a graph with full temporal and evidence tracking, and answers questions through an LLM agent with citations back to the source text.

**Built-in demo**: industrial spare-parts management — upload maintenance records, inventory ledgers, and purchase orders, then ask "Which critical parts are below safety stock?" or "What caused the B2 fan downtime last month?"

---

### Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        Browser UI (React)                    │
│   Ontology Editor │ Document Upload │ Graph Explorer │ Chat  │
└────────────┬──────────────────────────────────┬─────────────┘
             │ REST                              │ WebSocket / SSE
┌────────────▼──────────────────────────────────▼─────────────┐
│                    Go Backend (Eino Agent)                    │
│   Ontology CRUD │ Doc routing │ Agent orchestration │ Auth   │
└────────────┬──────────────────────────────────┬─────────────┘
             │ HTTP                              │ SQL / KV
┌────────────▼──────────────┐   ┌───────────────▼─────────────┐
│  Python: Graphiti Server  │   │  PostgreSQL │ Redis │ MinIO  │
│  Doc parse · Extraction   │   │  Ontology   │ Cache │ Files  │
│  Graph search · Ingestion │   └─────────────────────────────┘
└────────────┬──────────────┘
             │ Bolt
┌────────────▼──────────────┐
│          Neo4j            │
│   Temporal Knowledge Graph│
└───────────────────────────┘
```

| Service | Stack | Role |
|---------|-------|------|
| `frontend` | React 18 + TypeScript + Vite | UI: editor, upload, graph explorer, chat |
| `backend` | Go 1.22 + Eino | API gateway, agent orchestration, ontology management |
| `graphiti-server` | Python 3.11 + Graphiti + FastAPI | Document parsing, entity extraction, graph CRUD |
| Neo4j | Neo4j 5 | Temporal knowledge graph storage |
| PostgreSQL | PG 16 | Ontology persistence, metadata |
| Redis | Redis 7 | Task queue, cache |
| MinIO | MinIO | Raw document object storage |

---

### Key Features

- **Ontology-guided extraction** — define entity classes, attributes, and relationship types in YAML; the LLM extracts only what you care about
- **Temporal knowledge graph** — every fact carries a validity interval; contradictions are resolved automatically by Graphiti's bi-temporal model
- **Evidence traceability** — every graph node links back to the source sentence in the source document
- **Natural-language query** — Eino agent translates questions into Cypher + semantic search, returns answers with citations
- **Incremental ingestion** — upload new documents at any time; the graph evolves, entity resolution merges duplicates
- **Domain-agnostic** — swap the ontology YAML to apply the platform to any domain (legal, medical, supply chain, …)

---

### Quick Start

**Prerequisites**: Docker & Docker Compose, an OpenAI-compatible API key.

```bash
# 1. Clone
git clone https://github.com/jinyitao123/knowledge-graph-platform.git
cd knowledge-graph-platform

# 2. Configure
cp .env.example .env
# Edit .env — set OPENAI_API_KEY (or BASE_URL for a compatible endpoint)

# 3. Start everything
docker compose up -d

# 4. Check health
docker compose ps

# 5. (Optional) Load the demo ontology
pip install httpx
python scripts/seed-ontology.py

# 6. Open the UI
open http://localhost:5173
```

---

### Demo: Spare-Parts Management

The `demo/` directory contains a complete worked example — industrial spare-parts management for a smart factory:

```
demo/
├── ontology/
│   └── spare-parts-ontology.yaml   ← Domain ontology (v2.0, 7 classes, 15 relationships)
└── documents/
    ├── inventory-ledger.txt         ← Warehouse inventory snapshot
    ├── maintenance-records.txt      ← Fault repairs & preventive maintenance
    └── monthly-report.txt          ← Monthly management summary
```

See [demo/README.md](demo/README.md) for step-by-step instructions.

**Sample queries after loading the demo:**
- "Which spare parts are below their safety stock level?"
- "What is the repair history of the ABB ACS580 VFD?"
- "Which inventory items are flagged as stale and should be disposed?"
- "What parts does the B2 fan consume most frequently?"

---

### Project Structure

```
knowledge-graph-platform/
├── docker-compose.yml              ← Full dev environment
├── .env.example                    ← Environment variable template
├── demo/                           ← Worked example (spare-parts domain)
│   ├── ontology/
│   └── documents/
├── proto/
│   └── graphiti-service-openapi.yaml  ← Python ↔ Go API contract
├── services/
│   ├── graphiti-server/            ← Python: Graphiti + document parsing
│   │   └── src/
│   └── backend/                    ← Go: REST API + Eino agents
│       ├── cmd/server/
│       ├── internal/
│       └── migrations/
├── frontend/                       ← React 18 UI
│   └── src/
│       ├── pages/                  ← OntologyEditor, DocumentUpload, GraphExplorer, Chat
│       ├── components/
│       └── stores/
└── scripts/                        ← Dev utilities
```

---

### Development

```bash
# Infrastructure only (Neo4j, Postgres, Redis, MinIO)
docker compose up neo4j postgres redis minio minio-init -d

# Python service (hot-reload)
cd services/graphiti-server
pip install -e ".[dev]"
uvicorn src.main:app --host 0.0.0.0 --port 8100 --reload

# Go backend
cd services/backend
go run ./cmd/server

# Frontend
cd frontend
npm install && npm run dev
```

**Tests:**
```bash
cd services/graphiti-server && pytest
cd services/backend && go test ./...
./scripts/test-e2e.sh   # requires all services running
```

---

### Key Technologies

| Technology | Purpose |
|-----------|---------|
| [Graphiti](https://github.com/getzep/graphiti) | Temporal knowledge graph engine — entity resolution, bi-temporal facts, hybrid search |
| [Eino](https://github.com/cloudwego/eino) | Go LLM agent framework — tool use, multi-agent coordination, streaming |
| [Neo4j](https://neo4j.com) | Graph database |
| [FastAPI](https://fastapi.tiangolo.com) | Python async web framework |
| [Gin](https://github.com/gin-gonic/gin) | Go HTTP framework |
| [React + Vite](https://vitejs.dev) | Frontend build toolchain |

---

---

## 中文

### 这是什么？

**Knowledge Graph Platform** 将非结构化文档转化为可查询的时序知识图谱，并支持自然语言问答。

你只需定义一份**本体（Ontology）**——描述你的业务领域中有哪些实体和关系——平台会自动阅读文档、抽取结构化知识、以图谱形式存储，并通过 LLM Agent 回答问题，每个答案都附带原文溯源。

**内置演示场景**：工业备件管理——上传维修记录、库存台账、采购单，然后提问"哪些关键件低于安全库存？"或"上个月B2线风机停机的原因是什么？"

---

### 系统架构

```
┌──────────────────────────────────────────────────────────────┐
│                     前端 React UI                             │
│   本体编辑器 │ 文档上传 │ 图谱浏览器 │ 对话问答               │
└────────────┬──────────────────────────────────┬─────────────┘
             │ REST                              │ WebSocket / SSE
┌────────────▼──────────────────────────────────▼─────────────┐
│                  Go 后端（Eino Agent 编排）                   │
│   本体管理 │ 文档路由 │ Agent 编排 │ 权限中间件              │
└────────────┬──────────────────────────────────┬─────────────┘
             │ HTTP                              │ SQL / KV
┌────────────▼──────────────┐   ┌───────────────▼─────────────┐
│  Python：Graphiti 服务     │   │  PostgreSQL │ Redis │ MinIO  │
│  文档解析 · 实体抽取       │   │  本体存储   │ 缓存  │ 文件   │
│  图谱检索 · 知识写入       │   └─────────────────────────────┘
└────────────┬──────────────┘
             │ Bolt
┌────────────▼──────────────┐
│          Neo4j            │
│      时序知识图谱          │
└───────────────────────────┘
```

| 服务 | 技术栈 | 职责 |
|------|-------|------|
| `frontend` | React 18 + TypeScript + Vite | 本体编辑、文档上传、图谱浏览、对话 |
| `backend` | Go 1.22 + Eino | API 网关、Agent 编排、本体管理 |
| `graphiti-server` | Python 3.11 + Graphiti + FastAPI | 文档解析、实体抽取、图谱读写 |
| Neo4j | Neo4j 5 | 时序知识图谱存储 |
| PostgreSQL | PG 16 | 本体持久化、元数据 |
| Redis | Redis 7 | 任务队列、缓存 |
| MinIO | MinIO | 原始文档对象存储 |

---

### 核心特性

- **本体引导抽取** — 用 YAML 定义实体类、属性和关系类型，LLM 只抽取你关心的内容
- **时序知识图谱** — 每个事实携带有效时间区间，矛盾由 Graphiti 的双时态模型自动消解
- **证据可溯源** — 每个图谱节点都链回源文档的原始句子
- **自然语言问答** — Eino Agent 将问题转化为 Cypher + 语义搜索，答案附引用来源
- **增量摄入** — 随时上传新文档，图谱持续演化，实体解析自动合并重复项
- **领域无关** — 替换本体 YAML 即可应用于任何领域（法律、医疗、供应链……）

---

### 快速开始

**前置条件**：Docker & Docker Compose，OpenAI 兼容的 API Key。

```bash
# 1. 克隆仓库
git clone https://github.com/jinyitao123/knowledge-graph-platform.git
cd knowledge-graph-platform

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，填入 OPENAI_API_KEY（或兼容接口的 BASE_URL）

# 3. 一键启动
docker compose up -d

# 4. 检查服务状态
docker compose ps

# 5. （可选）加载演示本体
pip install httpx
python scripts/seed-ontology.py

# 6. 打开界面
open http://localhost:5173
```

---

### 演示：备件管理场景

`demo/` 目录包含完整的备件管理工业场景演示数据：

```
demo/
├── ontology/
│   └── spare-parts-ontology.yaml   ← 领域本体（v2.0，7个实体类，15种关系）
└── documents/
    ├── inventory-ledger.txt         ← 仓库库存台账
    ├── maintenance-records.txt      ← 故障维修与预防性维护记录
    └── monthly-report.txt          ← 月度管理报告
```

详细步骤见 [demo/README.md](demo/README.md)。

**加载演示数据后可尝试的查询：**
- "哪些备件库存低于安全库存？"
- "变频器ABB ACS580的维修历史是什么？"
- "有哪些呆滞库存需要处置？"
- "B2线风机最常消耗哪些备件？"

---

### 项目结构

```
knowledge-graph-platform/
├── docker-compose.yml              ← 完整开发环境
├── .env.example                    ← 环境变量模板
├── demo/                           ← 演示数据（备件管理领域）
│   ├── ontology/
│   └── documents/
├── proto/
│   └── graphiti-service-openapi.yaml  ← Python ↔ Go API 契约
├── services/
│   ├── graphiti-server/            ← Python：Graphiti + 文档解析
│   └── backend/                    ← Go：REST API + Eino Agent
├── frontend/                       ← React 18 前端
│   └── src/
│       ├── pages/                  ← 本体编辑器、文档上传、图谱浏览、对话
│       ├── components/
│       └── stores/
└── scripts/                        ← 开发工具脚本
```

---

### 开发指南

```bash
# 仅启动基础设施（Neo4j、Postgres、Redis、MinIO）
docker compose up neo4j postgres redis minio minio-init -d

# Python 服务（热重载）
cd services/graphiti-server
pip install -e ".[dev]"
uvicorn src.main:app --host 0.0.0.0 --port 8100 --reload

# Go 后端
cd services/backend
go run ./cmd/server

# 前端
cd frontend
npm install && npm run dev
```

**测试：**
```bash
cd services/graphiti-server && pytest
cd services/backend && go test ./...
./scripts/test-e2e.sh   # 需要所有服务运行
```

---

### 核心技术

| 技术 | 用途 |
|-----|------|
| [Graphiti](https://github.com/getzep/graphiti) | 时序知识图谱引擎——实体解析、双时态事实、混合检索 |
| [Eino](https://github.com/cloudwego/eino) | Go LLM Agent 框架——工具调用、多 Agent 协作、流式输出 |
| [Neo4j](https://neo4j.com) | 图数据库 |
| [FastAPI](https://fastapi.tiangolo.com) | Python 异步 Web 框架 |
| [Gin](https://github.com/gin-gonic/gin) | Go HTTP 框架 |
| [React + Vite](https://vitejs.dev) | 前端构建工具链 |

---

## License

MIT
