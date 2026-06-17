import assert from "assert";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const BASE_URL = `http://localhost:${process.env.PORT || 3000}`;

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

// State-machine CSV Parser to support commas/quotes within values
function parseCSVText(rawText: string) {
  const lines: string[][] = [];
  let currentField = "";
  let inQuotes = false;
  let currentRow: string[] = [];

  for (let i = 0; i < rawText.length; i++) {
    const char = rawText[i];
    const nextChar = rawText[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      currentRow.push(currentField);
      currentField = "";
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      currentRow.push(currentField);
      lines.push(currentRow);
      currentRow = [];
      currentField = "";
    } else {
      currentField += char;
    }
  }
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField);
    lines.push(currentRow);
  }

  const filteredLines = lines.filter(l => l.length > 0 && l.some(v => v.trim() !== ""));
  if (filteredLines.length === 0) throw new Error("Empty CSV");
  const headers = filteredLines[0].map(h => h.trim());
  const rows = filteredLines.slice(1).map(line => {
    const obj: any = {};
    headers.forEach((h, idx) => {
      const val = line[idx] ? line[idx].trim() : "";
      // Clean numeric formatting if any
      const numericText = val.replace(/[$€£,\s]/g, "");
      if (/^-?\d+(\.\d+)?$/.test(numericText)) {
        obj[h] = Number(numericText);
      } else if (val.toLowerCase() === "true") {
        obj[h] = true;
      } else if (val.toLowerCase() === "false") {
        obj[h] = false;
      } else {
        obj[h] = val;
      }
    });
    return obj;
  });

  return { headers, rows };
}

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
  console.log(`${COLOR.magenta}${COLOR.bright}  AI BI Copilot — Real-World Superstore Verification${COLOR.reset}`);
  console.log(`${COLOR.magenta}${COLOR.bright}====================================================${COLOR.reset}\n`);
  console.log(`Loading superstore.csv from disk...`);
  
  const rawText = fs.readFileSync("superstore.csv", "utf-8");
  const parsed = parseCSVText(rawText);
  console.log(`Loaded: ${COLOR.green}${parsed.rows.length}${COLOR.reset} rows, ${COLOR.green}${parsed.headers.length}${COLOR.reset} columns.\n`);

  const superstoreDataset = {
    name: "Sample - Superstore",
    sourceType: "csv" as const,
    headers: parsed.headers,
    rows: parsed.rows,
    metrics: []
  };

  let savedProfile: any = null;
  let savedForecast: any = null;
  let savedReport: any = null;

  // 1. Profiling Ingestion
  await runTest("POST /api/profile — Ingestion & Profiling (10k rows)", async () => {
    const res = await fetch(`${BASE_URL}/api/profile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataset: superstoreDataset })
    });
    
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const profile = await res.json();
    savedProfile = profile;

    assert.strictEqual(profile.totalRows, 9994, "Expected 9994 rows in Superstore profile");
    assert.ok(profile.datasetQualityScore > 0, "Quality score should be > 0");
    assert.ok(profile.marketKPIs.length > 0, "No KPIs extracted");

    console.log(`\n    * Quality Score: ${COLOR.green}${profile.datasetQualityScore}/100${COLOR.reset}`);
    console.log(`    * Extracted KPIs:`);
    profile.marketKPIs.forEach((kpi: any) => {
      console.log(`      - ${COLOR.yellow}${kpi.label}${COLOR.reset}: ${COLOR.bright}${kpi.value}${COLOR.reset} (${kpi.businessValue})`);
    });
    console.log(`    * Chart Cards Suggested: ${profile.chartCards.length}`);
  });

  // 2. Forecasting
  await runTest("POST /api/forecast — Time-Series Forecast (Sales over Order Date)", async () => {
    const res = await fetch(`${BASE_URL}/api/forecast`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dataset: superstoreDataset,
        labelField: "Order Date",
        targetField: "Sales",
        horizon: 3
      })
    });

    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const forecast = await res.json();
    savedForecast = forecast;

    assert.strictEqual(forecast.horizon, 3, "Expected horizon of 3 periods");
    assert.strictEqual(forecast.predicted.length, 3, "Expected 3 predictions");
    assert.strictEqual(forecast.metricUsed, "Sales", "Expected Sales target metric");

    console.log(`\n    * Confidence: ${forecast.confidence}%`);
    console.log(`    * Forecast Projections:`);
    forecast.predicted.forEach((pt: any) => {
      console.log(`      - Period: ${COLOR.cyan}${pt.label}${COLOR.reset} | Value: ${COLOR.bright}${pt.value.toFixed(2)}${COLOR.reset} (Lower: ${pt.lower.toFixed(2)}, Upper: ${pt.upper.toFixed(2)})`);
    });
  });

  // 3. Query Routing
  await runTest("Query Router Intent Matching on Real-World Business Queries", async () => {
    // Router test A: Quantitative BI query
    const resA = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dataset: superstoreDataset,
        profile: savedProfile,
        query: "What is the total sales and average profit of Technology category?",
        mode: "standard"
      })
    });
    assert.strictEqual(resA.status, 200);
    const dataA = await resA.json();
    assert.strictEqual(dataA.routerResult.route, "qwen-bi", "Should route BI questions to qwen-bi");
    assert.strictEqual(dataA.routerResult.intent, "kpi_query");

    // Router test B: General query
    const resB = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dataset: superstoreDataset,
        profile: savedProfile,
        query: "How do I configure the app settings for CSV file uploads?",
        mode: "standard"
      })
    });
    assert.strictEqual(resB.status, 200);
    const dataB = await resB.json();
    assert.strictEqual(dataB.routerResult.route, "phi3-general", "Should route general questions to phi-3");
    assert.strictEqual(dataB.routerResult.intent, "general");

    console.log(`\n    * BI Query: "What is the total sales..." -> Routed to: ${COLOR.green}${dataA.routerResult.route}${COLOR.reset}`);
    console.log(`    * Help Query: "What formatting functions..." -> Routed to: ${COLOR.green}${dataB.routerResult.route}${COLOR.reset}`);
  });

  // 4. Standard BI Narrative Analysis
  await runTest("POST /api/chat [Standard Mode] — Real Superstore BI Insights", async () => {
    const query = "Analyze our top selling categories and profit margins.";
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dataset: superstoreDataset,
        profile: savedProfile,
        query,
        mode: "standard"
      })
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data.answerMarkdown, "Should return markdown answer");
    assert.strictEqual(data.poweredBy, "qwen-bi");

    console.log(`\n    * LLM Provider: ${COLOR.yellow}${data.poweredBy}${COLOR.reset}`);
    console.log(`    * Sample Response:`);
    console.log(`${COLOR.gray}------------------------------------------------------------`);
    console.log(data.answerMarkdown.split("\n").slice(0, 10).join("\n") + "\n...");
    console.log(`------------------------------------------------------------${COLOR.reset}`);
  });

  // 5. Expert Mode Critique
  await runTest("POST /api/chat [Expert Mode] — Critique on Superstore Discounts & Profits", async () => {
    const query = "Evaluate if high discounts correlate to lower profit segments.";
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dataset: superstoreDataset,
        profile: savedProfile,
        query,
        mode: "expert"
      })
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data.answerMarkdown, "Should return response");
    assert.strictEqual(data.mode, "expert");

    const criticStep = data.pipelineTrace.find((step: any) => step.agentName === "Phi-3 Critic");
    assert.ok(criticStep, "Expert mode trace missing Critic step");

    console.log(`\n    * Expert Review Status: ${COLOR.green}${data.reviewStatus.status}${COLOR.reset} (${data.reviewStatus.reason})`);
    console.log(`    * Critic Step Status: ${COLOR.yellow}${criticStep.status}${COLOR.reset}`);
    console.log(`    * Response length: ${data.answerMarkdown.length} characters`);
  });

  // 6. Executive Report Summarization
  await runTest("POST /api/report — Superstore Executive Slides Generation", async () => {
    const res = await fetch(`${BASE_URL}/api/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dataset: superstoreDataset,
        profile: savedProfile,
        forecast: savedForecast
      })
    });

    assert.strictEqual(res.status, 200);
    const report = await res.json();
    savedReport = report;

    assert.ok(report.title, "Missing title");
    assert.ok(report.keyFindings.length > 0, "Missing findings");
    assert.ok(report.slideDeck.length > 0, "Missing slide layout");

    console.log(`\n    * Report Title: ${COLOR.yellow}${report.title}${COLOR.reset}`);
    console.log(`    * Slides created: ${report.slideDeck.length}`);
  });

  // 7. PDF Export
  await runTest("POST /api/export/pdf — Rendering PDF of Superstore Report", async () => {
    const res = await fetch(`${BASE_URL}/api/export/pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dataset: superstoreDataset,
        profile: savedProfile,
        forecast: savedForecast,
        report: savedReport
      })
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get("Content-Type"), "application/pdf");
    const buffer = await res.arrayBuffer();
    assert.ok(buffer.byteLength > 1000, "Buffer too small");
    console.log(`\n    * Rendered PDF Size: ${COLOR.green}${(buffer.byteLength / 1024).toFixed(2)} KB${COLOR.reset}`);
  });

  // 8. PowerPoint Export
  await runTest("POST /api/export/pptx — Rendering PowerPoint of Superstore Report", async () => {
    const res = await fetch(`${BASE_URL}/api/export/pptx`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dataset: superstoreDataset,
        profile: savedProfile,
        forecast: savedForecast,
        report: savedReport
      })
    });

    assert.strictEqual(res.status, 200);
    assert.ok(res.headers.get("Content-Type")?.includes("presentation"));
    const buffer = await res.arrayBuffer();
    assert.ok(buffer.byteLength > 1000, "Buffer too small");
    console.log(`\n    * Rendered PPTX Size: ${COLOR.green}${(buffer.byteLength / 1024).toFixed(2)} KB${COLOR.reset}`);
  });

  console.log(`\n${COLOR.green}${COLOR.bright}====================================================${COLOR.reset}`);
  console.log(`${COLOR.green}${COLOR.bright} SUCCESS: Real-world Superstore pipelines verified!${COLOR.reset}`);
  console.log(`${COLOR.green}${COLOR.bright}====================================================${COLOR.reset}\n`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
