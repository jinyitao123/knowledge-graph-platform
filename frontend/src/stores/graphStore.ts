import { create } from 'zustand'

export interface InferenceNode {
  id: string
  name: string
  type: string
}

export interface InferenceEdge {
  source: string
  target: string
  name: string
  fact: string
}

export interface InferenceResult {
  nodes: InferenceNode[]
  edges: InferenceEdge[]
}

interface GraphStore {
  selectedNodeId: string | null
  searchQuery: string
  setSelectedNodeId: (id: string | null) => void
  setSearchQuery: (q: string) => void

  // Inference path highlighting
  inferenceResult: InferenceResult | null
  highlightedNodeIds: Set<string>
  highlightedEdgeKeys: Set<string>
  breathingNodeId: string | null
  isInferring: boolean

  setInferenceResult: (result: InferenceResult | null) => void
  startInference: () => void
  stopInference: () => void
  highlightPath: (nodeIds: string[], edgeKeys: string[]) => void
  setBreathingNode: (id: string | null) => void
  clearHighlights: () => void
}

export const useGraphStore = create<GraphStore>((set) => ({
  selectedNodeId: null,
  searchQuery: '',
  setSelectedNodeId: (id) => set({ selectedNodeId: id }),
  setSearchQuery: (q) => set({ searchQuery: q }),

  inferenceResult: null,
  highlightedNodeIds: new Set(),
  highlightedEdgeKeys: new Set(),
  breathingNodeId: null,
  isInferring: false,

  setInferenceResult: (result) => set({ inferenceResult: result }),
  startInference: () => set({ isInferring: true, highlightedNodeIds: new Set(), highlightedEdgeKeys: new Set() }),
  stopInference: () => set({ isInferring: false, breathingNodeId: null }),
  highlightPath: (nodeIds, edgeKeys) => set({
    highlightedNodeIds: new Set(nodeIds),
    highlightedEdgeKeys: new Set(edgeKeys),
  }),
  setBreathingNode: (id) => set({ breathingNodeId: id }),
  clearHighlights: () => set({
    highlightedNodeIds: new Set(),
    highlightedEdgeKeys: new Set(),
    breathingNodeId: null,
    inferenceResult: null,
  }),
}))
