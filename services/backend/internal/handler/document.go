package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/rs/zerolog/log"

	"github.com/your-org/knowledge-graph-platform/backend/internal/storage"
)

type DocumentHandler struct {
	pg    *storage.Postgres
	minio *storage.MinIO
	redis *storage.Redis
}

func NewDocumentHandler(pg *storage.Postgres, minio *storage.MinIO, redis *storage.Redis) *DocumentHandler {
	return &DocumentHandler{pg: pg, minio: minio, redis: redis}
}

func (h *DocumentHandler) Upload(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		writeError(w, http.StatusBadRequest, "invalid multipart form")
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "missing file field")
		return
	}
	defer file.Close()

	ontologyID := r.FormValue("ontology_id")
	if ontologyID == "" {
		writeError(w, http.StatusBadRequest, "missing ontology_id")
		return
	}

	// Store file in MinIO
	objectName := fmt.Sprintf("documents/%d_%s", time.Now().UnixMilli(), header.Filename)
	if err := h.minio.Upload(r.Context(), objectName, file, header.Size, header.Header.Get("Content-Type")); err != nil {
		log.Error().Err(err).Msg("minio upload failed")
		writeError(w, http.StatusInternalServerError, "file upload failed")
		return
	}

	// Insert document record
	var docID string
	err = h.pg.Pool.QueryRow(r.Context(),
		`INSERT INTO documents (ontology_id, filename, file_type, file_path, status)
		 VALUES ($1, $2, $3, $4, 'pending') RETURNING id`,
		ontologyID, header.Filename, header.Header.Get("Content-Type"), objectName,
	).Scan(&docID)
	if err != nil {
		log.Error().Err(err).Msg("document insert failed")
		writeError(w, http.StatusInternalServerError, "failed to create document record")
		return
	}

	// Push job to Redis
	job, _ := json.Marshal(map[string]any{
		"job_id": docID,
		"type":   "document_ingest",
		"payload": map[string]string{
			"doc_id":      docID,
			"ontology_id": ontologyID,
			"file_path":   objectName,
			"file_type":   header.Header.Get("Content-Type"),
		},
		"created_at": time.Now().UTC().Format(time.RFC3339),
	})
	if err := h.redis.PushJob(r.Context(), string(job)); err != nil {
		log.Error().Err(err).Msg("redis push failed")
	}

	writeJSON(w, http.StatusCreated, map[string]string{
		"id":       docID,
		"filename": header.Filename,
		"status":   "pending",
	})
}

func (h *DocumentHandler) List(w http.ResponseWriter, r *http.Request) {
	rows, err := h.pg.Pool.Query(r.Context(),
		`SELECT id, ontology_id, filename, file_type, status, progress, created_at FROM documents ORDER BY created_at DESC`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	var docs []map[string]any
	for rows.Next() {
		var id, ontologyID, filename, fileType, status string
		var progress int
		var createdAt time.Time
		if err := rows.Scan(&id, &ontologyID, &filename, &fileType, &status, &progress, &createdAt); err != nil {
			continue
		}
		docs = append(docs, map[string]any{
			"id": id, "ontology_id": ontologyID, "filename": filename,
			"file_type": fileType, "status": status, "progress": progress,
			"created_at": createdAt,
		})
	}
	if docs == nil {
		docs = []map[string]any{}
	}
	writeJSON(w, http.StatusOK, docs)
}

func (h *DocumentHandler) GetStatus(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var status string
	var progress int
	err := h.pg.Pool.QueryRow(r.Context(),
		`SELECT status, progress FROM documents WHERE id = $1`, id,
	).Scan(&status, &progress)
	if err != nil {
		writeError(w, http.StatusNotFound, "document not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"id": id, "status": status, "progress": progress})
}

func (h *DocumentHandler) UpdateStatus(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var req struct {
		Status   string `json:"status"`
		Progress int    `json:"progress"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	_, err := h.pg.Pool.Exec(r.Context(),
		`UPDATE documents SET status = $2, progress = $3, updated_at = now() WHERE id = $1`,
		id, req.Status, req.Progress)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"id": id, "status": req.Status, "progress": req.Progress})
}
