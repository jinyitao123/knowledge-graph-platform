import type { ChatEvent, ChatSession, ChatMessage } from '@/types/chat'

export async function fetchSessions(): Promise<ChatSession[]> {
  const res = await fetch('/api/v1/chat/sessions')
  if (!res.ok) throw new Error('Failed to fetch sessions')
  return res.json()
}

export async function fetchMessages(sessionId: string): Promise<ChatMessage[]> {
  const res = await fetch(`/api/v1/chat/sessions/${sessionId}/messages`)
  if (!res.ok) throw new Error('Failed to fetch messages')
  return res.json()
}

export function streamChat(
  message: string,
  sessionId: string,
  ontologyId: string,
  onEvent: (event: ChatEvent) => void,
  onDone: () => void,
) {
  const controller = new AbortController()

  fetch('/api/v1/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, session_id: sessionId, ontology_id: ontologyId }),
    signal: controller.signal,
  }).then(async (res) => {
    if (!res.ok || !res.body) {
      onEvent({ type: 'error', content: 'Failed to connect' })
      onDone()
      return
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      let eventType = ''
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7).trim()
        } else if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6))
            onEvent({ type: eventType as ChatEvent['type'], content: data.content || '', data: data.data })
          } catch { /* skip malformed */ }
        }
      }
    }
    onDone()
  }).catch(() => {
    onDone()
  })

  return () => controller.abort()
}
