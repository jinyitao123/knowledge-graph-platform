export interface ChatSession {
  id: string;
  ontology_id: string;
  title: string;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: "user" | "assistant";
  content: string;
  metadata: ChatMessageMetadata;
  created_at: string;
}

export interface ChatMessageMetadata {
  tool_calls?: ToolCall[];
  evidence?: Evidence[];
  reasoning_steps?: string[];
}

export interface ChatEvent {
  type: "token" | "tool_call" | "tool_result" | "done" | "error";
  content: string;
  data?: unknown;
}

export interface ToolCall {
  tool_name: string;
  input: Record<string, unknown>;
  output?: string;
}

export interface Evidence {
  source_doc: string;
  page_number: number;
  text: string;
  entity_name: string;
  confidence: number;
  valid_from?: string;
  valid_until?: string;
}
