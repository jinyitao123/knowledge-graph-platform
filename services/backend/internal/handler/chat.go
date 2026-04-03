package handler

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/rs/zerolog/log"

	"github.com/your-org/knowledge-graph-platform/backend/internal/agent"
	"github.com/your-org/knowledge-graph-platform/backend/internal/storage"
)

type ChatHandler struct {
	agent agent.Agent
	pg    *storage.Postgres
}

func NewChatHandler(a agent.Agent, pg *storage.Postgres) *ChatHandler {
	return &ChatHandler{agent: a, pg: pg}
}

func (h *ChatHandler) HandleChat(w http.ResponseWriter, r *http.Request) {
	var req agent.ChatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if h.agent == nil {
		writeError(w, http.StatusServiceUnavailable, "agent not configured")
		return
	}

	// SSE headers
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, http.StatusInternalServerError, "streaming not supported")
		return
	}

	events, err := h.agent.Chat(r.Context(), req)
	if err != nil {
		log.Error().Err(err).Msg("agent chat failed")
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	for event := range events {
		data, _ := json.Marshal(event)
		fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event.Type, data)
		flusher.Flush()
	}
}

func (h *ChatHandler) ListSessions(w http.ResponseWriter, r *http.Request) {
	rows, err := h.pg.Pool.Query(r.Context(),
		`SELECT id, ontology_id, title, created_at FROM chat_sessions ORDER BY created_at DESC`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	var sessions []map[string]any
	for rows.Next() {
		var id, ontologyID, title string
		var createdAt any
		if err := rows.Scan(&id, &ontologyID, &title, &createdAt); err != nil {
			continue
		}
		sessions = append(sessions, map[string]any{
			"id": id, "ontology_id": ontologyID, "title": title, "created_at": createdAt,
		})
	}
	if sessions == nil {
		sessions = []map[string]any{}
	}
	writeJSON(w, http.StatusOK, sessions)
}

func (h *ChatHandler) GetMessages(w http.ResponseWriter, r *http.Request) {
	sessionID := r.PathValue("id")
	rows, err := h.pg.Pool.Query(r.Context(),
		`SELECT id, role, content, created_at FROM chat_messages WHERE session_id = $1 ORDER BY created_at`, sessionID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	var messages []map[string]any
	for rows.Next() {
		var id, role, content string
		var createdAt any
		if err := rows.Scan(&id, &role, &content, &createdAt); err != nil {
			continue
		}
		messages = append(messages, map[string]any{
			"id": id, "role": role, "content": content, "created_at": createdAt,
		})
	}
	if messages == nil {
		messages = []map[string]any{}
	}
	writeJSON(w, http.StatusOK, messages)
}
