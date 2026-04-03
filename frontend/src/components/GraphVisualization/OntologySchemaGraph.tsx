import { useRef, useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchEntityTypes, fetchRelationTypes } from '@/api/ontology'

/* ── otoly color scheme ───────────────────────────── */
const NODE_STYLES = {
  first_citizen: { fill: '#FAECE7', stroke: '#993C1D' },
  core:          { fill: '#E1F5EE', stroke: '#0F6E56' },
  event:         { fill: '#EEEDFE', stroke: '#534AB7' },
}
const EDGE_COLOR = 'rgba(0,0,0,0.15)'
const EDGE_HOVER = '#993C1D'
const LABEL_COLOR = '#A09A94'
const TEXT_COLOR = '#1A1A1E'
const BG_COLOR = '#FFFFFF'

const EVENT_KEYWORDS = ['event', 'log', 'record', 'snapshot', 'movement', 'order', 'transaction', '记录', '快照', '日志']

/* ── Types ────────────────────────────────────────── */
interface SimNode {
  id: string; classId: string; name: string; desc: string; category: 'first_citizen' | 'core' | 'event'
  attrCount: number; attrs: Array<{ name: string; type: string }>
  x: number; y: number; vx: number; vy: number; fx?: number; fy?: number
}
interface SimEdge { id: string; from: string; to: string; name: string; cardinality: string }

/* ── Force simulation ─────────────────────────────── */
function runSimulation(nodes: SimNode[], edges: SimEdge[], w: number, h: number, ticks: number) {
  const scale = Math.sqrt(w * h) / 600
  const cx = w / 2, cy = h / 2
  const centerStr = 0.008
  const repulsion = 3000 * scale
  const linkStr = 0.04
  const linkDist = 140 * scale
  const damping = 0.7
  const alpha = 0.3

  // Init positions in circle
  nodes.forEach((n, i) => {
    const angle = (2 * Math.PI * i) / nodes.length
    n.x = cx + Math.cos(angle) * 100 * scale
    n.y = cy + Math.sin(angle) * 100 * scale
    n.vx = 0; n.vy = 0
  })

  const nodeMap = new Map(nodes.map(n => [n.id, n]))

  for (let t = 0; t < ticks; t++) {
    // Center
    for (const n of nodes) {
      n.vx += (cx - n.x) * centerStr
      n.vy += (cy - n.y) * centerStr
    }
    // Repulsion (n^2)
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j]
        const dx = b.x - a.x, dy = b.y - a.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const f = repulsion / (dist * dist)
        const fx = (dx / dist) * f, fy = (dy / dist) * f
        a.vx -= fx; a.vy -= fy
        b.vx += fx; b.vy += fy
      }
    }
    // Links
    for (const e of edges) {
      const a = nodeMap.get(e.from), b = nodeMap.get(e.to)
      if (!a || !b) continue
      const dx = b.x - a.x, dy = b.y - a.y
      const dist = Math.sqrt(dx * dx + dy * dy) || 1
      const f = (dist - linkDist) * linkStr
      const fx = (dx / dist) * f, fy = (dy / dist) * f
      a.vx += fx; a.vy += fy
      b.vx -= fx; b.vy -= fy
    }
    // Update
    for (const n of nodes) {
      if (n.fx !== undefined) { n.x = n.fx; n.vx = 0 }
      else { n.vx *= damping; n.x += n.vx * alpha }
      if (n.fy !== undefined) { n.y = n.fy; n.vy = 0 }
      else { n.vy *= damping; n.y += n.vy * alpha }
    }
  }
}

