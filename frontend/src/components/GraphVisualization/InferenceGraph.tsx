import { useRef, useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchInstanceGraph } from '@/api/graph'
import { useGraphStore } from '@/stores/graphStore'

const HIGHLIGHT_COLOR = '#D4714A'
const HIGHLIGHT_EDGE = '#993C1D'
const EDGE_COLOR = 'rgba(0,0,0,0.12)'
const TEXT_COLOR = '#1A1A1E'
const LABEL_COLOR = '#A09A94'
const BG = '#FFFFFF'

// Ontology class → color mapping (matches OntologySchemaGraph)
const CLASS_STYLES: Record<string, { fill: string; stroke: string }> = {
  inventory_position: { fill: '#FAECE7', stroke: '#993C1D' },  // First citizen — terracotta
  spare_part:         { fill: '#E1F5EE', stroke: '#0F6E56' },  // Core — green
  warehouse:          { fill: '#E1F5EE', stroke: '#0F6E56' },
  equipment:          { fill: '#E1F5EE', stroke: '#0F6E56' },
  stock_movement:     { fill: '#EEEDFE', stroke: '#534AB7' },  // Event — purple
  purchase_order:     { fill: '#EEEDFE', stroke: '#534AB7' },
  inventory_snapshot: { fill: '#EEEDFE', stroke: '#534AB7' },
  decision_log:       { fill: '#EEEDFE', stroke: '#534AB7' },
}
const DEFAULT_STYLE = { fill: '#E8F0FE', stroke: '#1A56A0' }  // Untyped — blue

function getNodeStyle(type: string) {
  return CLASS_STYLES[type] || DEFAULT_STYLE
}

interface SimNode {
  id: string; name: string; type: string; summary: string
  x: number; y: number; vx: number; vy: number
}
interface SimEdge {
  source: string; target: string; relation: string; fact: string
}

function truncLabel(s: string, max = 16): string {
  return s.length > max ? s.slice(0, max) + '…' : s
}

function runSimulation(nodes: SimNode[], edges: SimEdge[], w: number, h: number) {
  // Scale repulsion with node count so graph spreads out more with more nodes
  const nodeScale = Math.max(1, nodes.length / 20)
  const areaScale = Math.sqrt(w * h) / 600
  const scale = areaScale * Math.sqrt(nodeScale)
  const cx = w / 2, cy = h / 2
  nodes.forEach((n, i) => {
    const angle = (2 * Math.PI * i) / nodes.length
    const r = Math.min(w, h) * 0.4 * Math.sqrt(nodeScale)
    n.x = cx + Math.cos(angle) * r
    n.y = cy + Math.sin(angle) * r
    n.vx = 0; n.vy = 0
  })
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const repulsion = 5000 * scale
  const iterations = Math.min(200, 80 + nodes.length * 2)
  for (let t = 0; t < iterations; t++) {
    for (const n of nodes) { n.vx += (cx - n.x) * 0.003; n.vy += (cy - n.y) * 0.003 }
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j]
        const dx = b.x - a.x, dy = b.y - a.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const f = repulsion / (dist * dist)
        const fx = (dx / dist) * f, fy = (dy / dist) * f
        a.vx -= fx; a.vy -= fy; b.vx += fx; b.vy += fy
      }
    }
    for (const e of edges) {
      const a = nodeMap.get(e.source), b = nodeMap.get(e.target)
      if (!a || !b) continue
      const dx = b.x - a.x, dy = b.y - a.y
      const dist = Math.sqrt(dx * dx + dy * dy) || 1
      const f = (dist - 160 * scale) * 0.025
      const fx = (dx / dist) * f, fy = (dy / dist) * f
      a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy
    }
    for (const n of nodes) {
      n.vx *= 0.7; n.vy *= 0.7
      n.x += n.vx * 0.3; n.y += n.vy * 0.3
    }
  }
}

