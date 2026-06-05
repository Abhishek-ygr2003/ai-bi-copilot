/**
 * Qwen2.5-3B BI Analyst Prompt Templates
 *
 * Specialised prompts for the four core BI analysis modes.
 * Each prompt receives pre-computed data — the model NEVER calculates numbers.
 */

// ---------------------------------------------------------------------------
// Base system prompt (used across all templates)
// ---------------------------------------------------------------------------

export const QWEN_BI_SYSTEM = `You are a specialist Business Intelligence Analyst with deep expertise in:
  - KPI interpretation and business performance analysis
  - Customer churn analysis and retention strategy
  - Forecast explanation and trend narration
  - Executive-level reporting and strategic recommendations

STRICT RULES — follow without exception:
  1. NEVER calculate numbers yourself. All metrics are pre-computed and provided in the context.
  2. Use ONLY the numbers in the "evidence" or "kpiData" sections below.
  3. Interpret what the numbers mean for the business.
  4. Write in clear, professional, executive-friendly language.
  5. Format output in Markdown with appropriate headers and bullet points.
  6. If evidence is insufficient, state "Insufficient data" rather than guessing.`;

// ---------------------------------------------------------------------------
// 1. KPI Interpretation
// ---------------------------------------------------------------------------

export function buildKpiPrompt(params: {
  query: string;
  datasetName: string;
  kpis: Array<{ label: string; value: string; businessValue: string }>;
  evidence: string[];
  ragContext?: string;
}): string {
  const kpiBlock = params.kpis
    .map((k) => `**${k.label}**: ${k.value}\n  _${k.businessValue}_`)
    .join("\n\n");

  const ragSection = params.ragContext
    ? `\n\n### Relevant Knowledge Base Context\n${params.ragContext}`
    : "";

  return `## Dataset: ${params.datasetName}

### Computed KPIs (DO NOT recalculate)
${kpiBlock}

### Supporting Evidence
${params.evidence.map((e, i) => `${i + 1}. ${e}`).join("\n")}${ragSection}

### User Question
${params.query}

---

Provide an executive-quality KPI interpretation. Structure your response as:
1. **Headline Finding** — one impactful sentence
2. **KPI Breakdown** — bullet list interpreting each metric
3. **Business Implications** — what this means for strategy
4. **Recommended Actions** — 2–3 concrete next steps`;
}

// ---------------------------------------------------------------------------
// 2. Churn Analysis
// ---------------------------------------------------------------------------

export function buildChurnPrompt(params: {
  query: string;
  datasetName: string;
  churnRate?: string;
  retentionRate?: string;
  atRiskSegments?: string[];
  evidence: string[];
  ragContext?: string;
}): string {
  const ragSection = params.ragContext
    ? `\n\n### Relevant Knowledge Base Context\n${params.ragContext}`
    : "";

  return `## Dataset: ${params.datasetName} — Churn Analysis

### Computed Churn Metrics (DO NOT recalculate)
${params.churnRate ? `- **Churn Rate**: ${params.churnRate}` : ""}
${params.retentionRate ? `- **Retention Rate**: ${params.retentionRate}` : ""}
${params.atRiskSegments && params.atRiskSegments.length > 0 ? `- **At-Risk Segments**: ${params.atRiskSegments.join(", ")}` : ""}

### Supporting Evidence
${params.evidence.map((e, i) => `${i + 1}. ${e}`).join("\n")}${ragSection}

### User Question
${params.query}

---

Provide a comprehensive churn analysis. Structure as:
1. **Churn Overview** — interpret the headline numbers
2. **Risk Segmentation** — which customer groups are most at risk and why
3. **Root Cause Hypotheses** — plausible drivers based on the evidence
4. **Retention Strategies** — 3 specific, evidence-backed interventions
5. **Early Warning Indicators** — metrics to monitor going forward`;
}

// ---------------------------------------------------------------------------
// 3. Forecast Explanation
// ---------------------------------------------------------------------------

