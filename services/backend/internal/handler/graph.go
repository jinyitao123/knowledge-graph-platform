package handler

import (
	"net/http"
	"strconv"

	"github.com/your-org/knowledge-graph-platform/backend/internal/graphiti"
)

type GraphHandler struct {
	client *graphiti.Client
}

func NewGraphHandler(client *graphiti.Client) *GraphHandler {
	return &GraphHandler{client: client}
}

func (h *GraphHandler) Search(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query().Get("q")
	if query == "" {
		writeError(w, http.StatusBadRequest, "missing query parameter 'q'")
		return
	}

	ontologyID := r.URL.Query().Get("ontology_id")
	topK := 10
	if v := r.URL.Query().Get("top_k"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			topK = n
		}
	}

	resp, err := h.client.Search(r.Context(), &graphiti.SearchRequest{
		Query:      query,
		OntologyID: ontologyID,
		TopK:       topK,
	})
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func (h *GraphHandler) GetSubgraph(w http.ResponseWriter, r *http.Request) {
	entityID := r.PathValue("entity_id")
	hops := 2
	if v := r.URL.Query().Get("hops"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			hops = n
		}
	}

	resp, err := h.client.GetSubgraph(r.Context(), entityID, hops)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func (h *GraphHandler) GetEntity(w http.ResponseWriter, r *http.Request) {
	// Phase 2: implement entity detail via Graphiti
	writeJSON(w, http.StatusOK, map[string]string{"status": "not_implemented"})
}

func (h *GraphHandler) InstanceGraph(w http.ResponseWriter, r *http.Request) {
	// Proxy to Graphiti service
	limit := r.URL.Query().Get("limit")
	if limit == "" {
		limit = "200"
	}
	path := "/api/v1/instance-graph?limit=" + limit
	var resp map[string]any
	if err := h.client.GetJSON(r.Context(), path, &resp); err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func (h *GraphHandler) Stats(w http.ResponseWriter, r *http.Request) {
	// Phase 2: implement graph stats
	writeJSON(w, http.StatusOK, map[string]any{
		"entities": 0, "relations": 0, "episodes": 0,
	})
}
