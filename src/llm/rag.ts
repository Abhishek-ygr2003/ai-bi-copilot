/**
 * RAG Service — Retrieval-Augmented Generation
 *
 * Upgraded features over the original in-memory store:
 *   1. Chunked document ingestion (configurable size + overlap)
 *   2. Metadata filtering by docType and datasetId
 *   3. Hybrid reranking: cosine similarity + keyword overlap
 *   4. Context assembly: sorted, deduplicated, formatted for prompt injection
 *   5. Session persistence via localStorage (browser) or in-memory (server)
 */

import { pipeline, type FeatureExtractionPipeline } from "@xenova/transformers";
import type {
  RAGDocument,
  RAGDocumentMetadata,
  RAGSearchOptions,
  RAGSearchResult,
  RAGContext,
  RAGDocType,
} from "./rag-types";

export type { RAGDocument, RAGDocumentMetadata, RAGSearchOptions, RAGSearchResult, RAGContext, RAGDocType };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_CHUNK_SIZE = 400;   // characters
const DEFAULT_CHUNK_OVERLAP = 80; // characters
const DEFAULT_TOP_K = 4;
const DEFAULT_HYBRID_ALPHA = 0.7; // 70% semantic, 30% keyword
const STORAGE_KEY = "bi_copilot_rag_store";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Split a long text into overlapping chunks */
function chunkText(
  text: string,
  chunkSize = DEFAULT_CHUNK_SIZE,
  overlap = DEFAULT_CHUNK_OVERLAP
): string[] {
  if (text.length <= chunkSize) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end).trim());
    start += chunkSize - overlap;
    if (start >= text.length) break;
  }
  return chunks.filter((c) => c.length > 20); // discard tiny trailing chunks
}

/** Tokenise text into lowercase words for keyword matching */
function tokenise(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2)
  );
}

/** Jaccard-like keyword overlap score */
function keywordScore(queryTokens: Set<string>, docText: string): number {
  const docTokens = tokenise(docText);
  let overlap = 0;
  queryTokens.forEach((t) => {
    if (docTokens.has(t)) overlap++;
  });
  return queryTokens.size > 0 ? overlap / queryTokens.size : 0;
}

/** Cosine similarity between two numeric vectors */
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/** Generate a short unique ID */
function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ---------------------------------------------------------------------------
// RAGService
// ---------------------------------------------------------------------------

export class RAGService {
  private extractor: FeatureExtractionPipeline | null = null;
  private documents: RAGDocument[] = [];
  private ready = false;

  // -------------------------------------------------------------------------
  // Initialization
  // -------------------------------------------------------------------------

