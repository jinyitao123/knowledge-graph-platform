package ontology

import "time"

// Ontology represents a domain ontology with entity and relation type definitions.
type Ontology struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	Schema      []byte    `json:"schema"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// EntityType defines a type of entity within an ontology.
type EntityType struct {
	ID          string         `json:"id"`
	OntologyID  string         `json:"ontology_id"`
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Properties  map[string]any `json:"properties"`
}

// RelationType defines a type of relation between entities.
type RelationType struct {
	ID          string         `json:"id"`
	OntologyID  string         `json:"ontology_id"`
	Name        string         `json:"name"`
	Description string         `json:"description"`
	SourceType  string         `json:"source_type"`
	TargetType  string         `json:"target_type"`
	Properties  map[string]any `json:"properties"`
}
