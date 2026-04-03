package ontology

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"github.com/rs/zerolog/log"
	"gopkg.in/yaml.v3"

	"github.com/your-org/knowledge-graph-platform/backend/internal/graphiti"
	"github.com/your-org/knowledge-graph-platform/backend/internal/storage"
)

// OtologyYAML represents the top-level otoly YAML structure.
type OtologyYAML struct {
	Ontology OntologyDef `yaml:"ontology"`
}

type OntologyDef struct {
	Name          string          `yaml:"name"`
	ID            string          `yaml:"id"`
	Version       string          `yaml:"version"`
	Description   string          `yaml:"description"`
	Classes       []ClassDef      `yaml:"classes"`
	Relationships []RelDef        `yaml:"relationships"`
	Metrics       []MetricDef     `yaml:"metrics"`
	Rules         []RuleDef       `yaml:"rules"`
	Actions       []ActionDef     `yaml:"actions"`
	Functions     []FunctionDef   `yaml:"functions"`
}

type ClassDef struct {
	ID           string         `yaml:"id"`
	Name         string         `yaml:"name"`
	Description  string         `yaml:"description"`
	FirstCitizen bool           `yaml:"first_citizen"`
	Phase        string         `yaml:"phase"`
	ImportedFrom string         `yaml:"imported_from"`
	Attributes   []AttributeDef `yaml:"attributes"`
}

type AttributeDef struct {
	ID           string   `yaml:"id"`
	Name         string   `yaml:"name"`
	Type         string   `yaml:"type"`
	Required     bool     `yaml:"required"`
	Unique       bool     `yaml:"unique"`
	Default      any      `yaml:"default"`
	Derived      string   `yaml:"derived"`
	Configurable bool     `yaml:"configurable"`
	EnumValues   []string `yaml:"enum_values"`
	Unit         string   `yaml:"unit"`
	Description  string   `yaml:"description"`
	Phase        string   `yaml:"phase"`
}

type RelDef struct {
	ID             string         `yaml:"id"`
	Name           string         `yaml:"name"`
	From           string         `yaml:"from"`
	To             string         `yaml:"to"`
	Cardinality    string         `yaml:"cardinality"`
	Required       bool           `yaml:"required"`
	Phase          string         `yaml:"phase"`
	Description    string         `yaml:"description"`
	EdgeAttributes []AttributeDef `yaml:"edge_attributes"`
}

type MetricDef struct {
	ID          string `yaml:"id"`
	Name        string `yaml:"name"`
	Description string `yaml:"description"`
	Kind        string `yaml:"kind"`
	Formula     string `yaml:"formula"`
	Phase       string `yaml:"phase"`
}

type RuleDef struct {
	ID          string `yaml:"id"`
	Name        string `yaml:"name"`
	Description string `yaml:"description"`
	Severity    string `yaml:"severity"`
	Phase       string `yaml:"phase"`
}

type ActionDef struct {
	ID          string `yaml:"id"`
	Name        string `yaml:"name"`
	Description string `yaml:"description"`
	Phase       string `yaml:"phase"`
}

type FunctionDef struct {
	ID          string `yaml:"id"`
	Name        string `yaml:"name"`
	Description string `yaml:"description"`
	Phase       string `yaml:"phase"`
}

// Importer handles ontology YAML import into the platform.
type Importer struct {
	pg             *storage.Postgres
	graphitiClient *graphiti.Client
}

func NewImporter(pg *storage.Postgres, graphitiClient *graphiti.Client) *Importer {
	return &Importer{pg: pg, graphitiClient: graphitiClient}
}

