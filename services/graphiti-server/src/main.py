"""FastAPI application entry point with Graphiti lifecycle management."""

from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

import structlog
from fastapi import FastAPI

from src.config import settings

logger = structlog.get_logger()

# Global Graphiti instance — initialized in lifespan
graphiti_client = None


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Initialize Graphiti on startup, close on shutdown."""
    global graphiti_client

    from graphiti_core import Graphiti
    from graphiti_core.llm_client.openai_generic_client import OpenAIGenericClient
    from graphiti_core.llm_client.config import LLMConfig
    from graphiti_core.embedder import OpenAIEmbedder, OpenAIEmbedderConfig
    from graphiti_core.cross_encoder.openai_reranker_client import OpenAIRerankerClient

    logger.info(
        "initializing graphiti",
        neo4j_uri=settings.neo4j_uri,
        llm_model=settings.llm_model,
        llm_base_url=settings.llm_base_url,
    )

    llm_config = LLMConfig(
        api_key=settings.llm_api_key,
        model=settings.llm_model,
        base_url=settings.llm_base_url,
    )

    llm_client = OpenAIGenericClient(config=llm_config)
    embedder = OpenAIEmbedder(
        config=OpenAIEmbedderConfig(
            api_key=settings.llm_api_key or "ollama",
            embedding_model=settings.embedding_model,
            base_url=settings.embedding_base_url,
        )
    )
    cross_encoder = OpenAIRerankerClient(config=llm_config)

    logger.info(
        "embedding config",
        embedding_base_url=settings.embedding_base_url,
        embedding_model=settings.embedding_model,
    )

    graphiti_client = Graphiti(
        uri=settings.neo4j_uri,
        user=settings.neo4j_user,
        password=settings.neo4j_password,
        llm_client=llm_client,
        embedder=embedder,
        cross_encoder=cross_encoder,
    )

    try:
        await graphiti_client.build_indices_and_constraints()
        logger.info("graphiti initialized successfully")
    except Exception:
        logger.exception("failed to build graphiti indices — continuing anyway")

    yield

    # Shutdown
    if graphiti_client:
        await graphiti_client.close()
        logger.info("graphiti shut down")


def create_app() -> FastAPI:
    app = FastAPI(
        title="Graphiti Server",
        description="REST API wrapper for Graphiti knowledge graph engine",
        version="0.1.0",
        lifespan=lifespan,
    )

    from src.server import router
    app.include_router(router)

    return app


app = create_app()
