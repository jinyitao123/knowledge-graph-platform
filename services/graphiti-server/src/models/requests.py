"""Pydantic request models."""

from pydantic import BaseModel, Field


class ChunkMetadata(BaseModel):
    source_doc: str = ""
    page_number: int = 0
    chunk_index: int = 0
    section_title: str = ""


class Chunk(BaseModel):
    text: str
    metadata: ChunkMetadata = ChunkMetadata()


class IngestRequest(BaseModel):
    doc_id: str
    ontology_id: str
    chunks: list[Chunk]


class SearchRequest(BaseModel):
    query: str
    ontology_id: str | None = None
    filters: dict | None = None
    top_k: int = Field(default=10, ge=1, le=100)


class EntityTypeDef(BaseModel):
    name: str
    description: str
    properties: dict = {}


class RegisterEntityTypesRequest(BaseModel):
    ontology_id: str
    types: list[EntityTypeDef]