export default function InferenceGraph() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dims, setDims] = useState({ w: 480, h: 600 })
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, w: 480, h: 600 })
  const [nodes, setNodes] = useState<SimNode[]>([])
  const [edges, setEdges] = useState<SimEdge[]>([])
  const [isPanning, setIsPanning] = useState(false)
  const panStart = useRef({ x: 0, y: 0, vx: 0, vy: 0 })
  const [selectedNode, setSelectedNode] = useState<string | null>(null)

  const { highlightedNodeIds, highlightedEdgeKeys, isInferring } = useGraphStore()
  const hasHighlights = highlightedNodeIds.size > 0

  // Fetch all instances
  const { data: instanceData } = useQuery({
    queryKey: ['instance-graph'],
    queryFn: () => fetchInstanceGraph(200),
    staleTime: 60000,
  })

  // Responsive
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver(([e]) => {
      const w = e.contentRect.width, h = e.contentRect.height
      setDims({ w, h })
      setViewBox({ x: 0, y: 0, w, h })
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // Build graph from instance data
  useEffect(() => {
    if (!instanceData?.nodes?.length) return
    const simNodes: SimNode[] = instanceData.nodes.map((n: any) => ({
      id: n.id, name: n.name, type: n.type, summary: n.summary || '', x: 0, y: 0, vx: 0, vy: 0,
    }))
    const nodeIds = new Set(simNodes.map(n => n.id))
    const simEdges: SimEdge[] = instanceData.edges
      .filter(e => nodeIds.has(e.source) && nodeIds.has(e.target))
      .map(e => ({ source: e.source, target: e.target, relation: e.relation, fact: e.fact }))

    runSimulation(simNodes, simEdges, dims.w, dims.h)
    setNodes([...simNodes])
    setEdges(simEdges)
  }, [instanceData, dims.w, dims.h])

  // Zoom
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      const s = e.deltaY > 0 ? 1.1 : 0.9
      setViewBox(vb => {
        const cx = vb.x + vb.w / 2, cy = vb.y + vb.h / 2
        const nw = Math.max(100, Math.min(3000, vb.w * s))
        const nh = Math.max(100, Math.min(3000, vb.h * s))
        return { x: cx - nw / 2, y: cy - nh / 2, w: nw, h: nh }
      })
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])

  const handlePanStart = (e: React.MouseEvent) => {
    setIsPanning(true)
    panStart.current = { x: e.clientX, y: e.clientY, vx: viewBox.x, vy: viewBox.y }
  }
  const handlePanMove = (e: React.MouseEvent) => {
    if (!isPanning) return
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const sx = viewBox.w / rect.width, sy = viewBox.h / rect.height
    setViewBox(vb => ({
      ...vb,
      x: panStart.current.vx - (e.clientX - panStart.current.x) * sx,
      y: panStart.current.vy - (e.clientY - panStart.current.y) * sy,
    }))
  }
  const handlePanEnd = () => setIsPanning(false)

  // Check if a node is highlighted (by UUID)
  const isNodeHighlighted = (n: SimNode) => highlightedNodeIds.has(n.id)

  // Check if an edge is highlighted (by source_uuid->target_uuid)
  const isEdgeHighlighted = (e: SimEdge) => highlightedEdgeKeys.has(`${e.source}->${e.target}`)

  if (nodes.length === 0) {
    return (
      <div ref={containerRef} style={{
        height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: BG, color: LABEL_COLOR, fontSize: 13, textAlign: 'center', padding: 24,
      }}>
        {isInferring ? (
          <div>
            <div style={{ width: 28, height: 28, border: '2px solid #EFECEA', borderTopColor: HIGHLIGHT_COLOR, borderRadius: '50%', margin: '0 auto 12px', animation: 'spin 1s linear infinite' }} />
            Searching knowledge graph...
          </div>
        ) : (
          <div>Upload documents to populate the instance graph</div>
        )}
      </div>
    )
  }

  return (
    <div ref={containerRef} style={{ height: '100%', position: 'relative', background: BG, cursor: isPanning ? 'grabbing' : 'default' }}>
      <svg width="100%" height="100%" viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
        onMouseDown={handlePanStart} onMouseMove={handlePanMove} onMouseUp={handlePanEnd} onMouseLeave={handlePanEnd}>
        <defs>
          <marker id="ig-arrow" markerWidth="7" markerHeight="5" refX="18" refY="2.5" orient="auto">
            <polygon points="0 0, 7 2.5, 0 5" fill={EDGE_COLOR} />
          </marker>
          <marker id="ig-arrow-hl" markerWidth="7" markerHeight="5" refX="18" refY="2.5" orient="auto">
            <polygon points="0 0, 7 2.5, 0 5" fill={HIGHLIGHT_EDGE} />
          </marker>
        </defs>

        {/* Edges */}
        {edges.map((e, i) => {
          const a = nodes.find(n => n.id === e.source)
          const b = nodes.find(n => n.id === e.target)
          if (!a || !b) return null
          const hl = isEdgeHighlighted(e)

          const color = hl ? HIGHLIGHT_EDGE : EDGE_COLOR
          const sw = hl ? 2.5 : 0.5
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
          return <g key={i}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={sw}
              markerEnd={hl ? 'url(#ig-arrow-hl)' : 'url(#ig-arrow)'} />
            {hl && <text x={mx} y={my - 4} fontSize="8" fill={HIGHLIGHT_EDGE} textAnchor="middle" fontWeight="500"
              style={{ pointerEvents: 'none' }}>{truncLabel(e.relation, 14)}</text>}
          </g>
        })}

        {/* Nodes */}
        {nodes.map(n => {
          const hl = isNodeHighlighted(n)

          const baseStyle = getNodeStyle(n.type)
          const fill = hl ? '#FAECE7' : baseStyle.fill
          const stroke = hl ? HIGHLIGHT_COLOR : baseStyle.stroke
          const notHL = hasHighlights && !hl
          const r = hl ? 12 : notHL ? 5 : 6
          const showLabel = hl || selectedNode === n.id
          return <g key={n.id} onClick={() => setSelectedNode(selectedNode === n.id ? null : n.id)} style={{ cursor: 'pointer' }}>
            <circle cx={n.x} cy={n.y} r={r} fill={fill} stroke={stroke} strokeWidth={hl ? 2.5 : 0.8} opacity={notHL ? 0.35 : 1} />
            {showLabel && <text x={n.x} y={n.y + r + 10} textAnchor="middle" fontSize="9" fontWeight="600"
              fill={TEXT_COLOR} style={{ pointerEvents: 'none' }}>{truncLabel(n.name, 12)}</text>}
          </g>
        })}
      </svg>

      {/* Legend — bottom left */}
      <div style={{
        position: 'absolute', bottom: 6, left: 6, fontSize: 9, color: LABEL_COLOR,
        background: 'rgba(255,255,255,0.92)', padding: '4px 8px', borderRadius: 4,
        display: 'flex', flexWrap: 'wrap', gap: '4px 10px', maxWidth: 200,
      }}>
        {[
          { label: '头寸', ...CLASS_STYLES.inventory_position },
          { label: '备件/设备/库房', ...CLASS_STYLES.spare_part },
          { label: '事件/采购', ...CLASS_STYLES.stock_movement },
          { label: '未分类', ...DEFAULT_STYLE },
          { label: '推理路径', fill: '#FAECE7', stroke: HIGHLIGHT_COLOR },
        ].map(({ label, fill, stroke }) => (
          <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: fill, border: `1px solid ${stroke}`, flexShrink: 0 }} />
            {label}
          </span>
        ))}
      </div>

      {/* Stats */}
      <div style={{
        position: 'absolute', top: 6, right: 6, fontSize: 10, color: LABEL_COLOR,
        background: 'rgba(255,255,255,0.9)', padding: '2px 6px', borderRadius: 4,
      }}>
        {nodes.length} nodes · {edges.length} edges
        {hasHighlights && <span style={{ color: HIGHLIGHT_COLOR, marginLeft: 6 }}>
          {highlightedNodeIds.size} highlighted
        </span>}
      </div>

      {/* Selected node detail */}
      {selectedNode && (() => {
        const n = nodes.find(nd => nd.id === selectedNode)
        if (!n) return null
        const relatedEdges = edges.filter(e => e.source === n.id || e.target === n.id)
        return (
          <div style={{
            position: 'absolute', bottom: 8, left: 8, width: 240,
            background: BG, border: '0.5px solid rgba(0,0,0,0.08)',
            borderRadius: 8, padding: 12, fontSize: 12, maxHeight: '40%', overflow: 'auto',
          }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{n.name}</div>
            <div style={{ color: LABEL_COLOR, fontSize: 10, marginBottom: 4 }}>{n.type} · {n.id.slice(0, 8)}</div>
            {n.summary && <div style={{ fontSize: 11, color: TEXT_COLOR, marginBottom: 8, lineHeight: 1.5 }}>{n.summary}</div>}
            {relatedEdges.length > 0 && relatedEdges.slice(0, 8).map((e, i) => {
              const other = e.source === n.id ? nodes.find(nd => nd.id === e.target) : nodes.find(nd => nd.id === e.source)
              const dir = e.source === n.id ? '→' : '←'
              return <div key={i} style={{ color: TEXT_COLOR, marginBottom: 2, fontSize: 11 }}>
                {dir} {e.relation} <span style={{ color: LABEL_COLOR }}>{other?.name || '?'}</span>
              </div>
            })}
          </div>
        )
      })()}
    </div>
  )
}
