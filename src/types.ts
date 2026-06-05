/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ColumnType = "number" | "string" | "date" | "boolean";

export interface ColumnMetric {
  name: string;
  type: ColumnType;
  missingCount: number;
  distinctValues: number;
  sampleValues: string[];
  min?: number;
  max?: number;
  mean?: number;
  median?: number;
  stdDev?: number;
}

export interface Dataset {
  name: string;
  sourceType?: "csv" | "xlsx" | "xls" | "tsv" | "json" | "manual";
  sheetName?: string;
  headers: string[];
  rows: Record<string, any>[];
  metrics: ColumnMetric[];
}

export interface CleanerSuggestion {
  column: string;
  issueType: string;
  description: string;
  remedyCode: string;
  impact: "High" | "Medium" | "Low";
}

export interface KpiSummary {
  label: string;
  value: string;
  valueFormula: string;
  businessValue: string;
}

export interface InsightCard {
  title: string;
  description: string;
  type: "positive" | "negative" | "neutral" | "trend" | "anomaly" | "distribution" | "info";
  evidence?: string;
  evidenceList?: string[];
  assumptions?: string;
}

export interface ChartCard {
  type: "bar" | "line" | "scatter" | "area" | "pie";
  title: string;
  data: Record<string, any>[];
  xAxisKey: string;
  yAxisKey: string;
  colorTheme?: "violet" | "emerald" | "amber" | "rose" | "cyan";
}

export interface DatasetProfile {
  datasetQualityScore: number;
  completenessScore: number;
  missingCells: number;
  missingRatio: number;
  outlierRows: number;
  totalRows: number;
  totalColumns: number;
  cleanerSuggestions: CleanerSuggestion[];
  marketKPIs: KpiSummary[];
  analystInsights: InsightCard[];
  chartCards: ChartCard[];
  topSignals: string[];
  recommendedQuestions: string[];
  summary: string;
  agentThought: string;
}

export interface QuestionAnswer {
  answerMarkdown: string;
  chartSuggestion?: {
    type: "bar" | "line" | "scatter" | "area" | "pie";
    title: string;
    xAxisKey: string;
    yAxisKey: string;
    data: Record<string, any>[];
  };
  evidence?: string[];
}

// ---------------------------------------------------------------------------
// Agent & Pipeline types
// ---------------------------------------------------------------------------

/** Determines which LLM pipeline to use for a response */
export type AgentMode = "standard" | "expert";

/** Per-step record in the dual-model pipeline execution trace */
export interface PipelineStep {
  stepIndex: number;
  /** Human-readable agent name, e.g. "Phi-3 Orchestrator", "Qwen BI Analyst", "RAG Engine" */
  agentName: string;
  /** Ollama model tag used, e.g. "phi3:mini", "bi-analyst" */
  model: string;
  /** Functional role of this step */
  role: string;
  /** Short summary of what was sent to the model */
  inputSummary: string;
  /** Short summary of what the model returned */
  outputSummary: string;
  /** Wall-clock duration in milliseconds */
  durationMs: number;
  /** Outcome of this step */
  status: "success" | "fallback" | "skipped" | "error";
  error?: string;
}

/** Retrieved document reference from the RAG system */
export interface RAGSource {
  id: string;
  title: string;
  docType: string;
  score: number;
}

/** RAG retrieval result attached to a chat message */
export interface RAGContextInfo {
  retrievedCount: number;
  sources: RAGSource[];
}

export interface AgentLog {
  id: string;
  agentName:
    | "Data Cleaner"
    | "Data Analyst"
    | "Forecasting Agent"
    | "Report Generator"
    | "Dashboard Agent"
    | "Reviewer Agent"
    | "Phi-3 Mini"
    | "Phi-3 Orchestrator"
    | "Phi-3 Critic"
    | "Qwen BI Analyst"
    | "RAG Engine"
    | "Query Router"
    | "System";
  message: string;
  timestamp: string;
  type: "info" | "success" | "warning" | "error" | "process";
}

export interface ReviewStatus {
  status: "Claim Removed" | "Verified" | "Flagged";
  reason: string;
}

export interface ChatMessage {
  id: string;
  sender: "user" | "assistant";
  text: string;
  timestamp: string;
  agentRef?: string;
  /** Review result from the hallucination guard */
  reviewStatus?: ReviewStatus;
  /** Which pipeline mode produced this message */
  agentMode?: AgentMode;
  /** Which model produced the final response */
  poweredBy?: "qwen-bi" | "phi3-general" | "fallback";
  /** Execution trace for this response */
  pipelineTrace?: PipelineStep[];
  /** RAG documents used to generate this response */
  ragContext?: RAGContextInfo;
  chartSuggestion?: {
    type: "bar" | "line" | "scatter" | "area" | "pie";
    title: string;
    xAxisKey: string;
    yAxisKey: string;
    data: any[];
  };
}

export interface ForecastResult {
  historical: { label: string; value: number }[];
  predicted: { label: string; value: number; upper: number; lower: number }[];
  horizon: number;
  confidence: number;
  method: string;
  modelConfidence: number;
  metricUsed: string;
  insights: string;
}

export interface ExecutiveReport {
  title: string;
  date: string;
  executiveSummary: string;
  keyFindings: {
    title: string;
    description: string;
    metric?: string;
    impact: "positive" | "negative" | "neutral";
    evidenceList?: string[];
    assumptions?: string;
    confidence?: "High" | "Medium" | "Low";
  }[];
  recommendations: string[];
  slideDeck: {
    id: number;
    title: string;
    subtitle?: string;
    layout: "title" | "metrics" | "chart" | "bullets";
    bullets?: string[];
    metrics?: { label: string; value: string; sub?: string }[];
    chartConfig?: {
      type: "bar" | "line" | "area" | "pie" | "scatter";
      title: string;
      xAxis: string;
      yAxis: string;
    };
  }[];
}
