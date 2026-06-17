/**
 * Agent Pipeline — Revised Two-Path Architecture
 *
 * Routing:
 *   BI Analytics  → Analytics Engine → RAG → Qwen HF API → Response
 *   General/Help  → Phi-3 Mini (Ollama) → Response
 *   Expert Mode   → Analytics Engine → RAG → Qwen → Phi-3 Critic → Merge
 *
 * Key constraints:
 *   - All numerical values come from the deterministic analytics engine
 *   - Models only receive pre-computed evidence and produce language
 *   - No default Phi-3 → Qwen → Phi-3 triple-hop (removed)
 *   - Routing is deterministic TypeScript (no LLM call for intent)
 */

import { ragService } from "./rag";
import type { RAGContext } from "./rag-types";
import { router, type RouterResult, type IntentType } from "./router";
import {
  buildKpiPrompt,
  buildChurnPrompt,
  buildForecastPrompt,
  buildGeneralBiPrompt,
  buildExecutiveReportPrompt,
  QWEN_BI_SYSTEM,
} from "./prompts/qwen-bi-analyst";
import { buildCriticPrompt, PHI3_CRITIC_SYSTEM } from "./prompts/phi3-orchestrator";

// ---------------------------------------------------------------------------
// Callable types — injected by server.ts to avoid circular imports
// ---------------------------------------------------------------------------

/** Call Phi-3 Mini via Ollama */
export type Phi3CallFn = (
  prompt: string,
  systemPrompt?: string
) => Promise<string>;

/** Call Qwen BI Analyst via HuggingFace API */
export type QwenCallFn = (
  prompt: string,
  systemPromptOverride?: string
) => Promise<string>;

// ---------------------------------------------------------------------------
// Shared types (re-exported for server.ts + UI)
// ---------------------------------------------------------------------------

export type { IntentType };
export type AgentMode = "standard" | "expert";

export interface AgentQueryContext {
  query: string;
  datasetId: string;
  datasetName: string;
  profileSummary: string;
  evidence: string[];
  baseAnswer: string;
  kpis?: Array<{ label: string; value: string; businessValue: string }>;
  forecast?: {
    metric: string;
    method: string;
    confidence: number;
    historical: Array<{ label: string; value: number }>;
    predicted: Array<{ label: string; value: number; upper: number; lower: number }>;
  };
  mode?: AgentMode;
}

export interface AgentStepLog {
  stepIndex: number;
  agentName: string;
  model: string;
  role: string;
  inputSummary: string;
  outputSummary: string;
  durationMs: number;
  status: "success" | "fallback" | "skipped" | "error";
  error?: string;
}

