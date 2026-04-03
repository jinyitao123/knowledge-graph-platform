import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Settings, Upload, FileCode2 } from 'lucide-react'
import { fetchOntologies, createOntology, deleteOntology, importOntologyYAML, importOntologyOWL } from '@/api/ontology'
import { useOntologyStore } from '@/stores/ontologyStore'
import OntologySchemaGraph from '@/components/GraphVisualization/OntologySchemaGraph'
import InferenceGraph from '@/components/GraphVisualization/InferenceGraph'

function InstanceGraphView() {
  return <InferenceGraph />
}
import EmptyState from '@/components/common/EmptyState'
import LoadingSpinner from '@/components/common/LoadingSpinner'
import type { Ontology } from '@/types/ontology'

function CreateOntologyForm({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => createOntology({ name, description }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ontologies'] })
      onClose()
    },
  })

  return (
    <div className="kg-card animate-fade-in" style={{ marginBottom: 'var(--sp-lg)' }}>
      <div className="kg-card__title" style={{ marginBottom: 'var(--sp-md)' }}>New Ontology</div>
      <input className="kg-input" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} style={{ marginBottom: 'var(--sp-sm)' }} />
      <textarea className="kg-input kg-textarea" rows={2} placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} style={{ marginBottom: 'var(--sp-md)' }} />
      <div style={{ display: 'flex', gap: 'var(--sp-sm)' }}>
        <button className="kg-btn kg-btn--primary" disabled={!name.trim() || mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? 'Creating...' : 'Create'}
        </button>
        <button className="kg-btn kg-btn--ghost" onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}

function ImportArea({ ontologyId }: { ontologyId: string }) {
  const [fileContent, setFileContent] = useState('')
  const [fileName, setFileName] = useState('')
  const [fileFormat, setFileFormat] = useState<'yaml' | 'owl'>('yaml')
  const [importing, setImporting] = useState(false)
  const queryClient = useQueryClient()

  const detectFormat = (name: string): 'yaml' | 'owl' => {
    const ext = name.split('.').pop()?.toLowerCase() || ''
    if (['owl', 'rdf', 'xml', 'ttl', 'turtle', 'jsonld'].includes(ext)) return 'owl'
    return 'yaml'
  }

  const getContentType = (name: string): string => {
    const ext = name.split('.').pop()?.toLowerCase() || ''
    switch (ext) {
      case 'ttl': case 'turtle': return 'text/turtle'
      case 'jsonld': return 'application/ld+json'
      case 'owl': case 'rdf': case 'xml': return 'application/rdf+xml'
      default: return 'application/rdf+xml'
    }
  }

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setFileFormat(detectFormat(file.name))
    const reader = new FileReader()
    reader.onload = (ev) => setFileContent(ev.target?.result as string)
    reader.readAsText(file)
  }, [])

  const handleImport = async () => {
    if (!fileContent.trim()) return
    setImporting(true)
    try {
      if (fileFormat === 'owl') {
        await importOntologyOWL(ontologyId, fileContent, getContentType(fileName))
      } else {
        await importOntologyYAML(ontologyId, fileContent)
      }
      queryClient.invalidateQueries({ queryKey: ['entity-types', ontologyId] })
      queryClient.invalidateQueries({ queryKey: ['relation-types', ontologyId] })
      queryClient.invalidateQueries({ queryKey: ['ontologies'] })
      setFileContent('')
      setFileName('')
    } catch {
      alert('Import failed')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="kg-card" style={{ marginBottom: 'var(--sp-lg)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', marginBottom: 'var(--sp-md)' }}>
        <FileCode2 size={16} style={{ color: 'var(--terracotta)' }} />
        <span className="kg-card__title">Import Ontology</span>
        <span className="kg-badge kg-badge--default" style={{ marginLeft: 4 }}>YAML · OWL · RDF · Turtle</span>
      </div>
      <div style={{ display: 'flex', gap: 'var(--sp-sm)', marginBottom: 'var(--sp-sm)' }}>
        <input type="file" accept=".yaml,.yml,.owl,.rdf,.xml,.ttl,.turtle,.jsonld" onChange={handleFileUpload} style={{ fontSize: 13 }} />
      </div>
      {fileContent && (
        <>
          {fileName && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 'var(--sp-sm)' }}>
              {fileName} — detected as <span className="kg-badge kg-badge--processing">{fileFormat.toUpperCase()}</span>
            </div>
          )}
          <textarea
            className="kg-input kg-textarea"
            rows={6}
            value={fileContent}
            onChange={(e) => setFileContent(e.target.value)}
            style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 12, marginBottom: 'var(--sp-md)' }}
          />
          <button className="kg-btn kg-btn--primary" onClick={handleImport} disabled={importing}>
            <Upload size={14} /> {importing ? 'Importing...' : `Import ${fileFormat.toUpperCase()}`}
          </button>
        </>
      )}
    </div>
  )
}

