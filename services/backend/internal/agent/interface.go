package agent

import "context"

// ChatRequest represents an incoming chat message.
type ChatRequest struct {
	SessionID  string `json:"session_id"`
	Message    string `json:"message"`
	OntologyID string `json:"ontology_id"`
}

// ChatEvent represents a streaming event from the agent.
type ChatEvent struct {
	Type    string `json:"type"`    // "token", "tool_call", "tool_result", "done", "error"
	Content string `json:"content"` // text content for token events
	Data    any    `json:"data,omitempty"`
}

// Agent is the core interface for chat/QA functionality.
// Eino ADK implements this today; can be swapped without touching handlers.
type Agent interface {
	// Chat processes a message and returns a channel of streaming events.
	Chat(ctx context.Context, req ChatRequest) (<-chan ChatEvent, error)
}
