/**
 * Models Barrel — Revised Architecture
 *
 * Two-model setup:
 *   Phi-3 Mini (Ollama)          → General assistant, Expert Mode critic
 *   Qwen2.5-3B BI Analyst (HF)   → BI analysis (via src/llm/qwen-bi-client.ts)
 */

export { ollamaClient, OllamaClient } from "./client.js";
export type { ChatMessage, ChatRequest, ChatResponse, ModelStatus } from "./client.js";

export {
  MODELS,
  ACTIVE_MODEL,
  ORCHESTRATOR_MODEL,
  OLLAMA_CONFIG,
  HF_CONFIG,
  SYSTEM_PROMPT,
  QWEN_BI_SYSTEM_PROMPT,
  PHI3_GENERAL_SYSTEM_PROMPT,
  PHI3_CRITIC_SYSTEM_PROMPT,
  resolveHFEndpoint,
  type ModelConfig,
  type AgentMode,
} from "./config.js";
