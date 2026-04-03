import { apiFetch } from './client'
import type { Ontology } from '@/types/ontology'

export async function fetchOntologies(): Promise<Ontology[]> {
  return apiFetch<Ontology[]>('/ontologies')
}

export async function createOntology(data: { name: string; description: string }): Promise<Ontology> {
  return apiFetch<Ontology>('/ontologies', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function deleteOntology(id: string): Promise<void> {
  await apiFetch(`/ontologies/${id}`, { method: 'DELETE' })
}

export async function importOntologyYAML(id: string, yamlContent: string): Promise<{ imported: boolean }> {
  const res = await fetch(`/api/v1/ontologies/${id}/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/yaml' },
    body: yamlContent,
  })
  if (!res.ok) throw new Error('Import failed')
  return res.json()
}

export async function importOntologyOWL(id: string, owlContent: string, contentType: string): Promise<{ imported: boolean }> {
  const res = await fetch(`/api/v1/ontologies/${id}/import-owl`, {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body: owlContent,
  })
  if (!res.ok) throw new Error('OWL import failed')
  return res.json()
}

export async function fetchEntityTypes(ontologyId: string): Promise<Array<{
  id: string; name: string; description: string; properties: Record<string, unknown>
}>> {
  return apiFetch(`/ontologies/${ontologyId}/entity-types`)
}

export async function fetchRelationTypes(ontologyId: string): Promise<Array<{
  id: string; name: string; description: string; source_type: string; target_type: string; properties: Record<string, unknown>
}>> {
  return apiFetch(`/ontologies/${ontologyId}/relation-types`)
}
