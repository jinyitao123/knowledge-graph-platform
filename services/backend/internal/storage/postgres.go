package storage

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog/log"
)

type Postgres struct {
	Pool *pgxpool.Pool
}

func NewPostgres(ctx context.Context, databaseURL string) (*Postgres, error) {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, fmt.Errorf("storage.NewPostgres: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("storage.NewPostgres ping: %w", err)
	}

	log.Info().Msg("postgresql connected")
	return &Postgres{Pool: pool}, nil
}

func (p *Postgres) RunMigrations(ctx context.Context) error {
	migration := `
	CREATE EXTENSION IF NOT EXISTS pgcrypto;

	CREATE TABLE IF NOT EXISTS ontologies (
		id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		name        TEXT NOT NULL,
		description TEXT DEFAULT '',
		schema      JSONB NOT NULL DEFAULT '{}',
		created_at  TIMESTAMPTZ DEFAULT now(),
		updated_at  TIMESTAMPTZ DEFAULT now()
	);

	CREATE TABLE IF NOT EXISTS entity_types (
		id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		ontology_id UUID REFERENCES ontologies(id) ON DELETE CASCADE,
		name        TEXT NOT NULL,
		description TEXT DEFAULT '',
		properties  JSONB DEFAULT '{}',
		UNIQUE(ontology_id, name)
	);

	CREATE TABLE IF NOT EXISTS relation_types (
		id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		ontology_id   UUID REFERENCES ontologies(id) ON DELETE CASCADE,
		name          TEXT NOT NULL,
		description   TEXT DEFAULT '',
		source_type   TEXT DEFAULT '',
		target_type   TEXT DEFAULT '',
		properties    JSONB DEFAULT '{}',
		UNIQUE(ontology_id, name)
	);

	CREATE TABLE IF NOT EXISTS documents (
		id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		ontology_id UUID REFERENCES ontologies(id),
		filename    TEXT NOT NULL,
		file_type   TEXT NOT NULL,
		file_path   TEXT NOT NULL,
		status      TEXT DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed')),
		progress    INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
		metadata    JSONB DEFAULT '{}',
		created_at  TIMESTAMPTZ DEFAULT now(),
		updated_at  TIMESTAMPTZ DEFAULT now()
	);

	CREATE TABLE IF NOT EXISTS chat_sessions (
		id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		ontology_id UUID REFERENCES ontologies(id),
		title       TEXT DEFAULT '',
		created_at  TIMESTAMPTZ DEFAULT now()
	);

	CREATE TABLE IF NOT EXISTS chat_messages (
		id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		session_id  UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
		role        TEXT NOT NULL CHECK (role IN ('user','assistant','system','tool')),
		content     TEXT NOT NULL,
		metadata    JSONB DEFAULT '{}',
		created_at  TIMESTAMPTZ DEFAULT now()
	);
	`

	_, err := p.Pool.Exec(ctx, migration)
	if err != nil {
		return fmt.Errorf("storage.RunMigrations: %w", err)
	}

	log.Info().Msg("database migrations applied")
	return nil
}

func (p *Postgres) Close() {
	p.Pool.Close()
}