/* ── Component ────────────────────────────────────── */
export default function OntologySchemaGraph({ ontologyId }: { ontologyId: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [dims, setDims] = useState({ w: 800, h: 600 })
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, w: 800, h: 600 })
  const [nodes, setNodes] = useState<SimNode[]>([])
  const [edges, setEdges] = useState<SimEdge[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [hoverEdge, setHoverEdge] = useState<string | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [isPanning, setIsPanning] = useState(false)
  const dragStart = useRef({ x: 0, y: 0, nx: 0, ny: 0 })
  const panStart = useRef({ x: 0, y: 0, vx: 0, vy: 0 })

  const { data: entityTypes } = useQuery({
    queryKey: ['entity-types', ontologyId], queryFn: () => fetchEntityTypes(ontologyId), enabled: !!ontologyId,
  })
  const { data: relationTypes } = useQuery({
    queryKey: ['relation-types', ontologyId], queryFn: () => fetchRelationTypes(ontologyId), enabled: !!ontologyId,
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

  // Build + simulate
  useEffect(() => {
    if (!entityTypes?.length) { setNodes([]); setEdges([]); return }
    // Build a mapping from classId (e.g. "inventory_position") to name (e.g. "库存头寸")
    // Node id uses classId so edges can match by source_type/target_type
    const simNodes: SimNode[] = entityTypes.map(et => {
      const props = (et.properties || {}) as Record<string, unknown>
      const attrs = ((props.attributes || []) as Array<Record<string, string>>).map(a => ({ name: a.Name || a.name || '', type: a.Type || a.type || '' }))
      const isFC = props.first_citizen === true
      const lower = et.name.toLowerCase()
      const isEvent = EVENT_KEYWORDS.some(k => lower.includes(k))
      // Try to extract classId from properties (set during YAML import)
      const classId = (props.yaml_class_id as string) || et.name
      return { id: classId, classId, name: et.name, desc: et.description, category: isFC ? 'first_citizen' as const : isEvent ? 'event' as const : 'core' as const, attrCount: attrs.length, attrs, x: 0, y: 0, vx: 0, vy: 0 }
    })

    // Build lookup: try matching edges by both classId and name
    const nodeIdSet = new Set(simNodes.map(n => n.id))
    const nameToId = new Map(simNodes.map(n => [n.name, n.id]))

    const resolveNodeId = (ref: string) => {
      if (nodeIdSet.has(ref)) return ref      // Direct classId match
      if (nameToId.has(ref)) return nameToId.get(ref)!  // Name match
      return null
    }

    const simEdges: SimEdge[] = (relationTypes || []).map(rt => {
      const props = (rt.properties || {}) as Record<string, unknown>
      const fromId = resolveNodeId(rt.source_type)
      const toId = resolveNodeId(rt.target_type)
      if (!fromId || !toId) return null
      return { id: rt.name, from: fromId, to: toId, name: rt.name, cardinality: String(props.cardinality || '') }
    }).filter((e): e is SimEdge => e !== null)
    runSimulation(simNodes, simEdges, dims.w, dims.h, 150)
    setNodes([...simNodes])
    setEdges(simEdges)
  }, [entityTypes, relationTypes, dims.w, dims.h])

  // Wheel zoom
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      const s = e.deltaY > 0 ? 1.1 : 0.9
      setViewBox(vb => {
        const cx = vb.x + vb.w / 2, cy = vb.y + vb.h / 2
        const nw = Math.max(200, Math.min(3200, vb.w * s))
        const nh = Math.max(120, Math.min(1920, vb.h * s))
        return { x: cx - nw / 2, y: cy - nh / 2, w: nw, h: nh }
      })
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])

  const handleMouseDown = (e: React.MouseEvent, nodeId?: string) => {
    if (nodeId) {
      setDragging(nodeId)
      const n = nodes.find(n => n.id === nodeId)!
      dragStart.current = { x: e.clientX, y: e.clientY, nx: n.x, ny: n.y }
      setSelected(nodeId)
    } else {
      setIsPanning(true)
      panStart.current = { x: e.clientX, y: e.clientY, vx: viewBox.x, vy: viewBox.y }
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragging) {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const sx = viewBox.w / rect.width, sy = viewBox.h / rect.height
      const dx = (e.clientX - dragStart.current.x) * sx
      const dy = (e.clientY - dragStart.current.y) * sy
      setNodes(prev => prev.map(n => n.id === dragging ? { ...n, x: dragStart.current.nx + dx, y: dragStart.current.ny + dy } : n))
    } else if (isPanning) {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const sx = viewBox.w / rect.width, sy = viewBox.h / rect.height
      const dx = (e.clientX - panStart.current.x) * sx
      const dy = (e.clientY - panStart.current.y) * sy
      setViewBox(vb => ({ ...vb, x: panStart.current.vx - dx, y: panStart.current.vy - dy }))
    }
  }

  const handleMouseUp = () => { setDragging(null); setIsPanning(false) }

  const selectedNode = selected ? nodes.find(n => n.id === selected) : null
  const selectedEdges = selected ? edges.filter(e => e.from === selected || e.to === selected) : []

  if (nodes.length === 0) {
    return (
      <div ref={containerRef} style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: LABEL_COLOR, fontSize: 13, background: BG_COLOR }}>
        Import an ontology to see the schema graph
      </div>
    )
  }

  return (
    <div ref={containerRef} style={{ height: '100%', position: 'relative', background: BG_COLOR, cursor: isPanning ? 'grabbing' : dragging ? 'grabbing' : 'default' }}>
      <svg ref={svgRef} width="100%" height="100%" viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
        onMouseDown={(e) => handleMouseDown(e)} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
        <defs>
          <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="32" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill={EDGE_COLOR} />
          </marker>
          <marker id="arrowhead-hover" markerWidth="8" markerHeight="6" refX="32" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill={EDGE_HOVER} />
          </marker>
        </defs>

        {/* Edges */}
        {edges.map(e => {
          const a = nodes.find(n => n.id === e.from), b = nodes.find(n => n.id === e.to)
          if (!a || !b) return null
          const isSelf = e.from === e.to
          const isHl = hoverEdge === e.id || selectedEdges.some(se => se.id === e.id)
          const color = isHl ? EDGE_HOVER : EDGE_COLOR
          const sw = isHl ? 2 : 1.5

          if (isSelf) {
            const d = `M ${a.x + 20} ${a.y - 10} C ${a.x + 80} ${a.y - 50}, ${a.x + 80} ${a.y + 50}, ${a.x + 20} ${a.y + 10}`
            return <g key={e.id} onMouseEnter={() => setHoverEdge(e.id)} onMouseLeave={() => setHoverEdge(null)} style={{ cursor: 'pointer' }}>
              <path d={d} fill="none" stroke={color} strokeWidth={sw} strokeDasharray="4 3" markerEnd={isHl ? 'url(#arrowhead-hover)' : 'url(#arrowhead)'} />
              <text x={a.x + 70} y={a.y} fontSize="10" fill={isHl ? EDGE_HOVER : LABEL_COLOR} textAnchor="middle">{e.name}</text>
            </g>
          }

          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
          return <g key={e.id} onMouseEnter={() => setHoverEdge(e.id)} onMouseLeave={() => setHoverEdge(null)} style={{ cursor: 'pointer' }}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={sw} markerEnd={isHl ? 'url(#arrowhead-hover)' : 'url(#arrowhead)'} />
            <text x={mx} y={my - 6} fontSize="10" fill={isHl ? EDGE_HOVER : LABEL_COLOR} textAnchor="middle" style={{ pointerEvents: 'none' }}>{e.name}</text>
          </g>
        })}

        {/* Nodes */}
        {nodes.map(n => {
          const style = NODE_STYLES[n.category]
          const r = n.category === 'first_citizen' ? 30 : 24
          const isSel = selected === n.id
          return <g key={n.id} onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e, n.id) }} style={{ cursor: 'grab' }}>
            {/* Circle */}
            <circle cx={n.x} cy={n.y} r={r} fill={style.fill} stroke={isSel ? '#1A56A0' : style.stroke} strokeWidth={isSel ? 3 : 1.5} />
            {/* Attribute count inside */}
            {n.attrCount > 0 && <text x={n.x} y={n.y + 4} textAnchor="middle" fontSize="11" fill={style.stroke} fontWeight="600">{n.attrCount}</text>}
            {/* Name below */}
            <text x={n.x} y={n.y + r + 14} textAnchor="middle" fontSize="11" fontWeight="500" fill={TEXT_COLOR}>{n.name}</text>
          </g>
        })}
      </svg>

      {/* Legend — bottom left */}
      <div style={{ position: 'absolute', bottom: 8, left: 8, display: 'flex', gap: 12, fontSize: 10, background: 'rgba(255,255,255,0.9)', padding: '4px 10px', borderRadius: 4, color: LABEL_COLOR }}>
        {Object.entries(NODE_STYLES).map(([k, v]) => (
          <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: v.fill, border: `1.5px solid ${v.stroke}`, display: 'inline-block' }} />
            {k === 'first_citizen' ? 'First Citizen' : k === 'core' ? 'Core' : 'Event/Log'}
          </span>
        ))}
      </div>

      {/* Stats — top right */}
      <div style={{ position: 'absolute', top: 8, right: 8, fontSize: 10, color: LABEL_COLOR, background: 'rgba(255,255,255,0.9)', padding: '3px 8px', borderRadius: 4 }}>
        {nodes.length} classes · {edges.length} relations
      </div>

      {/* Detail panel — right side */}
      {selectedNode && (
        <div style={{
          position: 'absolute', top: 0, right: 0, bottom: 0, width: 260,
          background: BG_COLOR, borderLeft: '0.5px solid rgba(0,0,0,0.08)',
          padding: 16, overflowY: 'auto', fontSize: 12,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontWeight: 600, fontSize: 14, color: TEXT_COLOR }}>{selectedNode.name}</span>
            <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: LABEL_COLOR }}>×</button>
          </div>
          <div style={{ color: LABEL_COLOR, marginBottom: 12, lineHeight: 1.6 }}>{selectedNode.desc}</div>
          <div style={{ marginBottom: 12 }}>
            <span style={{
              display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 500,
              background: NODE_STYLES[selectedNode.category].fill, color: NODE_STYLES[selectedNode.category].stroke,
            }}>
              {selectedNode.category === 'first_citizen' ? 'First Citizen' : selectedNode.category}
            </span>
          </div>

          {/* Attributes */}
          {selectedNode.attrs.length > 0 && (
            <>
              <div style={{ fontWeight: 600, color: LABEL_COLOR, marginBottom: 6 }}>Attributes ({selectedNode.attrs.length})</div>
              {selectedNode.attrs.map((a, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
                  <span style={{ color: TEXT_COLOR }}>{a.name}</span>
                  <span style={{ color: LABEL_COLOR, fontSize: 10, background: 'rgba(0,0,0,0.04)', padding: '1px 6px', borderRadius: 3 }}>{a.type}</span>
                </div>
              ))}
            </>
          )}

          {/* Related edges */}
          {selectedEdges.length > 0 && (
            <>
              <div style={{ fontWeight: 600, color: LABEL_COLOR, marginTop: 16, marginBottom: 6 }}>Relations ({selectedEdges.length})</div>
              {selectedEdges.map((e, i) => (
                <div key={i} style={{ padding: '4px 0', borderBottom: '0.5px solid rgba(0,0,0,0.06)', color: TEXT_COLOR }}>
                  <span style={{ fontSize: 11 }}>
                    {e.from === selectedNode.id ? '→' : '←'} {e.name}
                    <span style={{ color: LABEL_COLOR, marginLeft: 4 }}>
                      ({e.from === selectedNode.id ? e.to : e.from})
                    </span>
                  </span>
                  {e.cardinality && <span style={{ fontSize: 9, color: LABEL_COLOR, marginLeft: 6 }}>{e.cardinality}</span>}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
