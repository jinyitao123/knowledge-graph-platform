import { useState, useRef, useCallback, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, Network, BarChart3 } from 'lucide-react'
import ForceGraph3D from 'react-force-graph-3d'
import { searchGraph, fetchGraphStats, fetchSubgraph } from '@/api/graph'
import { useOntologyStore } from '@/stores/ontologyStore'
import EmptyState from '@/components/common/EmptyState'

interface GraphData {
  nodes: Array<{ id: string; name: string; type: string; val: number }>
  links: Array<{ source: string; target: string; name: string; fact: string }>
}

const TYPE_COLORS: Record<string, string> = {
  Person: '#D4714A',
  Company: '#2D6A2D',
  Product: '#1A56A0',
  Event: '#8B5E0A',
  Location: '#6B4DC4',
  default: '#A09A94',
}

function getColor(type: string) {
  return TYPE_COLORS[type] || TYPE_COLORS.default
}

function StatsBar() {
  const { data: stats } = useQuery({
    queryKey: ['graph-stats'],
    queryFn: fetchGraphStats,
    refetchInterval: 30000,
  })

  return (
    <div style={{ display: 'flex', gap: 'var(--sp-lg)', fontSize: 12, color: 'var(--text-muted)' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><BarChart3 size={12} /> {stats?.entities || 0} entities</span>
      <span>{stats?.relations || 0} relations</span>
      <span>{stats?.episodes || 0} episodes</span>
    </div>
  )
}

export default function GraphExplorer() {
  const [searchInput, setSearchInput] = useState('')
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] })
  const [selectedNode, setSelectedNode] = useState<any>(null)
  const selectedOntologyId = useOntologyStore((s) => s.selectedOntologyId)
  const graphRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver(([entry]) => {
      setDimensions({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const handleSearch = useCallback(async () => {
    const q = searchInput.trim()
    if (!q) return

    try {
      const resp = await searchGraph(q, selectedOntologyId || undefined)
      const nodeMap = new Map<string, { id: string; name: string; type: string; val: number }>()
      const links: GraphData['links'] = []

      for (const r of resp.results) {
        const src = String(r.entity?.source || '')
        const tgt = String(r.entity?.target || '')
        const name = String(r.entity?.name || '')

        if (src && !nodeMap.has(src)) {
          nodeMap.set(src, { id: src, name: src.slice(0, 8), type: 'Entity', val: 1 })
        }
        if (tgt && !nodeMap.has(tgt)) {
          nodeMap.set(tgt, { id: tgt, name: tgt.slice(0, 8), type: 'Entity', val: 1 })
        }
        if (src && tgt) {
          links.push({ source: src, target: tgt, name, fact: r.evidence || '' })
          // Increase node size based on connections
          const srcNode = nodeMap.get(src)
          const tgtNode = nodeMap.get(tgt)
          if (srcNode) srcNode.val += 1
          if (tgtNode) tgtNode.val += 1
        }
      }

      // Try to get subgraph for richer data
      if (nodeMap.size > 0) {
        try {
          const firstNode = nodeMap.keys().next().value
          if (firstNode) {
            const sub = await fetchSubgraph(firstNode, 2)
            for (const n of sub.nodes) {
              if (!nodeMap.has(n.uuid)) {
                nodeMap.set(n.uuid, { id: n.uuid, name: n.name, type: n.entity_type || 'Entity', val: 1 })
              } else {
                const existing = nodeMap.get(n.uuid)!
                existing.name = n.name || existing.name
                existing.type = n.entity_type || existing.type
              }
            }
            for (const e of sub.edges) {
              const exists = links.some(l =>
                (typeof l.source === 'string' ? l.source : (l.source as any).id) === e.source &&
                (typeof l.target === 'string' ? l.target : (l.target as any).id) === e.target
              )
              if (!exists) {
                links.push({ source: e.source, target: e.target, name: e.relation_type, fact: e.fact })
              }
            }
          }
        } catch { /* subgraph optional */ }
      }

      setGraphData({ nodes: Array.from(nodeMap.values()), links })
    } catch (e) {
      console.error('Search failed:', e)
    }
  }, [searchInput, selectedOntologyId])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div className="kg-page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1><Network size={18} /> Graph Explorer</h1>
            <StatsBar />
          </div>
        </div>
        <div className="kg-search" style={{ marginTop: 'var(--sp-md)' }}>
          <Search size={15} className="kg-search__icon" />
          <input
            placeholder="Search entities, relations, or facts..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button className="kg-btn kg-btn--primary" onClick={handleSearch}>Search</button>
        </div>
      </div>

      {/* Graph or Empty */}
      <div ref={containerRef} style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {graphData.nodes.length === 0 ? (
          <EmptyState
            icon={<Network size={44} />}
            title="Explore your knowledge graph"
            description="Search for entities to visualize the graph. Upload documents first to populate it."
          />
        ) : (
          <ForceGraph3D
            ref={graphRef}
            width={dimensions.width}
            height={dimensions.height}
            graphData={graphData}
            nodeLabel={(node: any) => `${node.name} (${node.type})`}
            nodeColor={(node: any) => getColor(node.type)}
            nodeVal={(node: any) => node.val || 1}
            nodeOpacity={0.9}
            linkLabel={(link: any) => link.name}
            linkColor={() => 'rgba(160, 154, 148, 0.4)'}
            linkWidth={1}
            linkDirectionalArrowLength={4}
            linkDirectionalArrowRelPos={1}
            backgroundColor="#F7F5F2"
            onNodeClick={(node: any) => setSelectedNode(node)}
          />
        )}

        {/* Node detail panel */}
        {selectedNode && (
          <div style={{
            position: 'absolute', top: 'var(--sp-lg)', right: 'var(--sp-lg)',
            width: 280, background: 'var(--bg-card)', border: '0.5px solid var(--border)',
            borderRadius: 'var(--radius-md)', padding: 'var(--sp-lg)', zIndex: 10,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-sm)' }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{selectedNode.name}</span>
              <button className="kg-btn kg-btn--icon" onClick={() => setSelectedNode(null)}>×</button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              <div>Type: <span style={{ color: getColor(selectedNode.type) }}>{selectedNode.type}</span></div>
              <div style={{ marginTop: 4 }}>ID: {selectedNode.id?.slice(0, 12)}...</div>
              <div style={{ marginTop: 4 }}>Connections: {selectedNode.val - 1}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