export interface AgentResult {
  finalMarkdown: string;
  reviewStatus: {
    status: "Verified" | "Flagged" | "Claim Removed";
    reason: string;
  };
  agentThought: string;
  routerResult: RouterResult;
  pipelineTrace: AgentStepLog[];
  ragContext?: {
    contextText: string;
    sources: Array<{ id: string; title: string; docType: string; score: number }>;
    retrievedCount: number;
  };
  mode: AgentMode;
  /** Which model produced the final response */
  poweredBy: "qwen-bi" | "phi3-general" | "fallback";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tryParseJson<T>(raw: string): T | null {
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function makeLog(
  stepIndex: number,
  agentName: string,
  model: string,
  role: string,
  inputSummary: string,
  outputSummary: string,
  durationMs: number,
  status: AgentStepLog["status"],
  error?: string
): AgentStepLog {
  return { stepIndex, agentName, model, role, inputSummary, outputSummary, durationMs, status, error };
}

// ---------------------------------------------------------------------------
// AgentPipelineService
// ---------------------------------------------------------------------------

export class AgentPipelineService {
  constructor(
    private callPhi3: Phi3CallFn,
    private callQwen: QwenCallFn
  ) {}

  // -------------------------------------------------------------------------
  // RAG retrieval (intent-aware filtering)
  // -------------------------------------------------------------------------

  private async retrieveContext(
    query: string,
    datasetId: string,
    intent: IntentType
  ): Promise<RAGContext> {
    const docTypeFilter: import("./rag-types").RAGDocType[] | undefined =
      intent === "kpi_query"        ? ["kpi", "dataset"] :
      intent === "churn_analysis"   ? ["churn", "insight"] :
      intent === "forecast"         ? ["forecast", "insight"] :
      intent === "executive_report" ? ["report", "kpi"] :
      intent === "dashboard_analysis" ? ["insight", "kpi"] :
      intent === "cohort_analysis"  ? ["insight", "dataset"] :
      undefined;

    return ragService.buildContext(query, {
      topK: 4,
      filterDatasetId: datasetId || undefined,
      filterDocTypes: docTypeFilter,
      hybridAlpha: 0.7,
      minScore: 0.15,
    });
  }

  // -------------------------------------------------------------------------
  // Step: Build Qwen prompt (intent-aware template selection)
  // -------------------------------------------------------------------------

  private buildQwenPrompt(
    ctx: AgentQueryContext,
    intent: IntentType,
    ragText: string | undefined
  ): string {
    if (intent === "kpi_query" && ctx.kpis?.length) {
      return buildKpiPrompt({
        query: ctx.query,
        datasetName: ctx.datasetName,
        kpis: ctx.kpis,
        evidence: ctx.evidence,
        ragContext: ragText,
      });
    }
    if (intent === "churn_analysis") {
      return buildChurnPrompt({
        query: ctx.query,
        datasetName: ctx.datasetName,
        evidence: ctx.evidence,
        ragContext: ragText,
      });
    }
    if (intent === "forecast" && ctx.forecast) {
      return buildForecastPrompt({
        query: ctx.query,
        datasetName: ctx.datasetName,
        ...ctx.forecast,
        evidence: ctx.evidence,
        ragContext: ragText,
      });
    }
    if ((intent === "executive_report") && ctx.kpis?.length) {
      return buildExecutiveReportPrompt({
        datasetName: ctx.datasetName,
        reportTitle: `${ctx.datasetName} — Executive Report`,
        executiveSummary: ctx.baseAnswer,
        keyFindings: [],
        kpis: ctx.kpis.map((k) => ({ label: k.label, value: k.value })),
        recommendations: [],
        evidence: ctx.evidence,
      });
    }
    // dashboard_analysis, cohort_analysis, or unknown BI intent → general BI template
    return buildGeneralBiPrompt({
      query: ctx.query,
      datasetName: ctx.datasetName,
      profileSummary: ctx.profileSummary,
      evidence: ctx.evidence,
      baseAnswer: ctx.baseAnswer,
      ragContext: ragText,
    });
  }

  // -------------------------------------------------------------------------
  // Step A: Qwen BI Analyst (HuggingFace)
  // -------------------------------------------------------------------------

  private async stepQwenBi(
    ctx: AgentQueryContext,
    intent: IntentType,
    ragCtx: RAGContext,
    trace: AgentStepLog[]
  ): Promise<{ text: string; usedFallback: boolean }> {
    const t0 = Date.now();
    const ragText = ragCtx.contextText || undefined;
    const prompt = this.buildQwenPrompt(ctx, intent, ragText);

    try {
      const result = await this.callQwen(prompt, QWEN_BI_SYSTEM);
      if (result.trim()) {
        trace.push(makeLog(
          trace.length,
          "Qwen BI Analyst",
          "Abhishekygr/qwen2.5-3b-bi-analyst",
          "BI Specialist (HuggingFace)",
          `Intent: ${intent} | RAG docs: ${ragCtx.retrievedCount} | Evidence: ${ctx.evidence.length}`,
          result.slice(0, 130) + (result.length > 130 ? "…" : ""),
          Date.now() - t0,
          "success"
        ));
        return { text: result, usedFallback: false };
      }
      throw new Error("Empty response from Qwen");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      trace.push(makeLog(
        trace.length,
        "Qwen BI Analyst",
        "Abhishekygr/qwen2.5-3b-bi-analyst",
        "BI Specialist (HuggingFace)",
        `Intent: ${intent}`,
        `HF unavailable — using base answer. ${msg}`,
        Date.now() - t0,
        "fallback",
        msg
      ));
      return { text: ctx.baseAnswer, usedFallback: true };
    }
  }

  // -------------------------------------------------------------------------
  // Step B: Phi-3 Mini — General assistant
  // -------------------------------------------------------------------------

  private async stepPhi3General(
    query: string,
    trace: AgentStepLog[]
  ): Promise<string> {
    const t0 = Date.now();

    try {
      const result = await this.callPhi3(query);
      if (result.trim()) {
        trace.push(makeLog(
          trace.length,
          "Phi-3 Mini",
          "phi3:mini",
          "General Assistant (Ollama)",
          query.slice(0, 80),
          result.slice(0, 130) + (result.length > 130 ? "…" : ""),
          Date.now() - t0,
          "success"
        ));
        return result;
      }
      throw new Error("Empty response from Phi-3");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      trace.push(makeLog(
        trace.length,
        "Phi-3 Mini",
        "phi3:mini",
        "General Assistant (Ollama)",
        query.slice(0, 80),
        `Phi-3 offline. ${msg}`,
        Date.now() - t0,
        "error",
        msg
      ));
      // Return a graceful static fallback
      return "I'm having trouble connecting to the local assistant model (phi3:mini). Please make sure Ollama is running (`ollama serve`) and the model is installed (`ollama pull phi3:mini`).";
    }
  }

  // -------------------------------------------------------------------------
  // Step C: Phi-3 Critic (Expert Mode only)
  // -------------------------------------------------------------------------

  private async stepPhi3Critic(
    narrative: string,
    evidence: string[],
    query: string,
    trace: AgentStepLog[]
  ): Promise<{ critiquePoints: string[]; additionalAngles: string[]; finalSynthesis: string }> {
    const DEFAULT = { critiquePoints: [], additionalAngles: [], finalSynthesis: narrative };
    const t0 = Date.now();
    const prompt = buildCriticPrompt(narrative, evidence, query);

    try {
      const raw = await this.callPhi3(prompt, PHI3_CRITIC_SYSTEM);
      const parsed = tryParseJson<typeof DEFAULT>(raw);
      const result = parsed?.finalSynthesis ? parsed : DEFAULT;

      trace.push(makeLog(
        trace.length,
        "Phi-3 Critic",
        "phi3:mini",
        "Expert Mode Critic (Ollama)",
        `Reviewing ${narrative.length} chars`,
        `${result.critiquePoints.length} critique pts | ${result.additionalAngles.length} angles`,
        Date.now() - t0,
        parsed ? "success" : "fallback"
      ));
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      trace.push(makeLog(
        trace.length,
        "Phi-3 Critic",
        "phi3:mini",
        "Expert Mode Critic (Ollama)",
        "Critique failed — passthrough",
        msg,
        Date.now() - t0,
        "error",
        msg
      ));
      return DEFAULT;
    }
  }

  // -------------------------------------------------------------------------
  // Public: run()
  // -------------------------------------------------------------------------

  async run(ctx: AgentQueryContext): Promise<AgentResult> {
    const mode: AgentMode = ctx.mode ?? "standard";
    const trace: AgentStepLog[] = [];

    // ── Step 1: Deterministic intent classification (0ms, no LLM) ──────────
    const routerResult = router(ctx.query);

    trace.push(makeLog(
      trace.length,
      "Query Router",
      "deterministic/keyword",
      "Intent Classifier",
      `"${ctx.query.slice(0, 80)}"`,
      `→ ${routerResult.route} [${routerResult.intent}] (${routerResult.confidence} conf, matched: ${routerResult.matchedKeywords.slice(0, 3).join(", ")})`,
      0,
      "success"
    ));

    // ── Path A: General assistant (Phi-3 only) ─────────────────────────────
    if (routerResult.route === "phi3-general" && mode !== "expert") {
      const text = await this.stepPhi3General(ctx.query, trace);
      return {
        finalMarkdown: text,
        reviewStatus: { status: "Verified", reason: "General assistant response." },
        agentThought: `Routed to Phi-3 Mini (general assistant). Intent: ${routerResult.intent}.`,
        routerResult,
        pipelineTrace: trace,
        mode: "standard",
        poweredBy: "phi3-general",
      };
    }

    // ── Path B: BI Analytics (Qwen + optional Expert critique) ────────────

    // Step 2: RAG retrieval
    const ragCtx = await this.retrieveContext(ctx.query, ctx.datasetId, routerResult.intent);
    if (ragCtx.retrievedCount > 0) {
      trace.push(makeLog(
        trace.length,
        "RAG Engine",
        "Xenova/all-MiniLM-L6-v2",
        "Semantic Retrieval",
        `Query: "${ctx.query.slice(0, 60)}"`,
        `${ragCtx.retrievedCount} docs (top: ${ragCtx.sources[0]?.score.toFixed(2) ?? "n/a"})`,
        0,
        "success"
      ));
    }

    // Step 3: Qwen BI Analyst (HuggingFace)
    const { text: narrative, usedFallback } = await this.stepQwenBi(
      ctx,
      routerResult.intent,
      ragCtx,
      trace
    );

    // ── Standard Mode: Return Qwen response directly ───────────────────────
    if (mode === "standard") {
      return {
        finalMarkdown: narrative,
        reviewStatus: {
          status: usedFallback ? "Flagged" : "Verified",
          reason: usedFallback
            ? "Qwen HF unavailable — showing deterministic base answer."
            : "BI Analyst analysis complete.",
        },
        agentThought: `Routed to Qwen BI Analyst (${routerResult.intent}, ${routerResult.confidence} confidence). RAG: ${ragCtx.retrievedCount} docs retrieved.`,
        routerResult,
        pipelineTrace: trace,
        ragContext: ragCtx.retrievedCount > 0 ? ragCtx : undefined,
        mode: "standard",
        poweredBy: usedFallback ? "fallback" : "qwen-bi",
      };
    }

    // ── Expert Mode: Phi-3 critique of Qwen's analysis ────────────────────
    const critique = await this.stepPhi3Critic(
      narrative,
      ctx.evidence,
      ctx.query,
      trace
    );

    let finalMarkdown = critique.finalSynthesis;
    if (critique.critiquePoints.length > 0) {
      finalMarkdown += `\n\n---\n\n### 🔍 Critical Review\n${critique.critiquePoints.map((p) => `- ${p}`).join("\n")}`;
    }
    if (critique.additionalAngles.length > 0) {
      finalMarkdown += `\n\n### 💡 Additional Angles\n${critique.additionalAngles.map((a) => `- ${a}`).join("\n")}`;
    }

    return {
      finalMarkdown,
      reviewStatus: {
        status: "Verified",
        reason: `Expert Mode — Phi-3 applied ${critique.critiquePoints.length} critique point(s).`,
      },
      agentThought: `Expert Mode: Qwen BI Analyst analysed (${routerResult.intent}); Phi-3 applied ${critique.critiquePoints.length} critique points and ${critique.additionalAngles.length} additional angles.`,
      routerResult,
      pipelineTrace: trace,
      ragContext: ragCtx.retrievedCount > 0 ? ragCtx : undefined,
      mode: "expert",
      poweredBy: usedFallback ? "fallback" : "qwen-bi",
    };
  }
}
