import { useState, useRef, useEffect } from 'react'
import { MessageSquare, Send, Loader2, Bot, User } from 'lucide-react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { streamChat } from '@/api/chat'
import { useChatStore } from '@/stores/chatStore'
import { useOntologyStore } from '@/stores/ontologyStore'
import { useGraphStore } from '@/stores/graphStore'
import EmptyState from '@/components/common/EmptyState'

function MessageBubble({ role, content }: { role: 'user' | 'assistant'; content: string }) {
  const isUser = role === 'user'
  return (
    <div className={`kg-chat__msg ${isUser ? 'kg-chat__msg--user' : ''}`}>
      <div className={`kg-chat__avatar ${isUser ? 'kg-chat__avatar--user' : 'kg-chat__avatar--bot'}`}>
        {isUser ? <User size={15} /> : <Bot size={15} />}
      </div>
      <div className={`kg-chat__bubble ${isUser ? 'kg-chat__bubble--user' : 'kg-chat__bubble--bot'}`}>
        {isUser ? content : (
          <div className="kg-markdown">
            <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
          </div>
        )}
      </div>
    </div>
  )
}

function ToolCallIndicator() {
  return (
    <div className="animate-fade-in" style={{
      display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
      color: 'var(--terracotta)', padding: '4px 0',
    }}>
      <div className="animate-spin" style={{
        width: 14, height: 14, border: '1.5px solid var(--border)',
        borderTopColor: 'var(--terracotta)', borderRadius: '50%',
      }} />
      Searching knowledge graph...
    </div>
  )
}

