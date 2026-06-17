import assert from "assert";
import dotenv from "dotenv";

dotenv.config();

const BASE_URL = `http://localhost:${process.env.PORT || 3000}`;

// Harmonious ANSI colors for beautiful test reporting
const COLOR = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  gray: "\x1b[90m",
};

// Mock Sales Data for pipelines testing
const mockRows = [
  { Date: "2026-01-01", Region: "North", Revenue: 10000, "Marketing Spend": 2000, Churned: false, Customers: 100 },
  { Date: "2026-02-01", Region: "North", Revenue: 15000, "Marketing Spend": 2500, Churned: false, Customers: 120 },
  { Date: "2026-03-01", Region: "North", Revenue: 22000, "Marketing Spend": 3000, Churned: false, Customers: 150 },
  { Date: "2026-04-01", Region: "South", Revenue: 5000, "Marketing Spend": 1000, Churned: true, Customers: 80 },
  { Date: "2026-05-01", Region: "South", Revenue: 6200, "Marketing Spend": 1200, Churned: false, Customers: 85 },
  { Date: "2026-06-01", Region: "South", Revenue: 7100, "Marketing Spend": 1500, Churned: true, Customers: 90 },
  { Date: "2026-07-01", Region: "East", Revenue: 12000, "Marketing Spend": 2200, Churned: false, Customers: 110 },
  { Date: "2026-08-01", Region: "East", Revenue: 13500, "Marketing Spend": 2400, Churned: false, Customers: 115 },
  { Date: "2026-09-01", Region: "East", Revenue: 16000, "Marketing Spend": 2600, Churned: false, Customers: 130 }
];

const mockDataset = {
  name: "Mock Sales & Marketing Dataset",
  sourceType: "csv" as const,
  headers: ["Date", "Region", "Revenue", "Marketing Spend", "Churned", "Customers"],
  rows: mockRows,
  metrics: [] // Will be calculated by the engine/server
};

let savedProfile: any = null;
let savedForecast: any = null;
let savedReport: any = null;

async function runTest(name: string, fn: () => Promise<void>) {
  const start = Date.now();
  process.stdout.write(`  ${COLOR.cyan}Testing:${COLOR.reset} ${name}... `);
  try {
    await fn();
    const duration = Date.now() - start;
    console.log(`${COLOR.green}✓ PASS${COLOR.reset} ${COLOR.gray}(${duration}ms)${COLOR.reset}`);
  } catch (err: any) {
    console.log(`${COLOR.red}✗ FAIL${COLOR.reset}`);
    console.error(`\n  ${COLOR.red}${COLOR.bright}Error in test "${name}":${COLOR.reset}`);
    console.error(`  ${err.message || err}`);
    if (err.stack) {
      console.error(`  ${COLOR.gray}${err.stack.split("\n").slice(1, 4).join("\n")}${COLOR.reset}`);
    }
    console.error("");
    process.exit(1);
  }
}

