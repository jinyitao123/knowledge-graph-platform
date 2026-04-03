# Frontend — React + TypeScript

## Role

User interface for the Knowledge Graph Platform. Provides ontology editing, document upload, graph exploration, and natural language chat with evidence traceability.

## Tech Stack

- React 18 + TypeScript
- Vite (build tool)
- Tailwind CSS (styling — no CSS-in-JS)
- Zustand (state management)
- TanStack Query v5 (data fetching + caching)
- react-force-graph-3d (graph visualization, based on three.js)
- Biome (lint + format)
- Lucide React (icons)

## Key Rules

1. **No CSS-in-JS**: Use Tailwind utility classes only. Custom styles go in `index.css` with `@apply` if needed.
2. **TanStack Query for all API calls**: No raw `fetch` in components. Define query/mutation hooks in `src/api/`.
3. **SSE for chat**: Use EventSource API for `/api/v1/chat` streaming. Wrap in a custom hook.
4. **Graph visualization**: Use `react-force-graph-3d` for the Graph Explorer. Limit to 2-hop subgraphs to avoid perf issues. Implement click-to-expand for deeper exploration.
5. **Responsive**: Support desktop (1280px+) and tablet (768px+). Mobile is not a priority.
6. **Error boundaries**: Every page wrapped in an error boundary. Show meaningful error states.
7. **Loading states**: Skeleton loaders for lists, spinner for actions, progress bar for uploads.

## Design Language

Reference TrustGraph workbench-ui for layout patterns. Three-panel layout:

```
┌──────────────────────────────────────────────────────────┐
│  Header: Logo │ Ontology Selector │ Navigation Tabs      │
├────────────┬──────────────────────────┬──────────────────┤
│            │                          │                  │
│  Left      │  Center                 │  Right           │
│  Panel     │  Panel                  │  Panel           │
│            │                          │                  │
│  Graph     │  Chat / QA              │  Evidence        │
│  Explorer  │  or                     │  Cards           │
│  (tree/    │  Document Upload        │  + Entity        │
│   graph)   │  or                     │  Detail          │
│            │  Ontology Editor        │                  │
│            │                          │                  │
└────────────┴──────────────────────────┴──────────────────┘
```

Color palette: neutral grays + one accent color (indigo-600). Dark mode support via Tailwind `dark:` variants.

## Structure

```
src/
├── main.tsx
├── App.tsx              ← Router + layout shell
├── index.css            ← Tailwind imports + global styles
├── api/
│   ├── client.ts        ← Base fetch wrapper with error handling
│   ├── ontology.ts      ← useOntologies, useCreateOntology, etc.
│   ├── documents.ts     ← useUploadDocument, useDocumentStatus
│   ├── chat.ts          ← useChatStream (SSE hook)
│   └── graph.ts         ← useGraphSearch, useSubgraph
├── stores/
│   ├── ontologyStore.ts ← Selected ontology, entity types
│   ├── chatStore.ts     ← Chat sessions, messages
│   └── graphStore.ts    ← Selected node, exploration history
├── pages/
│   ├── OntologyEditor/
│   │   └── index.tsx    ← CRUD entity types + relation types
│   ├── DocumentUpload/
│   │   └── index.tsx    ← Drag-drop upload + processing status
│   ├── GraphExplorer/
│   │   └── index.tsx    ← 3D graph visualization + search
│   └── Chat/
│       └── index.tsx    ← Chat interface + streaming
├── components/
│   ├── Layout/
│   │   ├── Header.tsx
│   │   ├── ThreePanel.tsx
│   │   └── Sidebar.tsx
│   ├── GraphVisualization/
│   │   ├── ForceGraph.tsx    ← react-force-graph-3d wrapper
│   │   ├── NodeTooltip.tsx
│   │   └── GraphControls.tsx
│   ├── EvidenceCard/
│   │   ├── EvidenceCard.tsx  ← Source text + highlights
│   │   └── EvidencePanel.tsx ← List of evidence cards
│   ├── Chat/
│   │   ├── MessageBubble.tsx
│   │   ├── ChatInput.tsx
│   │   └── ReasoningSteps.tsx ← Shows agent tool calls
│   └── common/
│       ├── ErrorBoundary.tsx
│       ├── LoadingSpinner.tsx
│       ├── EmptyState.tsx
│       └── ConfirmDialog.tsx
└── types/
    ├── ontology.ts      ← Ontology, EntityType, RelationType
    ├── document.ts      ← Document, ProcessingStatus
    ├── chat.ts          ← ChatMessage, ChatEvent, ChatSession
    └── graph.ts         ← GraphNode, GraphEdge, Subgraph
```

## SSE Chat Hook Pattern

```typescript
// src/api/chat.ts
export function useChatStream() {
  const [events, setEvents] = useState<ChatEvent[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  const sendMessage = useCallback(async (message: string, sessionId: string) => {
    setIsStreaming(true);
    const response = await fetch('/api/v1/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, session_id: sessionId }),
    });

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value);
      // Parse SSE events from text
      parseSSEEvents(text).forEach(event => {
        setEvents(prev => [...prev, event]);
      });
    }
    setIsStreaming(false);
  }, []);

  return { events, isStreaming, sendMessage };
}
```

## Graph Visualization

```typescript
// src/components/GraphVisualization/ForceGraph.tsx
import ForceGraph3D from 'react-force-graph-3d';

// Node colors by entity type
// Edge labels from relation type
// Click node → fetch 2-hop subgraph → expand
// Right-click → show entity detail in right panel
// Hover → show tooltip with entity summary
```

## Evidence Card

```typescript
// Displays: source document name, page number, relevant text excerpt
// Highlights the entity/relation mentioned in the excerpt
// Links back to the original document
// Shows confidence score and temporal validity
```

## API Proxy

During development, Vite proxies `/api` to the Go backend:

```typescript
// vite.config.ts
export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
});
```
