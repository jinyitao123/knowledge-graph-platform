package ontology

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/your-org/knowledge-graph-platform/backend/internal/storage"
)

type Repository struct {
	Pg *storage.Postgres
}

func NewRepository(pg *storage.Postgres) *Repository {
	return &Repository{Pg: pg}
}

func (r *Repository) Create(ctx context.Context, name, description string, schema map[string]any) (*Ontology, error) {
	schemaJSON, _ := json.Marshal(schema)
	if schema == nil {
		schemaJSON = []byte("{}")
	}

	var o Ontology
	err := r.Pg.Pool.QueryRow(ctx,
		`INSERT INTO ontologies (name, description, schema) VALUES ($1, $2, $3)
		 RETURNING id, name, description, schema, created_at, updated_at`,
		name, description, schemaJSON,
	).Scan(&o.ID, &o.Name, &o.Description, &o.Schema, &o.CreatedAt, &o.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("ontology.Create: %w", err)
	}
	return &o, nil
}

func (r *Repository) Get(ctx context.Context, id string) (*Ontology, error) {
	var o Ontology
	err := r.Pg.Pool.QueryRow(ctx,
		`SELECT id, name, description, schema, created_at, updated_at FROM ontologies WHERE id = $1`, id,
	).Scan(&o.ID, &o.Name, &o.Description, &o.Schema, &o.CreatedAt, &o.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("ontology.Get: %w", err)
	}
	return &o, nil
}

func (r *Repository) List(ctx context.Context) ([]Ontology, error) {
	rows, err := r.Pg.Pool.Query(ctx,
		`SELECT id, name, description, schema, created_at, updated_at FROM ontologies ORDER BY created_at DESC`)
	if err != nil {
		return nil, fmt.Errorf("ontology.List: %w", err)
	}
	defer rows.Close()

	var list []Ontology
	for rows.Next() {
		var o Ontology
		if err := rows.Scan(&o.ID, &o.Name, &o.Description, &o.Schema, &o.CreatedAt, &o.UpdatedAt); err != nil {
			return nil, fmt.Errorf("ontology.List scan: %w", err)
		}
		list = append(list, o)
	}
	if list == nil {
		list = []Ontology{}
	}
	return list, nil
}

func (r *Repository) Update(ctx context.Context, id, name, description string, schema map[string]any) (*Ontology, error) {
	schemaJSON, _ := json.Marshal(schema)
	if schema == nil {
		schemaJSON = []byte("{}")
	}

	var o Ontology
	err := r.Pg.Pool.QueryRow(ctx,
		`UPDATE ontologies SET name = $2, description = $3, schema = $4, updated_at = now()
		 WHERE id = $1
		 RETURNING id, name, description, schema, created_at, updated_at`,
		id, name, description, schemaJSON,
	).Scan(&o.ID, &o.Name, &o.Description, &o.Schema, &o.CreatedAt, &o.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("ontology.Update: %w", err)
	}
	return &o, nil
}

func (r *Repository) Delete(ctx context.Context, id string) error {
	// Delete related records first (documents, chat_sessions reference ontology)
	_, _ = r.Pg.Pool.Exec(ctx, `DELETE FROM documents WHERE ontology_id = $1`, id)
	_, _ = r.Pg.Pool.Exec(ctx, `DELETE FROM chat_sessions WHERE ontology_id = $1`, id)
	// entity_types and relation_types cascade via ON DELETE CASCADE
	_, err := r.Pg.Pool.Exec(ctx, `DELETE FROM ontologies WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("ontology.Delete: %w", err)
	}
	return nil
}