export default function Chat() {
  const [input, setInput] = useState('')
  const [showToolCall, setShowToolCall] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { messages, isStreaming, addMessage, appendToLast, setStreaming } = useChatStore()
  const selectedOntologyId = useOntologyStore((s) => s.selectedOntologyId)
  const { setInferenceResult, startInference, stopInference, highlightPath, setBreathingNode, clearHighlights } = useGraphStore()

  // Clear graph highlights on mount (fresh state)
  useEffect(() => { clearHighlights() }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, showToolCall])

  const handleSend = () => {
    const text = input.trim()
    if (!text || isStreaming) return

    setInput('')
    clearHighlights()
    addMessage({ id: crypto.randomUUID(), role: 'user', content: text, timestamp: Date.now() })
    addMessage({ id: crypto.randomUUID(), role: 'assistant', content: '', timestamp: Date.now() })
    setStreaming(true)
    startInference()

    let toolJsonBuffer = ''
    let isCapturingToolResult = false

    streamChat(
      text, '', selectedOntologyId,
      (event) => {
        if (event.type === 'token' && event.content) {
          const content = event.content

          // Detect tool result JSON — starts with {"results":
          if (content.includes('{"results"') || content.includes('{"results":') || isCapturingToolResult) {
            toolJsonBuffer += content
            isCapturingToolResult = true

            // Try to parse the accumulated buffer as complete JSON
            // Look for the outermost { ... } that contains "edges"
            if (toolJsonBuffer.includes('"edges"')) {
              // Find the JSON object boundaries
              const startIdx = toolJsonBuffer.indexOf('{"results"')
              if (startIdx >= 0) {
                // Try parsing from startIdx to each } from the end
                const sub = toolJsonBuffer.slice(startIdx)
                let lastBrace = sub.lastIndexOf('}')
                while (lastBrace >= 0) {
                  try {
                    const candidate = sub.slice(0, lastBrace + 1)
                    const parsed = JSON.parse(candidate)
                    // Success! We have the full JSON
                    handleSearchResults(JSON.stringify(parsed))
                    // Any text after goes to message
                    const afterJson = toolJsonBuffer.slice(startIdx + lastBrace + 1)
                    if (afterJson.trim()) appendToLast(afterJson)
                    toolJsonBuffer = ''
                    isCapturingToolResult = false
                    break
                  } catch {
                    lastBrace = sub.lastIndexOf('}', lastBrace - 1)
                  }
                }
              }
            }
            return
          }

          setShowToolCall(false)
          appendToLast(content)
        } else if (event.type === 'tool_call' && event.content === 'graph_search') {
          setShowToolCall(true)
          startInference()
        } else if (event.type === 'tool_call') {
          // Other tool calls (function arguments streaming) — ignore display
        } else if (event.type === 'tool_result') {
          setShowToolCall(false)
          isCapturingToolResult = false
          toolJsonBuffer = ''
        } else if (event.type === 'error') {
          appendToLast(`\n[Error: ${event.content}]`)
        }
      },
      () => {
        setStreaming(false)
        stopInference()
        setShowToolCall(false)
      },
    )
  }

  const handleSearchResults = (jsonStr: string) => {
    // Parse the JSON result from graph_search tool
    // edges field format: "srcUUID|tgtUUID|relation|srcName|tgtName;..."
    let parsed: { results?: string; edges?: string } = {}
    try {
      parsed = JSON.parse(jsonStr)
    } catch {
      return // Not valid JSON
    }

    const edgesStr = parsed.edges || ''
    if (!edgesStr) return

    const nodeIds: string[] = []
    const edgeKeys: string[] = []

    for (const part of edgesStr.split(';')) {
      const [srcId, tgtId] = part.split('|')
      if (srcId && tgtId) {
        if (!nodeIds.includes(srcId)) nodeIds.push(srcId)
        if (!nodeIds.includes(tgtId)) nodeIds.push(tgtId)
        edgeKeys.push(`${srcId}->${tgtId}`)
      }
    }

    // Don't need to build separate nodes/edges — just highlight by UUID in existing graph
    const nodes = nodeIds.map(id => ({ id, name: id, type: 'Entity' }))
    const edges = edgeKeys.map(k => {
      const [s, t] = k.split('->')
      return { source: s, target: t, name: '', fact: '' }
    })

    if (nodes.length > 0) {
      setInferenceResult({ nodes, edges })
      animateHighlights(nodeIds, edgeKeys)
    }
  }

  const animateHighlights = (nodeIds: string[], edgeKeys: string[]) => {
    // Progressive highlighting: reveal nodes and edges one by one
    let step = 0
    const interval = setInterval(() => {
      if (step >= nodeIds.length + edgeKeys.length) {
        clearInterval(interval)
        // Final state: all highlighted
        highlightPath(nodeIds, edgeKeys)
        setBreathingNode(nodeIds[0] || null)
        return
      }

      if (step < nodeIds.length) {
        // Highlight nodes progressively
        highlightPath(nodeIds.slice(0, step + 1), edgeKeys.slice(0, Math.max(0, step)))
        setBreathingNode(nodeIds[step])
      } else {
        // Then edges
        const edgeStep = step - nodeIds.length
        highlightPath(nodeIds, edgeKeys.slice(0, edgeStep + 1))
      }
      step++
    }, 300)
  }

  return (
    <div className="kg-chat">
      <div className="kg-page-header">
        <h1><MessageSquare size={18} /> Chat</h1>
        <p>Ask questions — the agent searches your knowledge graph</p>
      </div>

      <div className="kg-chat__messages">
        {messages.length === 0 ? (
          <EmptyState
            icon={<MessageSquare size={44} />}
            title="Start a conversation"
            description="Ask questions about entities, relations, or documents in your knowledge graph"
          />
        ) : (
          messages.map((msg) => (
            <MessageBubble key={msg.id} role={msg.role} content={msg.content} />
          ))
        )}
        {showToolCall && <ToolCallIndicator />}
        {isStreaming && !showToolCall && messages[messages.length - 1]?.content === '' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-muted)' }}>
            <Loader2 size={14} className="animate-spin" />
            Thinking...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="kg-chat__input-bar">
        <input
          className="kg-chat__input"
          placeholder="Ask a question..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
          disabled={isStreaming}
        />
        <button
          className="kg-chat__send"
          onClick={handleSend}
          disabled={!input.trim() || isStreaming}
        >
          {isStreaming ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </div>
    </div>
  )
}
