/**
 * Phi-3 Mini Prompts — Expert Mode Critic Only
 *
 * The Router and Reviewer roles have been removed:
 *   - Routing is now deterministic TypeScript (router.ts) — no LLM call needed
 *   - The default Phi-3 review step has been removed to eliminate latency
 *
 * Phi-3 is only called in Expert Mode as a Socratic critic.
 */

import { PHI3_CRITIC_SYSTEM_PROMPT } from "../../../models/config.js";

// Re-export the system prompt for use in agent-pipeline.ts
export const PHI3_CRITIC_SYSTEM = PHI3_CRITIC_SYSTEM_PROMPT;

/**
 * Build the Expert Mode critique prompt.
 *
 * Phi-3 reviews the Qwen BI Analyst's narrative for:
 *   - Unsupported claims
 *   - Missing assumptions
 *   - Weak recommendations
 *   - Alternative interpretations
 *
 * Phi-3 MUST NOT modify KPI values or numerical results.
 */
export function buildCriticPrompt(
  narrative: string,
  evidence: string[],
  query: string
): string {
  return `You are reviewing a BI Analyst's response for quality and completeness.

Original user question:
"${query}"

Evidence from the deterministic analytics engine (ground truth — do NOT modify these numbers):
${evidence.map((e, i) => `${i + 1}. ${e}`).join("\n")}

BI Analyst narrative to review:
---
${narrative}
---

Your task:
1. Identify any unsupported claims not backed by the evidence
2. Note missing assumptions or context the analyst overlooked
3. Point out weak or generic recommendations
4. Suggest 1–2 alternative analytical angles worth exploring
5. Produce a final synthesised response that integrates the analyst's findings with your improvements

CRITICAL RULES:
- Do NOT change any numerical values (KPIs, percentages, counts, etc.)
- Do NOT invent new data points
- Be constructive — improve the analysis, don't just criticise it
- The finalSynthesis should be a complete, polished Markdown response

Respond ONLY with valid JSON (no prose, no markdown code fences):
{
  "critiquePoints": ["<specific issue found>", "<another issue>"],
  "additionalAngles": ["<angle 1>", "<angle 2>"],
  "finalSynthesis": "<complete improved narrative in Markdown>"
}`;
}