// ImportYAML parses an otoly YAML and saves it as an ontology with entity/relation types.
func (imp *Importer) ImportYAML(ctx context.Context, ontologyID string, yamlData []byte) error {
	var doc OtologyYAML
	if err := yaml.Unmarshal(yamlData, &doc); err != nil {
		return fmt.Errorf("ontology.ImportYAML parse: %w", err)
	}

	ont := doc.Ontology

	// Update ontology metadata
	schemaJSON, _ := json.Marshal(map[string]any{
		"yaml_id":     ont.ID,
		"version":     ont.Version,
		"class_count": len(ont.Classes),
		"rel_count":   len(ont.Relationships),
	})
	_, err := imp.pg.Pool.Exec(ctx,
		`UPDATE ontologies SET name = $2, description = $3, schema = $4, updated_at = now() WHERE id = $1`,
		ontologyID, ont.Name, ont.Description, schemaJSON)
	if err != nil {
		return fmt.Errorf("ontology.ImportYAML update: %w", err)
	}

	// Clear existing types for this ontology
	_, _ = imp.pg.Pool.Exec(ctx, `DELETE FROM entity_types WHERE ontology_id = $1`, ontologyID)
	_, _ = imp.pg.Pool.Exec(ctx, `DELETE FROM relation_types WHERE ontology_id = $1`, ontologyID)

	// Insert entity types from classes
	for _, cls := range ont.Classes {
		propsJSON, _ := json.Marshal(map[string]any{
			"yaml_class_id": cls.ID,
			"first_citizen":  cls.FirstCitizen,
			"phase":          cls.Phase,
			"imported_from":  cls.ImportedFrom,
			"attributes":     cls.Attributes,
		})
		_, err := imp.pg.Pool.Exec(ctx,
			`INSERT INTO entity_types (ontology_id, name, description, properties) VALUES ($1, $2, $3, $4)
			 ON CONFLICT (ontology_id, name) DO UPDATE SET description = $3, properties = $4`,
			ontologyID, cls.Name, cls.Description, propsJSON)
		if err != nil {
			log.Error().Err(err).Str("class", cls.ID).Msg("failed to insert entity type")
		}
	}

	// Insert relation types from relationships
	for _, rel := range ont.Relationships {
		propsJSON, _ := json.Marshal(map[string]any{
			"cardinality":     rel.Cardinality,
			"required":        rel.Required,
			"phase":           rel.Phase,
			"edge_attributes": rel.EdgeAttributes,
		})
		_, err := imp.pg.Pool.Exec(ctx,
			`INSERT INTO relation_types (ontology_id, name, description, source_type, target_type, properties) VALUES ($1, $2, $3, $4, $5, $6)
			 ON CONFLICT (ontology_id, name) DO UPDATE SET description = $3, source_type = $4, target_type = $5, properties = $6`,
			ontologyID, rel.Name, rel.Description, rel.From, rel.To, propsJSON)
		if err != nil {
			log.Error().Err(err).Str("rel", rel.ID).Msg("failed to insert relation type")
		}
	}

	// Sync entity types to Graphiti
	if err := imp.syncToGraphiti(ctx, ontologyID, ont); err != nil {
		log.Error().Err(err).Msg("graphiti sync failed (non-fatal)")
	}

	log.Info().
		Str("ontology_id", ontologyID).
		Int("classes", len(ont.Classes)).
		Int("relationships", len(ont.Relationships)).
		Msg("ontology YAML imported")

	return nil
}

// syncToGraphiti registers entity types with the Graphiti service.
func (imp *Importer) syncToGraphiti(ctx context.Context, ontologyID string, ont OntologyDef) error {
	if imp.graphitiClient == nil {
		return nil
	}

	var types []graphiti.EntityTypeDef
	for _, cls := range ont.Classes {
		types = append(types, graphiti.EntityTypeDef{
			Name:        cls.Name,
			Description: cls.Description,
		})
	}

	if len(types) == 0 {
		return nil
	}

	_, err := imp.graphitiClient.RegisterEntityTypes(ctx, &graphiti.RegisterEntityTypesRequest{
		OntologyID: ontologyID,
		Types:      types,
	})
	return err
}

