package document

import "time"

// Document represents an uploaded document.
type Document struct {
	ID         string         `json:"id"`
	OntologyID string         `json:"ontology_id"`
	Filename   string         `json:"filename"`
	FileType   string         `json:"file_type"`
	FilePath   string         `json:"file_path"`
	Status     string         `json:"status"` // pending, processing, completed, failed
	Progress   int            `json:"progress"`
	Metadata   map[string]any `json:"metadata"`
	CreatedAt  time.Time      `json:"created_at"`
}

// IngestJob is pushed to Redis for async processing by the Python service.
type IngestJob struct {
	JobID   string         `json:"job_id"`
	Type    string         `json:"type"` // "document_ingest"
	Payload IngestPayload  `json:"payload"`
	Created time.Time      `json:"created_at"`
}

// IngestPayload contains document processing details.
type IngestPayload struct {
	DocID      string         `json:"doc_id"`
	OntologyID string         `json:"ontology_id"`
	FilePath   string         `json:"file_path"`
	FileType   string         `json:"file_type"`
	Metadata   map[string]any `json:"metadata"`
}
