"""Application configuration from environment variables."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # LLM (DeepSeek)
    llm_api_key: str = ""
    llm_base_url: str = "https://api.deepseek.com"
    llm_model: str = "deepseek-chat"

    # Embedding (Ollama)
    embedding_base_url: str = "http://host.docker.internal:11434/v1"
    embedding_model: str = "qwen3-embedding:0.6b"

    # Neo4j
    neo4j_uri: str = "bolt://neo4j:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "graphiti_dev"

    # Redis
    redis_url: str = "redis://redis:6379/0"

    # MinIO
    minio_endpoint: str = "minio:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"
    minio_bucket: str = "documents"

    # Server
    host: str = "0.0.0.0"
    port: int = 8100
    log_level: str = "info"

    model_config = {"env_prefix": "", "case_sensitive": False}


settings = Settings()
