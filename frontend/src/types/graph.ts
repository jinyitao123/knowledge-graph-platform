export interface GraphNode {
  id: string;
  name: string;
  type: string;
  summary: string;
  properties: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  relation_type: string;
  fact: string;
  weight: number;
  valid_from?: string;
  valid_until?: string;
  evidence?: string;
}

export interface Subgraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  center_node_id: string;
}
