-- Knowledge Graph Platform — Initial Schema
-- Run against PostgreSQL 16+

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Ontologies ───────────────────────────────────────────
CREATE TABLE ontologies (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    description TEXT DEFAULT '',
    schema      JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE entity_types (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ontology_id UUID NOT NULL REFERENCES ontologies(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    description TEXT DEFAULT '',
    properties  JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(ontology_id, name)
);

CREATE TABLE relation_types (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ontology_id UUID NOT NULL REFERENCES ontologies(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    description TEXT DEFAULT '',
    source_type TEXT,
    target_type TEXT,
    properties  JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(ontology_id, name)
);

-- ── Documents ────────────────────────────────────────────
CREATE TABLE documents (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ontology_id UUID REFERENCES ontologies(id) ON DELETE SET NULL,
    filename    TEXT NOT NULL,
    file_type   TEXT NOT NULL,
    file_path   TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    progress    INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    metadata    JSONB DEFAULT '{}',
    error_msg   TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_documents_ontology ON documents(ontology_id);
CREATE INDEX idx_documents_status ON documents(status);

-- ── Chat ─────────────────────────────────────────────────
CREATE TABLE chat_sessions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ontology_id UUID REFERENCES ontologies(id) ON DELETE SET NULL,
    title       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE chat_messages (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id  UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role        TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content     TEXT NOT NULL,
    metadata    JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_messages_session ON chat_messages(session_id, created_at);

-- ── Updated_at trigger ───────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_ontologies_updated_at
    BEFORE UPDATE ON ontologies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_documents_updated_at
    BEFORE UPDATE ON documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
