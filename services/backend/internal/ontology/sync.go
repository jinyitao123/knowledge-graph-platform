package ontology

import (
	"context"
	"fmt"

	"github.com/rs/zerolog/log"

	"github.com/your-org/knowledge-graph-platform/backend/internal/graphiti"
)

type Syncer struct {
	repo           *Repository
	graphitiClient *graphiti.Client
}

func NewSyncer(repo *Repository, client *graphiti.Client) *Syncer {
	return &Syncer{repo: repo, graphitiClient: client}
}

func (s *Syncer) SyncEntityTypes(ctx context.Context, ontologyID string) error {
	rows, err := s.repo.Pg.Pool.Query(ctx,
		`SELECT name, description, properties FROM entity_types WHERE ontology_id = $1`, ontologyID)
	if err != nil {
		return fmt.Errorf("ontology.SyncEntityTypes query: %w", err)
	}
	defer rows.Close()

	var types []graphiti.EntityTypeDef
	for rows.Next() {
		var name, desc string
		var props []byte
		if err := rows.Scan(&name, &desc, &props); err != nil {
			return fmt.Errorf("ontology.SyncEntityTypes scan: %w", err)
		}
		types = append(types, graphiti.EntityTypeDef{Name: name, Description: desc})
	}

	if len(types) == 0 {
		return nil
	}

	resp, err := s.graphitiClient.RegisterEntityTypes(ctx, &graphiti.RegisterEntityTypesRequest{
		OntologyID: ontologyID,
		Types:      types,
	})
	if err != nil {
		return fmt.Errorf("ontology.SyncEntityTypes register: %w", err)
	}

	log.Info().Int("registered", resp.Registered).Str("ontology_id", ontologyID).Msg("entity types synced")
	return nil
}
