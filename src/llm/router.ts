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
// Classifier
// ---------------------------------------------------------------------------

/**
 * Classify a query intent using keyword matching.
 * Returns the first BI intent matched (by priority order above),
 * or "general" if no BI intent matches.
 */
export function classifyIntent(query: string): { intent: IntentType; matchedKeywords: string[] } {
  const q = query.toLowerCase();

  // First check if it's clearly a general/help query
  const generalMatches = GENERAL_KEYWORDS.filter((kw) => q.includes(kw));
  if (generalMatches.length >= 2) {
    // Strong signal for general — bail early
    return { intent: "general", matchedKeywords: generalMatches };
  }

  // Check BI intents in priority order
  for (const { intent, keywords } of BI_INTENTS) {
    const matched = keywords.filter((kw) => q.includes(kw));
    if (matched.length > 0) {
      return { intent, matchedKeywords: matched };
    }
  }

  // Weak general signal (1 match) → still general
  if (generalMatches.length > 0) {
    return { intent: "general", matchedKeywords: generalMatches };
  }

  // Default: if query contains numbers or data-like terms, assume BI
  if (/\d+/.test(q) || /data|dataset|column|row/i.test(q)) {
    return { intent: "kpi_query", matchedKeywords: ["numeric/data context"] };
  }

  return { intent: "general", matchedKeywords: [] };
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
 * Main entry point — classify and route in one call.
 */
export function router(query: string): RouterResult {
  const { intent, matchedKeywords } = classifyIntent(query);
  const route = routeQuery(intent);
  const confidence =
    matchedKeywords.length >= 3 ? "high" :
    matchedKeywords.length >= 1 ? "medium" : "low";

  return { route, intent, confidence, matchedKeywords };
}
