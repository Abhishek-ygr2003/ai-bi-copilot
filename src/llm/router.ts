/**
 * Query Router — Deterministic Intent Classifier
 *
 * Zero-latency TypeScript routing — NO LLM call required.
 * Keyword matching determines whether a query goes to:
 *   - Qwen2.5-3B BI Analyst (HuggingFace) for business analytics
 *   - Phi-3 Mini (Ollama) for general assistant tasks
 *
 * This replaces the previous LLM-based Phi-3 router step,
 * eliminating an unnecessary model call on every query.
 */

import { ragService } from "./rag";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type QueryRoute = "qwen-bi" | "phi3-general";

export type IntentType =
  | "kpi_query"
  | "churn_analysis"
  | "forecast"
  | "executive_report"
  | "dashboard_analysis"
  | "data_quality"
  | "cohort_analysis"
  | "general";

export interface RouterResult {
  route: QueryRoute;
  intent: IntentType;
  confidence: "high" | "medium" | "low";
  matchedKeywords: string[];
}

// ---------------------------------------------------------------------------
// Keyword banks per intent (order = priority)
// ---------------------------------------------------------------------------

const BI_INTENTS: Array<{ intent: IntentType; keywords: string[] }> = [
  {
    intent: "churn_analysis",
    keywords: [
      "churn", "retention", "attrition", "customer loss", "churned",
      "lost customer", "leaving", "cancel", "cancellation", "unsubscribe",
      "lifetime value", "ltv", "at-risk", "at risk", "win back",
    ],
  },
  {
    intent: "forecast",
    keywords: [
      "forecast", "predict", "projection", "project", "trend",
      "next quarter", "next month", "future", "expected", "estimate",
      "outlook", "growth rate", "trajectory", "will be", "anticipate",
    ],
  },
  {
    intent: "executive_report",
    keywords: [
      "executive", "report", "summary", "board", "presentation", "slide",
      "overview", "brief", "highlights", "c-suite", "ceo", "cfo",
      "strategic", "quarterly review", "annual review", "export",
    ],
  },
  {
    intent: "dashboard_analysis",
    keywords: [
      "dashboard", "chart", "graph", "visualiz", "insight", "narrative",
      "explain this", "what does this mean", "interpret", "analysis",
      "breakdown", "drill down", "segment", "cohort", "distribution",
    ],
  },
  {
    intent: "cohort_analysis",
    keywords: [
      "cohort", "segment", "group", "age group", "customer segment",
      "user segment", "acquisition", "onboard", "first purchase", "repeat",
    ],
  },
  {
    intent: "kpi_query",
    keywords: [
      "kpi", "metric", "revenue", "profit", "margin", "sales", "mrr", "arr",
      "average order", "aov", "cac", "nps", "conversion", "growth",
      "top product", "best", "worst", "highest", "lowest", "total",
      "compare", "vs", "versus", "year over year", "yoy", "month over month",
      "mom", "quarter", "performance", "how much", "how many",
    ],
  },
  {
    intent: "data_quality",
    keywords: [
      "missing", "null", "empty", "duplicate", "outlier", "anomaly",
      "invalid", "error", "quality", "clean", "fix", "issue", "problem",
      "data type", "format", "corrupt",
    ],
  },
];

// General assistant / app help patterns — anything matching these routes to Phi-3
const GENERAL_KEYWORDS: string[] = [
  "how do i", "how to", "can you help", "what is", "what are", "explain",
  "help me", "tutorial", "guide", "upload", "import", "export how",
  "button", "feature", "app", "application", "copilot", "tool",
  "csv", "excel", "file format", "settings", "configure",
  "python", "code", "script", "algorithm", "machine learning",
  "who are you", "what can you do", "hello", "hi ", "hey ",
];

// ---------------------------------------------------------------------------
// Semantic Anchors mapping for intent routing
// ---------------------------------------------------------------------------

const ANCHOR_PHRASES: Record<IntentType, string[]> = {
  churn_analysis: [
    "Analyze customer churn and retention rates",
    "Which segment has the highest customer attrition?",
    "Evaluate customer cancellation patterns",
    "How many customers did we lose?",
    "Customer lifetime value and churn risk analysis",
    "win back churned accounts and retention campaigns"
  ],
  forecast: [
    "Forecast our sales for the next few periods",
    "Project our revenue trends into the future",
    "What is the expected sales growth for next quarter?",
    "Predict future metrics and performance",
    "Directional trend outlook and projections",
    "sales trajectories and next month projections"
  ],
  executive_report: [
    "Generate an executive briefing report summary",
    "Create a board presentation slide deck overview",
    "Compile a strategic C-suite quarterly review",
    "Export high-level strategic findings report",
    "executive summary review slide layouts"
  ],
  dashboard_analysis: [
    "Explain the charts and interpret the insights",
    "Interpret this dashboard overview breakdown",
    "What does this category distribution graph mean?",
    "Provide a narrative summary of these dashboard cards",
    "dashboard cards interpretation and visualization graph summaries"
  ],
  cohort_analysis: [
    "Perform customer cohort segment analysis",
    "Group users by acquisition date or segment",
    "Analyze repeat purchase cohorts over time",
    "onboarding cohort split metrics"
  ],
  kpi_query: [
    "What is the total sales and net profit?",
    "Which category has the highest profit margin?",
    "Compare top selling products and revenue metrics",
    "How much MRR did we record?",
    "kpis vs averages performance metrics comparison"
  ],
  data_quality: [
    "Check the dataset for missing cells or duplicates",
    "Find outliers, errors and anomalies in the tables",
    "Evaluate data completeness and quality score",
    "data cleaner missing values null rows audit"
  ],
  general: [
    "How do I upload files or use the app?",
    "Can you explain how the AI BI Copilot works?",
    "Hello, who are you and what can you do?",
    "Help me configure settings or troubleshoot",
    "tutorial help context guide instructions"
  ]
};

