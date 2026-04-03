"""OWL/RDF ontology parser — extracts classes, properties, and relations using rdflib."""

import structlog
from rdflib import Graph, RDF, RDFS, OWL, XSD, Namespace
from rdflib.term import URIRef

logger = structlog.get_logger()

# Common XSD → simple type mapping
XSD_TYPE_MAP = {
    str(XSD.string): "string",
    str(XSD.integer): "integer",
    str(XSD.int): "integer",
    str(XSD.long): "integer",
    str(XSD.float): "decimal",
    str(XSD.double): "decimal",
    str(XSD.decimal): "decimal",
    str(XSD.boolean): "boolean",
    str(XSD.date): "date",
    str(XSD.dateTime): "datetime",
    str(XSD.anyURI): "string",
}


def _local_name(uri: URIRef | str) -> str:
    """Extract local name from URI (after # or last /)."""
    s = str(uri)
    if "#" in s:
        return s.rsplit("#", 1)[1]
    return s.rsplit("/", 1)[-1]


def _get_label(g: Graph, uri: URIRef) -> str:
    """Get rdfs:label or fall back to local name."""
    for label in g.objects(uri, RDFS.label):
        return str(label)
    return _local_name(uri)


def _get_comment(g: Graph, uri: URIRef) -> str:
    """Get rdfs:comment."""
    for comment in g.objects(uri, RDFS.comment):
        return str(comment)
    return ""


def parse_owl(data: bytes, format_hint: str = "xml") -> dict:
    """Parse OWL/RDF data and return structured ontology definition.

    Args:
        data: Raw bytes of the OWL file
        format_hint: rdflib format — "xml" for RDF/XML, "turtle" for .ttl, "json-ld" for JSON-LD

    Returns:
        dict with keys: name, description, classes[], relationships[]
    """
    g = Graph()
    g.parse(data=data, format=format_hint)

    logger.info("owl parsed", triples=len(g), format=format_hint)

    # Extract ontology metadata
    ont_name = "Imported OWL Ontology"
    ont_desc = ""
    for ont_uri in g.subjects(RDF.type, OWL.Ontology):
        ont_name = _get_label(g, ont_uri) or _local_name(ont_uri)
        ont_desc = _get_comment(g, ont_uri)
        break

    # Extract classes
    classes = []
    class_uris: set[str] = set()

    for cls_uri in g.subjects(RDF.type, OWL.Class):
        if not isinstance(cls_uri, URIRef):
            continue
        uri_str = str(cls_uri)
        if uri_str.startswith("http://www.w3.org/"):
            continue  # Skip built-in OWL/RDF classes
        class_uris.add(uri_str)

        # Get superclass
        superclasses = []
        for parent in g.objects(cls_uri, RDFS.subClassOf):
            if isinstance(parent, URIRef) and not str(parent).startswith("http://www.w3.org/"):
                superclasses.append(_local_name(parent))

        # Collect datatype properties for this class
        attributes = []
        for prop_uri in g.subjects(RDF.type, OWL.DatatypeProperty):
            if not isinstance(prop_uri, URIRef):
                continue
            # Check if domain matches this class
            domains = list(g.objects(prop_uri, RDFS.domain))
            if domains and cls_uri not in domains:
                continue
            if not domains:
                continue  # Skip unattached properties

            # Get range (data type)
            prop_type = "string"
            for range_uri in g.objects(prop_uri, RDFS.range):
                prop_type = XSD_TYPE_MAP.get(str(range_uri), "string")

            attributes.append({
                "id": _local_name(prop_uri),
                "name": _get_label(g, prop_uri),
                "type": prop_type,
                "description": _get_comment(g, prop_uri),
                "required": False,
            })

        classes.append({
            "id": _local_name(cls_uri),
            "name": _get_label(g, cls_uri),
            "description": _get_comment(g, cls_uri),
            "superclasses": superclasses,
            "attributes": attributes,
        })

    # Also pick up rdfs:Class definitions
    for cls_uri in g.subjects(RDF.type, RDFS.Class):
        if not isinstance(cls_uri, URIRef):
            continue
        uri_str = str(cls_uri)
        if uri_str.startswith("http://www.w3.org/") or uri_str in class_uris:
            continue
        class_uris.add(uri_str)
        classes.append({
            "id": _local_name(cls_uri),
            "name": _get_label(g, cls_uri),
            "description": _get_comment(g, cls_uri),
            "superclasses": [],
            "attributes": [],
        })

    # Extract object properties → relationships
    relationships = []
    for prop_uri in g.subjects(RDF.type, OWL.ObjectProperty):
        if not isinstance(prop_uri, URIRef):
            continue

        source = ""
        target = ""
        for domain in g.objects(prop_uri, RDFS.domain):
            if isinstance(domain, URIRef):
                source = _local_name(domain)
        for range_uri in g.objects(prop_uri, RDFS.range):
            if isinstance(range_uri, URIRef):
                target = _local_name(range_uri)

        # Check inverse
        inverse_of = ""
        for inv in g.objects(prop_uri, OWL.inverseOf):
            inverse_of = _local_name(inv)

        # Check cardinality constraints (simplified)
        cardinality = "many_to_many"  # Default

        relationships.append({
            "id": _local_name(prop_uri),
            "name": _get_label(g, prop_uri),
            "description": _get_comment(g, prop_uri),
            "from": source,
            "to": target,
            "cardinality": cardinality,
            "inverse_of": inverse_of,
        })

    logger.info(
        "owl extraction complete",
        classes=len(classes),
        relationships=len(relationships),
    )

    return {
        "name": ont_name,
        "description": ont_desc,
        "classes": classes,
        "relationships": relationships,
    }