// ImportOWL sends OWL data to the Python service for parsing, then stores results.
func (imp *Importer) ImportOWL(ctx context.Context, ontologyID string, owlData []byte, format string) error {
	if imp.graphitiClient == nil {
		return fmt.Errorf("graphiti client not configured")
	}

	// Call Python /api/v1/parse-owl
	payload, _ := json.Marshal(map[string]string{
		"data":   string(owlData),
		"format": format,
	})

	var parsed struct {
		Name          string `json:"name"`
		Description   string `json:"description"`
		Classes       []struct {
			ID          string `json:"id"`
			Name        string `json:"name"`
			Description string `json:"description"`
			Superclasses []string `json:"superclasses"`
			Attributes  []struct {
				ID          string `json:"id"`
				Name        string `json:"name"`
				Type        string `json:"type"`
				Description string `json:"description"`
				Required    bool   `json:"required"`
			} `json:"attributes"`
		} `json:"classes"`
		Relationships []struct {
			ID          string `json:"id"`
			Name        string `json:"name"`
			Description string `json:"description"`
			From        string `json:"from"`
			To          string `json:"to"`
			Cardinality string `json:"cardinality"`
			InverseOf   string `json:"inverse_of"`
		} `json:"relationships"`
	}

	// HTTP POST to graphiti-server
	import_url := imp.graphitiClient.BaseURL() + "/api/v1/parse-owl"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, import_url, bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("ontology.ImportOWL request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("ontology.ImportOWL call: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("ontology.ImportOWL HTTP %d: %s", resp.StatusCode, string(body))
	}

	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return fmt.Errorf("ontology.ImportOWL decode: %w", err)
	}

	// Update ontology metadata
	schemaJSON, _ := json.Marshal(map[string]any{
		"owl_name":    parsed.Name,
		"class_count": len(parsed.Classes),
		"rel_count":   len(parsed.Relationships),
		"format":      "owl",
	})
	_, _ = imp.pg.Pool.Exec(ctx,
		`UPDATE ontologies SET name = COALESCE(NULLIF($2, ''), name), description = COALESCE(NULLIF($3, ''), description), schema = $4, updated_at = now() WHERE id = $1`,
		ontologyID, parsed.Name, parsed.Description, schemaJSON)

	// Clear and insert
	_, _ = imp.pg.Pool.Exec(ctx, `DELETE FROM entity_types WHERE ontology_id = $1`, ontologyID)
	_, _ = imp.pg.Pool.Exec(ctx, `DELETE FROM relation_types WHERE ontology_id = $1`, ontologyID)

	for _, cls := range parsed.Classes {
		propsJSON, _ := json.Marshal(map[string]any{
			"superclasses": cls.Superclasses,
			"attributes":   cls.Attributes,
			"format":       "owl",
		})
		_, _ = imp.pg.Pool.Exec(ctx,
			`INSERT INTO entity_types (ontology_id, name, description, properties) VALUES ($1, $2, $3, $4)
			 ON CONFLICT (ontology_id, name) DO UPDATE SET description = $3, properties = $4`,
			ontologyID, cls.Name, cls.Description, propsJSON)
	}

	for _, rel := range parsed.Relationships {
		propsJSON, _ := json.Marshal(map[string]any{
			"cardinality": rel.Cardinality,
			"inverse_of":  rel.InverseOf,
			"format":      "owl",
		})
		_, _ = imp.pg.Pool.Exec(ctx,
			`INSERT INTO relation_types (ontology_id, name, description, source_type, target_type, properties) VALUES ($1, $2, $3, $4, $5, $6)
			 ON CONFLICT (ontology_id, name) DO UPDATE SET description = $3, source_type = $4, target_type = $5, properties = $6`,
			ontologyID, rel.Name, rel.Description, rel.From, rel.To, propsJSON)
	}

	// Sync to Graphiti
	var entityTypes []graphiti.EntityTypeDef
	for _, cls := range parsed.Classes {
		entityTypes = append(entityTypes, graphiti.EntityTypeDef{Name: cls.Name, Description: cls.Description})
	}
	if len(entityTypes) > 0 {
		_, _ = imp.graphitiClient.RegisterEntityTypes(ctx, &graphiti.RegisterEntityTypesRequest{
			OntologyID: ontologyID,
			Types:      entityTypes,
		})
	}

	log.Info().
		Str("ontology_id", ontologyID).
		Int("classes", len(parsed.Classes)).
		Int("relationships", len(parsed.Relationships)).
		Msg("OWL ontology imported")

	return nil
}

// GetOntologyContext returns a text summary of the ontology for Agent system prompts.
func (imp *Importer) GetOntologyContext(ctx context.Context, ontologyID string) (string, error) {
	if ontologyID == "" {
		return "", nil
	}

	rows, err := imp.pg.Pool.Query(ctx,
		`SELECT name, description, properties FROM entity_types WHERE ontology_id = $1`, ontologyID)
	if err != nil {
		return "", err
	}
	defer rows.Close()

	var context string
	context = "Current ontology entity types:\n"
	for rows.Next() {
		var name, desc string
		var props []byte
		if err := rows.Scan(&name, &desc, &props); err != nil {
			continue
		}
		context += fmt.Sprintf("- %s: %s\n", name, desc)
	}

	rows2, err := imp.pg.Pool.Query(ctx,
		`SELECT name, description, source_type, target_type FROM relation_types WHERE ontology_id = $1`, ontologyID)
	if err != nil {
		return context, nil
	}
	defer rows2.Close()

	context += "\nRelation types:\n"
	for rows2.Next() {
		var name, desc, src, tgt string
		if err := rows2.Scan(&name, &desc, &src, &tgt); err != nil {
			continue
		}
		context += fmt.Sprintf("- %s (%s → %s): %s\n", name, src, tgt, desc)
	}

	return context, nil
}