async function main() {
  console.log(`\n${COLOR.magenta}${COLOR.bright}====================================================${COLOR.reset}`);
  console.log(`${COLOR.magenta}${COLOR.bright}   AI Business Intelligence Copilot — Test Suite${COLOR.reset}`);
  console.log(`${COLOR.magenta}${COLOR.bright}====================================================${COLOR.reset}\n`);
  console.log(`Connecting to server at: ${COLOR.yellow}${BASE_URL}${COLOR.reset}\n`);

  // ----------------------------------------------------
  // TEST 1: Health Check Endpoint
  // ----------------------------------------------------
  await runTest("GET /api/health — Server Status and Model Availability", async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    assert.strictEqual(res.status, 200, `Expected 200 OK, got ${res.status}`);
    const data = await res.json();

    assert.ok(data.provider, "Health payload missing 'provider'");
    console.log(`\n    * Connection Status: ${COLOR.green}Online${COLOR.reset}`);
    console.log(`    * General Model (phi3:mini): ${data.models.phi3.available ? COLOR.green + "Available" : COLOR.red + "Offline"}${COLOR.reset}`);
    console.log(`    * Specialist Model (qwen): ${data.models.qwen.available ? COLOR.green + "Available" : COLOR.red + "Offline"}${COLOR.reset}`);
    console.log(`    * RAG Vector Store Docs: ${COLOR.cyan}${data.rag.documentCount}${COLOR.reset}`);
    
    assert.ok(data.models.phi3, "Missing Phi-3 configuration details");
    assert.ok(data.models.qwen, "Missing Qwen configuration details");
  });

  // ----------------------------------------------------
  // TEST 2: Data Profiling Pipeline
  // ----------------------------------------------------
  await runTest("POST /api/profile — Tabular Ingestion & Automated Profiling", async () => {
    const res = await fetch(`${BASE_URL}/api/profile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataset: mockDataset })
    });
    
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const profile = await res.json();
    savedProfile = profile; // save for subsequent tests

    // Assert structural values
    assert.strictEqual(profile.totalRows, 9, "Expected 9 rows in profile");
    assert.strictEqual(profile.totalColumns, 6, "Expected 6 columns in profile");
    assert.ok(profile.datasetQualityScore > 0, "Quality score should be > 0");
    assert.strictEqual(profile.completenessScore, 100, "Completeness should be 100% for mock data");
    
    // Check extracted KPIs
    assert.ok(profile.marketKPIs.length > 0, "No KPIs extracted");
    console.log(`\n    * Extracted KPIs:`);
    profile.marketKPIs.forEach((kpi: any) => {
      console.log(`      - ${COLOR.yellow}${kpi.label}${COLOR.reset}: ${COLOR.bright}${kpi.value}${COLOR.reset} (${kpi.valueFormula})`);
    });

    // Check cleaner recommendations
    console.log(`    * Data Quality Issues Found: ${profile.cleanerSuggestions.length}`);
    
    // Check chart suggestions
    assert.ok(profile.chartCards.length > 0, "No chart suggestions created");
    console.log(`    * Suggested Charts: ${profile.chartCards.map((c: any) => `${c.title} (${c.type})`).join(", ")}`);
  });

  // ----------------------------------------------------
  // TEST 3: Statistical Forecasting Pipeline
  // ----------------------------------------------------
  await runTest("POST /api/forecast — Time-Series Prediction Bounds", async () => {
    const res = await fetch(`${BASE_URL}/api/forecast`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dataset: mockDataset,
        labelField: "Date",
        targetField: "Revenue",
        horizon: 3
      })
    });

    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const forecast = await res.json();
    savedForecast = forecast;

    assert.strictEqual(forecast.horizon, 3, "Expected horizon of 3 periods");
    assert.strictEqual(forecast.predicted.length, 3, "Expected 3 predicted data points");
    assert.strictEqual(forecast.metricUsed, "Revenue", "Incorrect metric used");
    assert.ok(forecast.confidence > 0, "Confidence score should be > 0");

    console.log(`\n    * Historical Data Points: ${forecast.historical.length}`);
    console.log(`    * Forecasted Bounds:`);
    forecast.predicted.forEach((pt: any) => {
      console.log(`      - Period: ${COLOR.cyan}${pt.label}${COLOR.reset} | Projection: ${COLOR.bright}${pt.value.toFixed(1)}${COLOR.reset} (Interval: ${pt.lower.toFixed(1)} - ${pt.upper.toFixed(1)})`);
    });
  });

  // ----------------------------------------------------
  // TEST 4: Query Routing & Intent Classifier
  // ----------------------------------------------------
  await runTest("Query Router Unit Verification — Keyword Intent Matching", async () => {
    // We can call /api/chat with a query and verify the returned routing parameters
    // Query A: Business/Quantitative -> Routes to Qwen
    const resA = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dataset: mockDataset,
        profile: savedProfile,
        query: "What is our total revenue and average marketing spend?",
        mode: "standard"
      })
    });
    assert.strictEqual(resA.status, 200);
    const dataA = await resA.json();
    assert.strictEqual(dataA.routerResult.route, "qwen-bi", "Should route quantitative queries to Qwen BI Analyst");
    assert.strictEqual(dataA.routerResult.intent, "kpi_query", "Should classify as kpi_query");

    // Query B: Help/Operational -> Routes to Phi3
    const resB = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dataset: mockDataset,
        profile: savedProfile,
        query: "How do I configure the local model using the env file?",
        mode: "standard"
      })
    });
    assert.strictEqual(resB.status, 200);
    const dataB = await resB.json();
    assert.strictEqual(dataB.routerResult.route, "phi3-general", "Should route general user queries to Phi-3");
    assert.strictEqual(dataB.routerResult.intent, "general", "Should classify as general");
    
    console.log(`\n    * Quantitative Query: "What is our total revenue..." -> ${COLOR.green}${dataA.routerResult.route} (${dataA.routerResult.intent})${COLOR.reset}`);
    console.log(`    * General Help Query: "How do I configure..."        -> ${COLOR.green}${dataB.routerResult.route} (${dataB.routerResult.intent})${COLOR.reset}`);
  });

  // ----------------------------------------------------
  // TEST 5: Standard Mode Chat & Local LLM Integration
  // ----------------------------------------------------
  await runTest("POST /api/chat [Standard Mode] — Qwen Narrative Explanation", async () => {
    const query = "Analyze our revenue performance and list key insights.";
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dataset: mockDataset,
        profile: savedProfile,
        query,
        mode: "standard"
      })
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();

    assert.ok(data.answerMarkdown, "Empty answer returned");
    assert.ok(data.poweredBy, "Missing poweredBy attribute");
    assert.ok(data.reviewStatus, "Missing reviewStatus attribute");
    
    console.log(`\n    * Model Used: ${COLOR.yellow}${data.poweredBy}${COLOR.reset}`);
    console.log(`    * Review Status: ${data.reviewStatus.status === "Verified" ? COLOR.green + "Verified" : COLOR.red + data.reviewStatus.status}${COLOR.reset}`);
    console.log(`    * Pipeline Trace Steps: ${data.pipelineTrace.length}`);
    console.log(`    * Sample Response:`);
    console.log(`${COLOR.gray}------------------------------------------------------------`);
    console.log(data.answerMarkdown.split("\n").slice(0, 8).join("\n") + "\n...");
    console.log(`------------------------------------------------------------${COLOR.reset}`);
  });

  // ----------------------------------------------------
  // TEST 6: Expert Mode Chat (Qwen + Phi-3 Critic)
  // ----------------------------------------------------
  await runTest("POST /api/chat [Expert Mode] — Critique and Double-Hop Review", async () => {
    const query = "Analyze our marketing spend vs revenue and give recommendations.";
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dataset: mockDataset,
        profile: savedProfile,
        query,
        mode: "expert"
      })
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();

    assert.ok(data.answerMarkdown, "Empty answer returned");
    assert.strictEqual(data.mode, "expert", "Expected response mode 'expert'");
    
    // Verify that the Phi-3 Critic step ran in the pipeline trace
    assert.ok(data.pipelineTrace, "Missing pipeline trace");
    const criticStep = data.pipelineTrace.find((step: any) => step.agentName === "Phi-3 Critic");
    assert.ok(criticStep, "Expert mode pipeline trace is missing the 'Phi-3 Critic' step");
    assert.ok(criticStep.status === "success" || criticStep.status === "fallback", `Critic step failed with status: ${criticStep.status}`);

    const hasCritiqueSection = data.answerMarkdown.includes("Critical Review") || data.answerMarkdown.includes("🔍 Critical Review");
    
    console.log(`\n    * Review Status: ${COLOR.green}${data.reviewStatus.status}${COLOR.reset} (${data.reviewStatus.reason})`);
    console.log(`    * Pipeline Critic Step status: ${COLOR.yellow}${criticStep.status}${COLOR.reset}`);
    console.log(`    * Response length: ${data.answerMarkdown.length} characters`);
    console.log(`    * Critique section generated: ${hasCritiqueSection ? COLOR.green + "Yes" : COLOR.yellow + "No (no critique points found by Phi-3)"}${COLOR.reset}`);
    console.log(`    * Sample Critique Section:`);
    console.log(`${COLOR.gray}------------------------------------------------------------`);
    const lines = data.answerMarkdown.split("\n");
    const reviewIdx = lines.findIndex((l: string) => l.includes("Critical Review") || l.includes("🔍 Critical Review"));
    if (reviewIdx !== -1) {
      console.log(lines.slice(reviewIdx, reviewIdx + 6).join("\n"));
    } else {
      console.log(lines.slice(-6).join("\n"));
    }
    console.log(`------------------------------------------------------------${COLOR.reset}`);
  });

  // ----------------------------------------------------
  // TEST 7: Executive Report Builder
  // ----------------------------------------------------
  await runTest("POST /api/report — Executive Document Summarization", async () => {
    const res = await fetch(`${BASE_URL}/api/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dataset: mockDataset,
        profile: savedProfile,
        forecast: savedForecast
      })
    });

    assert.strictEqual(res.status, 200);
    const report = await res.json();
    savedReport = report;

    assert.ok(report.title, "Report missing title");
    assert.ok(report.executiveSummary, "Report missing executive summary");
    assert.ok(report.keyFindings.length > 0, "Report missing findings");
    assert.ok(report.recommendations.length > 0, "Report missing recommendations");
    assert.ok(report.slideDeck.length > 0, "Report missing slide deck layout");

    console.log(`\n    * Report Title: ${COLOR.yellow}${report.title}${COLOR.reset}`);
    console.log(`    * Executive Summary: ${COLOR.bright}${report.executiveSummary.slice(0, 100)}...${COLOR.reset}`);
    console.log(`    * Key Findings Count: ${report.keyFindings.length}`);
    console.log(`    * Slide Deck Slides: ${report.slideDeck.length}`);
  });

  // ----------------------------------------------------
  // TEST 8: PDF Export Generation
  // ----------------------------------------------------
  await runTest("POST /api/export/pdf — Binary PDF Rendering Check", async () => {
    const res = await fetch(`${BASE_URL}/api/export/pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dataset: mockDataset,
        profile: savedProfile,
        forecast: savedForecast,
        report: savedReport
      })
    });

    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const contentType = res.headers.get("Content-Type");
    assert.strictEqual(contentType, "application/pdf", "Expected PDF content type");
    
    const buffer = await res.arrayBuffer();
    assert.ok(buffer.byteLength > 1000, "PDF buffer seems too small");
    console.log(`\n    * Rendered PDF Size: ${COLOR.green}${(buffer.byteLength / 1024).toFixed(2)} KB${COLOR.reset}`);
  });

  // ----------------------------------------------------
  // TEST 9: PowerPoint Export Generation
  // ----------------------------------------------------
  await runTest("POST /api/export/pptx — Binary PowerPoint Rendering Check", async () => {
    const res = await fetch(`${BASE_URL}/api/export/pptx`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dataset: mockDataset,
        profile: savedProfile,
        forecast: savedForecast,
        report: savedReport
      })
    });

    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const contentType = res.headers.get("Content-Type");
    assert.ok(contentType?.includes("presentation"), "Expected PowerPoint content type");

    const buffer = await res.arrayBuffer();
    assert.ok(buffer.byteLength > 1000, "PPTX buffer seems too small");
    console.log(`\n    * Rendered PPTX Size: ${COLOR.green}${(buffer.byteLength / 1024).toFixed(2)} KB${COLOR.reset}`);
  });

  console.log(`\n${COLOR.green}${COLOR.bright}====================================================${COLOR.reset}`);
  console.log(`${COLOR.green}${COLOR.bright}    SUCCESS: All 9 pipeline components verified!${COLOR.reset}`);
  console.log(`${COLOR.green}${COLOR.bright}====================================================${COLOR.reset}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
