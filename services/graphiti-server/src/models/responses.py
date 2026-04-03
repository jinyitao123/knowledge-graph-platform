"""Pydantic response models."""

from pydantic import BaseModel


class IngestResponse(BaseModel):
    episode_ids: list[str]
    entities_extracted: int
    relations_extracted: int


class SearchResultItem(BaseModel):
    entity: dict
    relations: list[dict] = []
    score: float = 0.0
    evidence: str = ""


class SearchResponse(BaseModel):
    results: list[SearchResultItem]


class RegisterEntityTypesResponse(BaseModel):
    registered: int


class EntityItem(BaseModel):
    uuid: str
    name: str
    entity_type: str = ""
    properties: dict = {}


class EntitiesResponse(BaseModel):
    entities: list[EntityItem]
    total: int
    page: int
    size: int


class SubgraphNode(BaseModel):
    uuid: str
    name: str
    entity_type: str = ""


class SubgraphEdge(BaseModel):
    uuid: str
    source: str
    target: str
    relation_type: str = ""
    fact: str = ""


class SubgraphResponse(BaseModel):
    nodes: list[SubgraphNode]
    edges: list[SubgraphEdge]


class HealthResponse(BaseModel):
    status: str = "ok"
    service: str = "graphiti-server"
    neo4j: str = "unknown"
