/**
 * models/pipeline.ts — Legacy shim
 *
 * The pipeline engine has been moved to src/llm/agent-pipeline.ts.
 * This file is kept to avoid breaking any stale imports.
 * All new code should import from src/llm/agent-pipeline.ts directly.
 */

export { AgentPipelineService } from "../src/llm/agent-pipeline.js";
export type {
  AgentQueryContext,
  AgentResult,
  AgentStepLog,
  AgentMode,
} from "../src/llm/agent-pipeline.js";