export function buildForecastPrompt(params: {
  query: string;
  datasetName: string;
  metric: string;
  method: string;
  confidence: number;
  historical: Array<{ label: string; value: number }>;
  predicted: Array<{ label: string; value: number; upper: number; lower: number }>;
  evidence: string[];
  ragContext?: string;
}): string {
  const historicalBlock = params.historical
    .slice(-4)
    .map((h) => `  ${h.label}: ${h.value.toLocaleString()}`)
    .join("\n");

  const forecastBlock = params.predicted
    .map(
      (p) =>
        `  ${p.label}: **${p.value.toLocaleString()}** (range: ${p.lower.toLocaleString()} – ${p.upper.toLocaleString()})`
    )
    .join("\n");

  const ragSection = params.ragContext
    ? `\n\n### Relevant Knowledge Base Context\n${params.ragContext}`
    : "";

  return `## Dataset: ${params.datasetName} — Forecast Explanation

### Forecast Parameters (pre-computed — DO NOT recalculate)
- **Metric**: ${params.metric}
- **Method**: ${params.method}
- **Model Confidence**: ${params.confidence}%

### Recent Historical Data
${historicalBlock}

### Projected Values
${forecastBlock}

### Supporting Evidence
${params.evidence.map((e, i) => `${i + 1}. ${e}`).join("\n")}${ragSection}

### User Question
${params.query}

---

Explain this forecast in business terms. Structure as:
1. **Forecast Summary** — key projected numbers in plain language
2. **Trend Narrative** — what the trajectory means for the business
3. **Uncertainty Explanation** — interpret the confidence bands
4. **Assumptions & Risks** — what would make the forecast wrong
5. **Planning Implications** — how leadership should use this forecast`;
}

// ---------------------------------------------------------------------------
// 4. Executive Report Narrative
// ---------------------------------------------------------------------------

export function buildExecutiveReportPrompt(params: {
  datasetName: string;
  reportTitle: string;
  executiveSummary: string;
  keyFindings: Array<{ title: string; description: string; metric?: string }>;
  kpis: Array<{ label: string; value: string }>;
  recommendations: string[];
  evidence: string[];
}): string {
  const findingsBlock = params.keyFindings
    .map(
      (f, i) =>
        `${i + 1}. **${f.title}**: ${f.description}${f.metric ? ` _(${f.metric})_` : ""}`
    )
    .join("\n");

  const kpiBlock = params.kpis
    .map((k) => `  - ${k.label}: **${k.value}**`)
    .join("\n");

  return `## Executive Report: ${params.reportTitle}
### Dataset: ${params.datasetName}

### KPI Snapshot (pre-computed)
${kpiBlock}

### Key Findings (pre-computed)
${findingsBlock}

### Strategic Recommendations (pre-computed)
${params.recommendations.map((r, i) => `${i + 1}. ${r}`).join("\n")}

### Supporting Evidence
${params.evidence.map((e, i) => `${i + 1}. ${e}`).join("\n")}

---

Write a polished executive report narrative that:
1. Opens with a compelling **Executive Summary** (2–3 sentences, board-ready)
2. Contextualises each key finding with business significance
3. Connects KPIs to strategic outcomes
4. Elevates the recommendations with specific, time-bound action framing
5. Closes with a **Strategic Outlook** — what success looks like in 90 days

Tone: C-suite, confident, data-driven. Avoid jargon. Format in Markdown.`;
}

// ---------------------------------------------------------------------------
// 5. General BI Query (fallback)
// ---------------------------------------------------------------------------

export function buildGeneralBiPrompt(params: {
  query: string;
  datasetName: string;
  profileSummary: string;
  evidence: string[];
  baseAnswer: string;
  ragContext?: string;
}): string {
  const ragSection = params.ragContext
    ? `\n\n### Relevant Knowledge Base Context\n${params.ragContext}`
    : "";

  return `## Dataset: ${params.datasetName}

### Dataset Profile
${params.profileSummary}

### Pre-computed Answer from Analytics Engine
${params.baseAnswer}

### Supporting Evidence
${params.evidence.map((e, i) => `${i + 1}. ${e}`).join("\n")}${ragSection}

### User Question
${params.query}

---

Provide a clear, professional business intelligence response.
- Use only the numbers from the evidence above.
- Format with Markdown headers and bullets.
- Be concise — aim for 150–300 words.`;
}
