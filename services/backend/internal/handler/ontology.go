package handler

import (
	"encoding/json"
	"io"
	"net/http"

	"github.com/rs/zerolog/log"

	"github.com/your-org/knowledge-graph-platform/backend/internal/graphiti"
	"github.com/your-org/knowledge-graph-platform/backend/internal/ontology"
	"github.com/your-org/knowledge-graph-platform/backend/internal/storage"
)

type OntologyHandler struct {
	repo     *ontology.Repository
	importer *ontology.Importer
}

func NewOntologyHandler(pg *storage.Postgres, graphitiClient *graphiti.Client) *OntologyHandler {
	return &OntologyHandler{
		repo:     ontology.NewRepository(pg),
		importer: ontology.NewImporter(pg, graphitiClient),
	}
}

func (h *OntologyHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name        string         `json:"name"`
		Description string         `json:"description"`
		Schema      map[string]any `json:"schema"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	o, err := h.repo.Create(r.Context(), req.Name, req.Description, req.Schema)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, o)
}

func (h *OntologyHandler) List(w http.ResponseWriter, r *http.Request) {
	list, err := h.repo.List(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, list)
}

func (h *OntologyHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	o, err := h.repo.Get(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusNotFound, "ontology not found")
		return
	}
	writeJSON(w, http.StatusOK, o)
}

func (h *OntologyHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var req struct {
		Name        string         `json:"name"`
		Description string         `json:"description"`
		Schema      map[string]any `json:"schema"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	o, err := h.repo.Update(r.Context(), id, req.Name, req.Description, req.Schema)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, o)
}

func (h *OntologyHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if err := h.repo.Delete(r.Context(), id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"deleted": true})
}

// ImportYAML handles POST /api/v1/ontologies/:id/import
// Accepts otoly YAML body → parses → stores entity/relation types → syncs to Graphiti.
func (h *OntologyHandler) ImportYAML(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	body, err := io.ReadAll(r.Body)
	if err != nil {
		writeError(w, http.StatusBadRequest, "failed to read request body")
		return
	}

	if err := h.importer.ImportYAML(r.Context(), id, body); err != nil {
		log.Error().Err(err).Str("ontology_id", id).Msg("yaml import failed")
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"imported": true, "ontology_id": id})
}

// ImportOWL handles POST /api/v1/ontologies/:id/import-owl
// Accepts OWL/RDF/Turtle body → sends to Python for parsing → stores entity/relation types.
func (h *OntologyHandler) ImportOWL(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	body, err := io.ReadAll(r.Body)
	if err != nil {
		writeError(w, http.StatusBadRequest, "failed to read request body")
		return
	}

	// Detect format from Content-Type or filename
	format := "xml"
	ct := r.Header.Get("Content-Type")
	switch {
	case ct == "text/turtle" || ct == "application/x-turtle":
		format = "turtle"
	case ct == "application/ld+json":
		format = "json-ld"
	case ct == "application/rdf+xml" || ct == "application/owl+xml":
		format = "xml"
	default:
		// Sniff from content
		s := string(body[:min(200, len(body))])
		if len(s) > 0 && s[0] == '@' || len(s) > 5 && s[:5] == "@pref" {
			format = "turtle"
		} else if len(s) > 0 && s[0] == '{' {
			format = "json-ld"
		}
	}

	if err := h.importer.ImportOWL(r.Context(), id, body, format); err != nil {
		log.Error().Err(err).Str("ontology_id", id).Msg("owl import failed")
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"imported": true, "ontology_id": id, "format": format})
}

// ListEntityTypes handles GET /api/v1/ontologies/:id/entity-types
func (h *OntologyHandler) ListEntityTypes(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	rows, err := h.repo.Pg.Pool.Query(r.Context(),
		`SELECT id, name, description, properties FROM entity_types WHERE ontology_id = $1 ORDER BY name`, id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	var types []map[string]any
	for rows.Next() {
		var eid, name, desc string
		var props []byte
		if err := rows.Scan(&eid, &name, &desc, &props); err != nil {
			continue
		}
		entry := map[string]any{"id": eid, "name": name, "description": desc}
		var p map[string]any
		if json.Unmarshal(props, &p) == nil {
			entry["properties"] = p
		}
		types = append(types, entry)
	}
	if types == nil {
		types = []map[string]any{}
	}
	writeJSON(w, http.StatusOK, types)
}

// ListRelationTypes handles GET /api/v1/ontologies/:id/relation-types
func (h *OntologyHandler) ListRelationTypes(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	rows, err := h.repo.Pg.Pool.Query(r.Context(),
		`SELECT id, name, description, source_type, target_type, properties FROM relation_types WHERE ontology_id = $1 ORDER BY name`, id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	var types []map[string]any
	for rows.Next() {
		var rid, name, desc, src, tgt string
		var props []byte
		if err := rows.Scan(&rid, &name, &desc, &src, &tgt, &props); err != nil {
			continue
		}
		entry := map[string]any{"id": rid, "name": name, "description": desc, "source_type": src, "target_type": tgt}
		var p map[string]any
		if json.Unmarshal(props, &p) == nil {
			entry["properties"] = p
		}
		types = append(types, entry)
	}
	if types == nil {
		types = []map[string]any{}
	}
	writeJSON(w, http.StatusOK, types)
}

// GetOntologyContext handles GET /api/v1/ontologies/:id/context — returns text summary for Agent.
func (h *OntologyHandler) GetOntologyContext(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	ctx, err := h.importer.GetOntologyContext(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"context": ctx})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
