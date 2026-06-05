/**
 * RAG (Retrieval-Augmented Generation) Type Definitions
 *
 * Strongly typed schema for the BI Copilot document store.
 */

// ---------------------------------------------------------------------------
// Document schema
// ---------------------------------------------------------------------------

/** Semantic type of a RAG document — used for metadata filtering */
export type RAGDocType =
  | "kpi"          // A computed KPI card
  | "insight"      // An analyst insight card
  | "report"       // An executive report or section
  | "dataset"      // Dataset-level profile information
  | "forecast"     // Forecast result or narrative
  | "churn"        // Churn analysis specific content
  | "general";     // Unclassified content

export interface RAGDocumentMetadata {
  /** Semantic type — used for targeted retrieval */
  docType: RAGDocType;
  /** ID of the dataset this document belongs to (empty = global) */
  datasetId: string;
  /** Human-readable title / heading */
  title: string;
  /** ISO 8601 creation timestamp */
  createdAt: string;
  /** Source: how this document was created */
  source: "auto-indexed" | "user-added" | "report-generated";
  /** Optional tags for additional filtering */
  tags?: string[];
}

export interface RAGDocument {
  /** Unique identifier */
  id: string;
  /** Raw text content of this chunk */
  text: string;
  /** Document metadata */
  metadata: RAGDocumentMetadata;
  /** Embedding vector (set after indexing) */
  embedding?: number[];
}

// ---------------------------------------------------------------------------
// Search results
// ---------------------------------------------------------------------------

export interface RAGSearchResult {
  document: RAGDocument;
  /** Cosine similarity score (0–1) */
  similarityScore: number;
  /** Keyword overlap reranking boost (0–1) */
  keywordScore: number;
  /** Final combined score used for ranking */
  finalScore: number;
}

export interface RAGSearchOptions {
  /** Number of results to return */
  topK?: number;
  /** Only return documents of these types */
  filterDocTypes?: RAGDocType[];
  /** Only return documents for this dataset */
  filterDatasetId?: string;
  /** Alpha weight: 1.0 = pure embedding, 0.0 = pure keyword */
  hybridAlpha?: number;
  /** Minimum score threshold to include a result */
  minScore?: number;
}

// ---------------------------------------------------------------------------
// Indexed context
// ---------------------------------------------------------------------------

export interface RAGContext {
  /** Assembled context string ready to inject into a model prompt */
  contextText: string;
  /** Source documents used */
  sources: Array<{
    id: string;
    title: string;
    docType: RAGDocType;
    score: number;
  }>;
  /** Number of documents retrieved */
  retrievedCount: number;
}
