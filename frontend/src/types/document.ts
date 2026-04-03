export interface Document {
  id: string;
  ontology_id: string;
  filename: string;
  file_type: string;
  status: "pending" | "processing" | "completed" | "failed";
  progress: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface UploadResponse {
  document_id: string;
  job_id: string;
}

export interface ProcessingStatus {
  status: string;
  progress: number;
  entities_extracted: number;
  relations_extracted: number;
  errors: string[];
}
