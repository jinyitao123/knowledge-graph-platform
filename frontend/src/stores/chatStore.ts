import { create } from 'zustand'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

interface ChatStore {
  messages: Message[]
  isStreaming: boolean
  sessionId: string
  addMessage: (msg: Message) => void
  appendToLast: (text: string) => void
  setStreaming: (v: boolean) => void
  setSessionId: (id: string) => void
  clearMessages: () => void
}

export const useChatStore = create<ChatStore>((set) => ({
  messages: [],
  isStreaming: false,
  sessionId: '',
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  appendToLast: (text) =>
    set((s) => {
      const msgs = [...s.messages]
      if (msgs.length > 0) {
        msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content: msgs[msgs.length - 1].content + text }
      }
      return { messages: msgs }
    }),
  setStreaming: (v) => set({ isStreaming: v }),
  setSessionId: (id) => set({ sessionId: id }),
  clearMessages: () => set({ messages: [] }),
}))
