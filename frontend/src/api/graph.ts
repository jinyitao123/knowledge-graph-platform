import { apiFetch } from './client'

interface SearchResult {
  results: Array<{
    entity: Record<string, unknown>
    relations: Array<Record<string, unknown>>
    score: number
    evidence: string
  }>
}

interface SubgraphResult {
  nodes: Array<{ uuid: string; name: string; entity_type: string }>
  edges: Array<{ uuid: string; source: string; target: string; relation_type: string; fact: string }>
}

interface GraphStats {
  entities: number
  relations: number
  episodes: number
}

export async function searchGraph(query: string, ontologyId?: string): Promise<SearchResult> {
  const params = new URLSearchParams({ q: query })
  if (ontologyId) params.set('ontology_id', ontologyId)
  return apiFetch<SearchResult>(`/graph/search?${params}`)
}

export async function fetchSubgraph(entityId: string, hops = 2): Promise<SubgraphResult> {
  return apiFetch<SubgraphResult>(`/graph/subgraph/${entityId}?hops=${hops}`)
}

export async function fetchGraphStats(): Promise<GraphStats> {
  return apiFetch<GraphStats>('/graph/stats')
}

export interface InstanceGraphData {
  nodes: Array<{ id: string; name: string; type: string }>
  edges: Array<{ source: string; target: string; relation: string; fact: string; name: string }>
}

export async function fetchInstanceGraph(limit = 200): Promise<InstanceGraphData> {
  return apiFetch<InstanceGraphData>(`/graph/instances?limit=${limit}`)
}
