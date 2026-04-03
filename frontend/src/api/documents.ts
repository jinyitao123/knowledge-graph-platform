import { apiFetch } from './client'
import type { Document } from '@/types/document'

export async function fetchDocuments(): Promise<Document[]> {
  return apiFetch<Document[]>('/documents')
}

export async function uploadDocument(file: File, ontologyId: string): Promise<{ id: string; filename: string; status: string }> {
  const form = new FormData()
  form.append('file', file)
  form.append('ontology_id', ontologyId)

  const res = await fetch('/api/v1/documents/upload', { method: 'POST', body: form })
  if (!res.ok) throw new Error('Upload failed')
  return res.json()
}

export async function fetchDocumentStatus(id: string): Promise<{ id: string; status: string; progress: number }> {
  return apiFetch(`/documents/${id}/status`)
}