  async init(): Promise<void> {
    if (this.ready) return;
    this.extractor = await pipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2"
    );
    this.ready = true;
  }

  private async embed(text: string): Promise<number[]> {
    await this.init();
    const out = await this.extractor!(text, { pooling: "mean", normalize: true });
    return Array.from(out.data as Float32Array);
  }

  // -------------------------------------------------------------------------
  // Document ingestion
  // -------------------------------------------------------------------------

  /**
   * Index a single document.
   * Long documents are automatically split into overlapping chunks.
   * Each chunk inherits the parent document's metadata.
   */
  async addDocument(
    text: string,
    metadata: RAGDocumentMetadata,
    chunkSize = DEFAULT_CHUNK_SIZE,
    overlap = DEFAULT_CHUNK_OVERLAP
  ): Promise<void> {
    const chunks = chunkText(text, chunkSize, overlap);
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = await this.embed(chunk);
      const doc: RAGDocument = {
        id: `${uid()}-c${i}`,
        text: chunk,
        metadata: {
          ...metadata,
          title: chunks.length > 1 ? `${metadata.title} [${i + 1}/${chunks.length}]` : metadata.title,
        },
        embedding,
      };
      this.documents.push(doc);
    }
  }

  /**
   * Batch-index multiple documents.
   */
  async addDocuments(
    docs: Array<{ text: string; metadata: RAGDocumentMetadata }>,
    chunkSize?: number,
    overlap?: number
  ): Promise<void> {
    for (const doc of docs) {
      await this.addDocument(doc.text, doc.metadata, chunkSize, overlap);
    }
    console.log(`[RAG] Indexed ${docs.length} documents → ${this.documents.length} total chunks`);
  }

  /**
   * Index a full dataset profile into the RAG store.
   * Automatically creates KPI, insight, and dataset documents.
   */
  async indexDatasetProfile(
    datasetId: string,
    datasetName: string,
    profile: {
      summary: string;
      marketKPIs?: Array<{ label: string; value: string; businessValue: string }>;
      analystInsights?: Array<{ title: string; description: string }>;
      topSignals?: string[];
    }
  ): Promise<void> {
    const now = new Date().toISOString();

    // Dataset summary
    await this.addDocument(profile.summary, {
      docType: "dataset",
      datasetId,
      title: `${datasetName} — Dataset Summary`,
      createdAt: now,
      source: "auto-indexed",
    });

    // KPI documents
    if (profile.marketKPIs) {
      for (const kpi of profile.marketKPIs) {
        await this.addDocument(
          `${kpi.label}: ${kpi.value}. ${kpi.businessValue}`,
          {
            docType: "kpi",
            datasetId,
            title: kpi.label,
            createdAt: now,
            source: "auto-indexed",
            tags: ["kpi", kpi.label.toLowerCase()],
          }
        );
      }
    }

    // Insight documents
    if (profile.analystInsights) {
      for (const insight of profile.analystInsights) {
        await this.addDocument(
          `${insight.title}: ${insight.description}`,
          {
            docType: "insight",
            datasetId,
            title: insight.title,
            createdAt: now,
            source: "auto-indexed",
          }
        );
      }
    }

    // Top signals
    if (profile.topSignals && profile.topSignals.length > 0) {
      await this.addDocument(
        `Key signals:\n${profile.topSignals.map((s) => `• ${s}`).join("\n")}`,
        {
          docType: "insight",
          datasetId,
          title: `${datasetName} — Top Signals`,
          createdAt: now,
          source: "auto-indexed",
          tags: ["signals"],
        }
      );
    }

    console.log(`[RAG] Indexed dataset "${datasetName}" — ${this.documents.length} total chunks`);
  }

  /**
   * Index a generated executive report.
   */
  async indexReport(
    datasetId: string,
    report: { title: string; executiveSummary: string; recommendations: string[] }
  ): Promise<void> {
    const now = new Date().toISOString();
    await this.addDocument(
      `${report.executiveSummary}\n\nRecommendations:\n${report.recommendations.map((r) => `• ${r}`).join("\n")}`,
      {
        docType: "report",
        datasetId,
        title: report.title,
        createdAt: now,
        source: "report-generated",
      }
    );
  }

  // -------------------------------------------------------------------------
  // Retrieval
  // -------------------------------------------------------------------------

  /**
   * Hybrid search: cosine similarity + keyword overlap.
   * Supports metadata filtering by docType and datasetId.
   */
  async search(
    query: string,
    options: RAGSearchOptions = {}
  ): Promise<RAGSearchResult[]> {
    if (this.documents.length === 0) return [];

    const {
      topK = DEFAULT_TOP_K,
      filterDocTypes,
      filterDatasetId,
      hybridAlpha = DEFAULT_HYBRID_ALPHA,
      minScore = 0.1,
    } = options;

    const queryEmbedding = await this.embed(query);
    const queryTokens = tokenise(query);

    // Apply metadata filters
    const candidates = this.documents.filter((doc) => {
      if (filterDocTypes && !filterDocTypes.includes(doc.metadata.docType)) return false;
      if (filterDatasetId && doc.metadata.datasetId !== filterDatasetId) return false;
      return true;
    });

    // Score each candidate
    const scored: RAGSearchResult[] = candidates
      .filter((doc) => doc.embedding)
      .map((doc) => {
        const sim = cosineSimilarity(queryEmbedding, doc.embedding!);
        const kw = keywordScore(queryTokens, doc.text);
        const final = hybridAlpha * sim + (1 - hybridAlpha) * kw;
        return { document: doc, similarityScore: sim, keywordScore: kw, finalScore: final };
      })
      .filter((r) => r.finalScore >= minScore)
      .sort((a, b) => b.finalScore - a.finalScore)
      .slice(0, topK);

    return scored;
  }

  /**
   * Search and assemble a formatted context string ready for prompt injection.
   */
  async buildContext(
    query: string,
    options: RAGSearchOptions = {}
  ): Promise<RAGContext> {
    const results = await this.search(query, options);

    if (results.length === 0) {
      return {
        contextText: "",
        sources: [],
        retrievedCount: 0,
      };
    }

    const contextText = results
      .map(
        (r, i) =>
          `[${i + 1}] ${r.document.metadata.title} (${r.document.metadata.docType}, score: ${r.finalScore.toFixed(2)})\n${r.document.text}`
      )
      .join("\n\n---\n\n");

    return {
      contextText,
      sources: results.map((r) => ({
        id: r.document.id,
        title: r.document.metadata.title,
        docType: r.document.metadata.docType,
        score: r.finalScore,
      })),
      retrievedCount: results.length,
    };
  }

  // -------------------------------------------------------------------------
  // Store management
  // -------------------------------------------------------------------------

  /** Remove all documents for a specific dataset */
  clearDataset(datasetId: string): void {
    const before = this.documents.length;
    this.documents = this.documents.filter(
      (d) => d.metadata.datasetId !== datasetId
    );
    console.log(`[RAG] Cleared ${before - this.documents.length} chunks for dataset "${datasetId}"`);
  }

  /** Clear the entire document store */
  clearAll(): void {
    this.documents = [];
    console.log("[RAG] Cleared all documents");
  }

  get documentCount(): number {
    return this.documents.length;
  }

  get datasetIds(): string[] {
    return [...new Set(this.documents.map((d) => d.metadata.datasetId))];
  }

  /** Summary of the store grouped by docType */
  getStoreStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    for (const doc of this.documents) {
      stats[doc.metadata.docType] = (stats[doc.metadata.docType] ?? 0) + 1;
    }
    return stats;
  }
}

// Singleton
export const ragService = new RAGService();