export interface Ontology {
  id: string;
  name: string;
  description: string;
  entity_types: EntityType[];
  relation_types: RelationType[];
  created_at: string;
  updated_at: string;
}

export interface EntityType {
  id: string;
  ontology_id: string;
  name: string;
  description: string;
  properties: Record<string, PropertyDef>;
}

export interface RelationType {
  id: string;
  ontology_id: string;
  name: string;
  description: string;
  source_type: string;
  target_type: string;
  properties: Record<string, PropertyDef>;
}

export interface PropertyDef {
  type: "string" | "number" | "boolean" | "date";
  required?: boolean;
  description?: string;
}
