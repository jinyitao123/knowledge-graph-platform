"""Custom exception hierarchy for the Graphiti service."""

class GraphitiServiceError(Exception):
    """Base exception for this service."""

class IngestionError(GraphitiServiceError):
    """Failed to ingest document/chunk."""

class SearchError(GraphitiServiceError):
    """Search operation failed."""

class OntologyError(GraphitiServiceError):
    """Ontology registration/validation failed."""

class DocumentParseError(GraphitiServiceError):
    """Failed to parse uploaded document."""
