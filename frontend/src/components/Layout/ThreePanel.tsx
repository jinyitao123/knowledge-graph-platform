import { useOntologyStore } from '@/stores/ontologyStore'
import ErrorBoundary from '@/components/common/ErrorBoundary'
import GraphExplorer from '@/pages/GraphExplorer'
import Chat from '@/pages/Chat'
import DocumentUpload from '@/pages/DocumentUpload'
import OntologyEditor from '@/pages/OntologyEditor'
import InferenceGraph from '@/components/GraphVisualization/InferenceGraph'

export default function ThreePanel() {
  const activeTab = useOntologyStore((s) => s.activeTab)

  // Chat: split layout — left Chat + right InferenceGraph
  if (activeTab === 'chat') {
    return (
      <div className="kg-main">
        <div style={{ width: '42%', flexShrink: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <ErrorBoundary>
            <Chat />
          </ErrorBoundary>
        </div>
        <div style={{ flex: 1, borderLeft: '0.5px solid var(--border)', overflow: 'hidden' }}>
          <ErrorBoundary>
            <InferenceGraph />
          </ErrorBoundary>
        </div>
      </div>
    )
  }

  // Graph: full width
  if (activeTab === 'graph') {
    return (
      <div className="kg-main">
        <div className="kg-main__center">
          <ErrorBoundary>
            <GraphExplorer />
          </ErrorBoundary>
        </div>
      </div>
    )
  }

  // Ontology / Documents: full width
  return (
    <div className="kg-main">
      <div className="kg-main__center">
        <ErrorBoundary>
          {activeTab === 'ontology' ? <OntologyEditor /> : <DocumentUpload />}
        </ErrorBoundary>
      </div>
    </div>
  )
}
