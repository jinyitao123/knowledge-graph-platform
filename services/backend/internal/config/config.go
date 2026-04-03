package config

import "os"

type Config struct {
	// Server
	Port string

	// Database
	PostgresURL string

	// Redis
	RedisURL string

	// MinIO
	MinioEndpoint  string
	MinioAccessKey string
	MinioSecretKey string
	MinioBucket    string

	// Graphiti service
	GraphitiServiceURL string

	// LLM
	LLMAPIKey  string
	LLMBaseURL string
	LLMModel   string
}

func Load() *Config {
	return &Config{
		Port:               envOr("PORT", "8080"),
		PostgresURL:        envOr("POSTGRES_URL", "postgresql://postgres:postgres@postgres:5432/kgplatform"),
		RedisURL:           envOr("REDIS_URL", "redis://redis:6379/0"),
		MinioEndpoint:      envOr("MINIO_ENDPOINT", "minio:9000"),
		MinioAccessKey:     envOr("MINIO_ACCESS_KEY", "minioadmin"),
		MinioSecretKey:     envOr("MINIO_SECRET_KEY", "minioadmin"),
		MinioBucket:        envOr("MINIO_BUCKET", "documents"),
		GraphitiServiceURL: envOr("GRAPHITI_SERVICE_URL", "http://graphiti-server:8100"),
		LLMAPIKey:          envOr("LLM_API_KEY", ""),
		LLMBaseURL:         envOr("LLM_BASE_URL", "https://api.deepseek.com"),
		LLMModel:           envOr("LLM_MODEL", "deepseek-chat"),
	}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