function OntologyDetail({ ontologyId }: { ontologyId: string }) {
  const [showImport, setShowImport] = useState(false)
  const [activeView, setActiveView] = useState<'schema' | 'instances'>('schema')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: 'var(--sp-sm) var(--sp-lg)', borderBottom: '0.5px solid var(--border)',
      }}>
        <div style={{ display: 'flex', gap: 2 }}>
          <button
            className={`kg-header__tab ${activeView === 'schema' ? 'kg-header__tab--active' : ''}`}
            onClick={() => setActiveView('schema')}
            style={{ fontSize: 12, padding: '4px 12px' }}
          >
            Schema
          </button>
          <button
            className={`kg-header__tab ${activeView === 'instances' ? 'kg-header__tab--active' : ''}`}
            onClick={() => setActiveView('instances')}
            style={{ fontSize: 12, padding: '4px 12px' }}
          >
            Instances
          </button>
        </div>
        <div style={{ display: 'flex', gap: 'var(--sp-sm)' }}>
          <button
            className={`kg-btn ${showImport ? 'kg-btn--primary' : ''}`}
            onClick={() => setShowImport(!showImport)}
            style={{ fontSize: 12 }}
          >
            <Upload size={13} /> Import
          </button>
        </div>
      </div>

      {/* Import panel (collapsible) */}
      {showImport && (
        <div style={{ padding: 'var(--sp-md) var(--sp-lg)', borderBottom: '0.5px solid var(--border)' }}>
          <ImportArea ontologyId={ontologyId} />
        </div>
      )}

      {/* Graph — takes remaining space */}
      <div style={{ flex: 1, minHeight: 0 }}>
        {activeView === 'schema' ? (
          <OntologySchemaGraph ontologyId={ontologyId} />
        ) : (
          <InstanceGraphView />
        )}
      </div>
    </div>
  )
}

function OntologyCard({ ontology, isSelected, onSelect }: { ontology: Ontology; isSelected: boolean; onSelect: () => void }) {
  const queryClient = useQueryClient()
  const deleteMut = useMutation({
    mutationFn: () => deleteOntology(ontology.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ontologies'] }),
  })

  return (
    <div
      className={`kg-card ${isSelected ? 'kg-card--active' : ''}`}
      style={{ cursor: 'pointer' }}
      onClick={onSelect}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="kg-card__title">{ontology.name}</div>
          <div className="kg-card__desc">{ontology.description || 'No description'}</div>
        </div>
        <button
          className="kg-btn kg-btn--icon kg-btn--danger"
          onClick={(e) => { e.stopPropagation(); deleteMut.mutate() }}
          title="Delete"
        >
          <Trash2 size={15} />
        </button>
      </div>
      <div className="kg-card__meta">
        Created {new Date(ontology.created_at).toLocaleDateString()}
      </div>
    </div>
  )
}

export default function OntologyEditor() {
  const [showCreate, setShowCreate] = useState(false)
  const { selectedOntologyId, setSelectedOntologyId } = useOntologyStore()
  const { data: ontologies, isLoading } = useQuery({ queryKey: ['ontologies'], queryFn: fetchOntologies })

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* Left: Ontology list */}
      <div style={{ width: 300, borderRight: '0.5px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div className="kg-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ fontSize: 14 }}><Settings size={16} /> Ontologies</h1>
          <button className="kg-btn kg-btn--icon" onClick={() => setShowCreate(true)} title="New">
            <Plus size={16} />
          </button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: 'var(--sp-md)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
          {showCreate && <CreateOntologyForm onClose={() => setShowCreate(false)} />}
          {isLoading ? <LoadingSpinner /> : !ontologies?.length ? (
            <EmptyState icon={<Settings size={36} />} title="No ontologies" description="Create one to get started" />
          ) : (
            ontologies.map((o) => (
              <OntologyCard
                key={o.id}
                ontology={o}
                isSelected={selectedOntologyId === o.id}
                onSelect={() => setSelectedOntologyId(o.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* Right: Detail / Import / Types */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {selectedOntologyId ? (
          <OntologyDetail ontologyId={selectedOntologyId} />
        ) : (
          <EmptyState
            icon={<Settings size={44} />}
            title="Select an ontology"
            description="Choose from the left panel, or create a new one. Import YAML from otoly to define entity types and relations."
          />
        )}
      </div>
    </div>
  )
}
