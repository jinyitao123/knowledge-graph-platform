import { useCallback, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Upload, FileText, RefreshCw } from 'lucide-react'
import { useDropzone } from 'react-dropzone'
import { fetchDocuments, uploadDocument } from '@/api/documents'
import { useOntologyStore } from '@/stores/ontologyStore'
import StatusBadge from '@/components/common/StatusBadge'
import EmptyState from '@/components/common/EmptyState'
import LoadingSpinner from '@/components/common/LoadingSpinner'

export default function DocumentUpload() {
  const selectedOntologyId = useOntologyStore((s) => s.selectedOntologyId)
  const queryClient = useQueryClient()
  const [uploading, setUploading] = useState(false)

  const { data: documents, isLoading } = useQuery({
    queryKey: ['documents'],
    queryFn: fetchDocuments,
    refetchInterval: 5000,
  })

  const uploadMut = useMutation({
    mutationFn: (file: File) => uploadDocument(file, selectedOntologyId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['documents'] }),
    onSettled: () => setUploading(false),
  })

  const onDrop = useCallback((files: File[]) => {
    if (!selectedOntologyId) { alert('Please select an ontology first'); return }
    setUploading(true)
    files.forEach((f) => uploadMut.mutate(f))
  }, [selectedOntologyId, uploadMut])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/html': ['.html'],
      'text/markdown': ['.md'],
      'text/plain': ['.txt'],
    },
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'auto' }}>
      <div className="kg-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1><FileText size={18} /> Documents</h1>
          <p>Upload documents to extract knowledge into the graph</p>
        </div>
        <button className="kg-btn kg-btn--ghost" onClick={() => queryClient.invalidateQueries({ queryKey: ['documents'] })}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <div style={{ padding: 'var(--sp-2xl)', flex: 1 }}>
        {/* Drop zone */}
        <div
          {...getRootProps()}
          className={`kg-dropzone ${isDragActive ? 'kg-dropzone--active' : ''}`}
          style={{ marginBottom: 'var(--sp-2xl)' }}
        >
          <input {...getInputProps()} />
          <div className="kg-dropzone__icon"><Upload size={28} /></div>
          {uploading ? (
            <div className="kg-dropzone__text" style={{ color: 'var(--terracotta)' }}>Uploading...</div>
          ) : isDragActive ? (
            <div className="kg-dropzone__text" style={{ color: 'var(--terracotta)' }}>Drop files here</div>
          ) : (
            <>
              <div className="kg-dropzone__text">
                Drag & drop files here, or <span style={{ color: 'var(--terracotta)', fontWeight: 500 }}>click to browse</span>
              </div>
              <div className="kg-dropzone__hint">Supports PDF, DOCX, HTML, Markdown, TXT</div>
            </>
          )}
          {!selectedOntologyId && <div className="kg-dropzone__warn">Select an ontology from the header first</div>}
        </div>

        {/* Document list */}
        {isLoading ? (
          <LoadingSpinner />
        ) : !documents?.length ? (
          <EmptyState icon={<FileText size={44} />} title="No documents yet" description="Upload your first document to get started" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
            {documents.map((doc) => (
              <div key={doc.id} className="kg-doc-row animate-fade-in">
                <div className="kg-doc-row__info">
                  <FileText size={16} className="kg-doc-row__icon" />
                  <div>
                    <div className="kg-doc-row__name">{doc.filename}</div>
                    <div className="kg-doc-row__meta">{doc.file_type} &middot; {new Date(doc.created_at).toLocaleString()}</div>
                  </div>
                </div>
                <div className="kg-doc-row__right">
                  {doc.status === 'processing' && (
                    <div className="kg-progress">
                      <div className="kg-progress__fill" style={{ width: `${doc.progress}%` }} />
                    </div>
                  )}
                  <StatusBadge status={doc.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
