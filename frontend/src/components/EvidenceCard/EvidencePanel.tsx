import { FileText, ExternalLink } from 'lucide-react'
import EmptyState from '@/components/common/EmptyState'

interface EvidenceItem {
  source_doc: string
  page_number: number
  text: string
  entity_name: string
  confidence: number
}

function EvidenceCard({ evidence }: { evidence: EvidenceItem }) {
  return (
    <div className="kg-card animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--sp-sm)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500, color: 'var(--terracotta)' }}>
          <FileText size={12} /> {evidence.source_doc}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>p.{evidence.page_number}</span>
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>{evidence.text}</p>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--sp-sm)' }}>
        <span className="kg-badge kg-badge--processing">{evidence.entity_name}</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{Math.round(evidence.confidence * 100)}%</span>
      </div>
    </div>
  )
}

export default function EvidencePanel() {
  const evidence: EvidenceItem[] = []

  return (
    <div className="kg-evidence">
      <div className="kg-evidence__header">
        <h2><ExternalLink size={13} /> Evidence</h2>
        <p>Source traceability for answers</p>
      </div>
      <div className="kg-evidence__body">
        {evidence.length === 0 ? (
          <EmptyState icon={<FileText size={32} />} title="No evidence yet" description="Evidence cards appear here when you search or chat" />
        ) : (
          evidence.map((e, i) => <EvidenceCard key={i} evidence={e} />)
        )}
      </div>
    </div>
  )
}
