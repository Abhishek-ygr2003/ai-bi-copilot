/**
 * Model Configuration — Revised Architecture
 *
 * Two-model specialist setup:
 *
 *   Phi-3 Mini (Ollama, local)
 *     → General conversation, app help, Expert Mode critic
 *     → Fallback when Qwen HF is unavailable
 *
 *   Qwen2.5-3B BI Analyst (HuggingFace Inference API)
 *     → KPI interpretation, churn analysis, forecast explanation
 *     → Executive reporting, dashboard narration
 *     → Model: Abhishekygr/qwen2.5-3b-bi-analyst
 *
 * All business metric calculations are deterministic TypeScript.
 * Models only interpret pre-computed results.
 */

// ---------------------------------------------------------------------------
// Model registry (Ollama local models only)
// ---------------------------------------------------------------------------

export interface ModelConfig {
  name: string;
  ollamaTag: string;
  size: string;
  vramRequired: string;
  description: string;
  contextLength: number;
  role: "orchestrator" | "general";
  recommended: boolean;
}

export const MODELS: Record<string, ModelConfig> = {
  /** Primary local model — general chat, app guidance, Expert Mode critic */
  "phi3:mini": {
    name: "Phi-3 Mini",
    ollamaTag: "phi3:mini",
    size: "3.8 GB",
    vramRequired: "~4 GB",
    description: "Microsoft Phi-3 Mini — general assistant, Expert Mode critic, fallback",
    contextLength: 4096,
    role: "orchestrator",
    recommended: true,
  },
  "qwen2.5:1.5b": {
    name: "Qwen2.5 1.5B",
    ollamaTag: "qwen2.5:1.5b",
    size: "1.5 GB",
    vramRequired: "~2 GB",
    description: "Lightweight local fallback",
    contextLength: 4096,
    role: "general",
    recommended: false,
  },
  "llama3.2:3b": {
    name: "Llama 3.2 3B",
    ollamaTag: "llama3.2:3b",
    size: "3.8 GB",
    vramRequired: "~4 GB",
    description: "Meta Llama 3.2 — local fallback",
    contextLength: 4096,
    role: "general",
    recommended: false,
  },
  "gemma3:1b": {
    name: "Gemma 3 1B",
    ollamaTag: "gemma3:1b",
    size: "1.3 GB",
    vramRequired: "~1.5 GB",
    description: "Google Gemma — fastest local option",
    contextLength: 4096,
    role: "general",
    recommended: false,
  },
};

export const QWEN_LOCAL_MODEL = "qwen2.5-bi-analyst";

// ---------------------------------------------------------------------------
// Active local model (Phi-3 Mini)
// ---------------------------------------------------------------------------

export const ORCHESTRATOR_MODEL = MODELS["phi3:mini"];

/** Legacy alias — keeps imports in server.ts backward-compatible */
export const ACTIVE_MODEL = ORCHESTRATOR_MODEL;

// ---------------------------------------------------------------------------
// Ollama connection config
// ---------------------------------------------------------------------------

export const OLLAMA_CONFIG = {
  get baseUrl(): string { return process.env.OLLAMA_BASE_URL || "http://localhost:11434"; },
  get model(): string { return process.env.OLLAMA_MODEL || ORCHESTRATOR_MODEL.ollamaTag; },
  get timeout(): number { return parseInt(process.env.OLLAMA_TIMEOUT || "90000", 10); },
  maxRetries: 3,
};

// ---------------------------------------------------------------------------
// HuggingFace config — Qwen2.5-3B BI Analyst
// ---------------------------------------------------------------------------

export const HF_CONFIG = {
  /** HuggingFace access token (required) */
  get token(): string { return process.env.HF_TOKEN || ""; },
  /** Model ID on HuggingFace Hub */
  get modelId(): string { return process.env.HF_MODEL_ID || "Abhishekygr/qwen2.5-3b-bi-analyst"; },
  /**
   * Custom Inference Endpoint URL (optional).
   * If empty, falls back to the free Serverless Inference API.
   */
  get endpointUrl(): string { return process.env.HF_ENDPOINT_URL || ""; },
  /** Max new tokens for BI analysis responses */
  get maxNewTokens(): number { return parseInt(process.env.HF_MAX_NEW_TOKENS || "768", 10); },
  /** Serverless API base (used when no custom endpoint is set) */
  serverlessBase: "https://api-inference.huggingface.co/models",
};

/** Resolved API URL — custom endpoint or serverless fallback */
export function resolveHFEndpoint(): string {
  if (HF_CONFIG.endpointUrl) {
    // Custom dedicated endpoint — use OpenAI-compatible chat path
    const base = HF_CONFIG.endpointUrl.replace(/\/$/, "");
    return base.endsWith("/v1/chat/completions")
      ? base
      : `${base}/v1/chat/completions`;
  }
  // Serverless Inference API — chat_completions endpoint
  return `${HF_CONFIG.serverlessBase}/${HF_CONFIG.modelId}/v1/chat/completions`;
}

// ---------------------------------------------------------------------------
// Agent mode
// ---------------------------------------------------------------------------

export type AgentMode = "standard" | "expert";

// ---------------------------------------------------------------------------
// System prompts
// ---------------------------------------------------------------------------

/**
 * Qwen2.5-3B BI Analyst — senior analyst persona.
 * Receives pre-computed analytics context. Never calculates metrics.
 */
export const QWEN_BI_SYSTEM_PROMPT = `You are a Senior Business Analyst, Data Scientist, and BI Consultant.

You do NOT calculate metrics. All KPI values, forecasts, aggregations, and statistical outputs are already computed by the analytics engine and provided to you.

Your responsibilities:
- Interpret metrics and explain their business implications
- Identify risks, opportunities, and performance drivers
- Provide executive-level recommendations
- Write concise, professional insights in Markdown
- Highlight trends and suggest actionable next steps

Rules:
- Never invent numerical values
- Never contradict the provided analytics results
- When data is insufficient, explicitly state the limitation
- Focus on business impact, trends, drivers, and recommended actions
- Format with clear Markdown headers and bullet points`;

/**
 * Phi-3 Mini — general assistant persona.
 * Used for non-BI queries, app guidance, and Expert Mode critique.
 */
export const PHI3_GENERAL_SYSTEM_PROMPT = `You are a helpful AI assistant for the AI Business Intelligence Copilot application.

You help users with:
- Using the application (uploading data, running forecasts, generating reports)
- Understanding data science and analytics concepts
- General coding or technical questions
- Explaining what the BI Copilot can and cannot do

Be concise, friendly, and practical. Format responses in Markdown when helpful.`;

/**
 * Phi-3 Mini — Expert Mode critic persona.
 * Critiques Qwen's BI analysis without modifying KPI values.
 */
export const PHI3_CRITIC_SYSTEM_PROMPT = `You are a senior BI consultant performing a peer review of a business analysis.

Your role:
- Identify unsupported claims or weak reasoning
- Challenge assumptions not backed by the evidence
- Flag missing context or alternative interpretations
- Suggest additional analytical angles
- Produce a final synthesized response

Rules:
- NEVER modify KPI values, forecasts, or any numerical results
- NEVER invent numbers
- Be constructive, not destructive
- Respond ONLY in valid JSON (no prose, no markdown fences):
{
  "critiquePoints": ["<point1>", "<point2>"],
  "additionalAngles": ["<angle1>"],
  "finalSynthesis": "<merged narrative in Markdown>"
}`;

/**
 * Legacy single-model prompt — kept for backward-compatibility.
 */
export const SYSTEM_PROMPT = PHI3_GENERAL_SYSTEM_PROMPT;