let embeddedAnchors: Array<{ intent: IntentType; embedding: number[] }> | null = null;

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

async function getEmbeddedAnchors(): Promise<Array<{ intent: IntentType; embedding: number[] }>> {
  if (embeddedAnchors) return embeddedAnchors;

  const list: Array<{ intent: IntentType; embedding: number[] }> = [];
  for (const intentStr of Object.keys(ANCHOR_PHRASES)) {
    const intent = intentStr as IntentType;
    const phrases = ANCHOR_PHRASES[intent];
    for (const phrase of phrases) {
      try {
        const embedding = await ragService.embed(phrase);
        list.push({ intent, embedding });
      } catch (err) {
        console.warn(`[Router] Failed to embed phrase "${phrase}":`, err);
      }
    }
  }
  embeddedAnchors = list;
  return embeddedAnchors;
}

// ---------------------------------------------------------------------------
// Classifier
// ---------------------------------------------------------------------------

function classifyIntentKeyword(query: string): { intent: IntentType; matchedKeywords: string[]; score: number } {
  const q = query.toLowerCase();

  const generalMatches = GENERAL_KEYWORDS.filter((kw) => q.includes(kw));
  if (generalMatches.length >= 2) {
    return { intent: "general", matchedKeywords: generalMatches, score: 0.8 };
  }

  for (const { intent, keywords } of BI_INTENTS) {
    const matched = keywords.filter((kw) => q.includes(kw));
    if (matched.length > 0) {
      return { intent, matchedKeywords: matched, score: 0.85 };
    }
  }

  if (generalMatches.length > 0) {
    return { intent: "general", matchedKeywords: generalMatches, score: 0.7 };
  }

  if (/\d+/.test(q) || /data|dataset|column|row/i.test(q)) {
    return { intent: "kpi_query", matchedKeywords: ["numeric/data context"], score: 0.6 };
  }

  return { intent: "general", matchedKeywords: [], score: 0.5 };
}

/**
 * Classify a query intent using hybrid semantic + keyword matching.
 */
export async function classifyIntent(query: string): Promise<{ intent: IntentType; matchedKeywords: string[]; score: number }> {
  const q = query.toLowerCase();

  // 1. Check for strong keyword overrides (saves embedding latency on obvious matches)
  const generalMatches = GENERAL_KEYWORDS.filter((kw) => q.includes(kw));
  if (generalMatches.length >= 3) {
    return { intent: "general", matchedKeywords: generalMatches, score: 0.95 };
  }

  for (const { intent, keywords } of BI_INTENTS) {
    const matched = keywords.filter((kw) => q.includes(kw));
    if (matched.length >= 2) {
      return { intent, matchedKeywords: matched, score: 0.95 };
    }
  }

  // 2. Perform semantic lookup
  try {
    const queryEmbedding = await ragService.embed(query);
    const anchors = await getEmbeddedAnchors();

    let bestIntent: IntentType = "general";
    let highestSimilarity = -1;

    const intentScores: Record<IntentType, number[]> = {
      churn_analysis: [],
      forecast: [],
      executive_report: [],
      dashboard_analysis: [],
      cohort_analysis: [],
      kpi_query: [],
      data_quality: [],
      general: []
    };

    anchors.forEach(({ intent, embedding }) => {
      const similarity = cosineSimilarity(queryEmbedding, embedding);
      intentScores[intent].push(similarity);
    });

    Object.keys(intentScores).forEach((intentStr) => {
      const intent = intentStr as IntentType;
      const scores = intentScores[intent];
      if (scores.length > 0) {
        const maxScore = Math.max(...scores);
        let boostedScore = maxScore;

        // Apply keyword overlap boosting
        const specificKeywords = BI_INTENTS.find((b) => b.intent === intent)?.keywords || [];
        const specificMatches = specificKeywords.filter((kw) => q.includes(kw));
        
        if (specificMatches.length > 0) {
          boostedScore += 0.04 * specificMatches.length;
        }

        if (boostedScore > highestSimilarity) {
          highestSimilarity = boostedScore;
          bestIntent = intent;
        }
      }
    });

    const finalKeywords = [
      ...(BI_INTENTS.find((b) => b.intent === bestIntent)?.keywords || []),
      ...(bestIntent === "general" ? GENERAL_KEYWORDS : [])
    ].filter((kw) => q.includes(kw));

    return {
      intent: bestIntent,
      matchedKeywords: finalKeywords.length > 0 ? finalKeywords : ["semantic similarity"],
      score: highestSimilarity
    };
  } catch (err) {
    console.error("[Router] Semantic classification failed, falling back to keywords:", err);
    return classifyIntentKeyword(query);
  }
}

/**
 * Route a query to the appropriate model.
 *
 * @param intent  The classified intent
 * @returns       "qwen-bi" for BI analytics, "phi3-general" for everything else
 */
export function routeQuery(intent: IntentType): QueryRoute {
  switch (intent) {
    case "kpi_query":
    case "forecast":
    case "churn_analysis":
    case "executive_report":
    case "dashboard_analysis":
    case "cohort_analysis":
    case "data_quality":
      return "qwen-bi";
    default:
      return "phi3-general";
  }
}

/**
 * Main entry point — classify and route in one call (asynchronous).
 */
export async function router(query: string): Promise<RouterResult> {
  const { intent, matchedKeywords, score } = await classifyIntent(query);
  const route = routeQuery(intent);
  
  // High confidence if similarity score is high or has strong keyword backing
  const confidence =
    score >= 0.80 ? "high" :
    score >= 0.60 ? "medium" : "low";

  return { route, intent, confidence, matchedKeywords };
}
