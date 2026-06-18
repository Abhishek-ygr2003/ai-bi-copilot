import express from "express";
import path from "path";
import dotenv from "dotenv";
import fs from "fs";
import PDFDocument from "pdfkit";
import PptxGenJS from "pptxgenjs";
import { createServer as createViteServer } from "vite";
import {
  buildDatasetProfile,
  buildExecutiveReport,
  buildForecast,
  buildQuestionAnswer,
  formatCompactNumber,
  formatNumber,
  titleCase,
} from "./src/lib/analytics";
import type { Dataset, DatasetProfile, ExecutiveReport, ForecastResult, ChartCard } from "./src/types";
import { ollamaClient } from "./models/client.js";
import { PHI3_GENERAL_SYSTEM_PROMPT, PHI3_CRITIC_SYSTEM_PROMPT, QWEN_BI_SYSTEM_PROMPT, QWEN_LOCAL_MODEL } from "./models/config.js";
import { AgentPipelineService, type AgentQueryContext, type AgentMode } from "./src/llm/agent-pipeline";
import { ragService } from "./src/llm/rag";
import { qwenBiClient } from "./src/llm/qwen-bi-client";
import { runPythonCode } from "./src/llm/code-interpreter";
import { buildPythonInterpreterPrompt, PYTHON_INTERPRETER_SYSTEM } from "./src/llm/prompts/python-interpreter";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(express.json({ limit: "100mb" }));
app.use("/scratch", express.static(path.join(process.cwd(), "scratch")));

// ---------------------------------------------------------------------------
// Agent pipeline singleton (wires Ollama into the pipeline service)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Agent pipeline singleton — two separate callables injected
// ---------------------------------------------------------------------------

async function callPhi3Model(prompt: string, systemPromptOverride?: string): Promise<string> {
  try {
    const sysPrompt = systemPromptOverride ?? PHI3_GENERAL_SYSTEM_PROMPT;
    const response = await ollamaClient.chat(
      { messages: [{ role: "user", content: prompt }] },
      sysPrompt
    );
    return response?.message?.content?.trim() ?? "";
  } catch {
    return "";
  }
}

async function callQwenAnalyst(prompt: string, systemOverride?: string) {
  // 1. Try local Ollama first
  try {
    const sysPrompt = systemOverride ?? QWEN_BI_SYSTEM_PROMPT;
    const response = await ollamaClient.chat(
      { messages: [{ role: "user", content: prompt }] },
      sysPrompt,
      QWEN_LOCAL_MODEL
    );
    const content = response?.message?.content?.trim();
    if (content) {
      return {
        text: content,
        source: "local-ollama" as const,
        modelUsed: QWEN_LOCAL_MODEL,
      };
    }
  } catch (err: any) {
    console.warn(`[Qwen BI] Local Ollama failed: ${err?.message || err}`);
  }

  // 2. Fall back to HuggingFace Inference API if local failed/offline
  if (qwenBiClient.isConfigured) {
    console.log(`[Qwen BI] Local model unavailable. Falling back to HuggingFace Inference API...`);
    try {
      const sysPrompt = systemOverride ?? QWEN_BI_SYSTEM_PROMPT;
      const hfResult = await qwenBiClient.generateText(prompt, sysPrompt);
      if (hfResult && hfResult.trim()) {
        return {
          text: hfResult.trim(),
          source: "hf-inference" as const,
          modelUsed: qwenBiClient.modelId,
        };
      }
    } catch (err: any) {
      console.error(`[Qwen BI] HuggingFace fallback failed: ${err?.message || err}`);
    }
  } else {
    console.warn(`[Qwen BI] Local model failed and HuggingFace API is not configured (missing HF_TOKEN).`);
  }

  // 3. Complete failure fallback (empty response triggers deterministic base answer in agent pipeline)
  return {
    text: "",
    source: "none" as const,
    modelUsed: QWEN_LOCAL_MODEL,
  };
}

const agentPipeline = new AgentPipelineService(
  callPhi3Model,
  callQwenAnalyst
);

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

async function bufferFromPdf(doc: any): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer | string) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

function ensureDataset(payload: any): Dataset {
  if (!payload || !payload.dataset) {
    throw new Error("Request body is missing dataset payload.");
  }
  return payload.dataset as Dataset;
}

function ensureProfile(dataset: Dataset, payload: any): DatasetProfile {
  return (payload?.profile as DatasetProfile) || buildDatasetProfile(dataset);
}

// ---------------------------------------------------------------------------
// PDF / PPTX builders (unchanged)
// ---------------------------------------------------------------------------

async function buildPdfBuffer(report: ExecutiveReport, profile?: DatasetProfile | null, forecast?: ForecastResult | null): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 42 });
  const stream = bufferFromPdf(doc);

  const width = 515;
  const accent = "1D9BF0";
  const dark = "0A0A0B";

  doc.fillColor(dark).rect(0, 0, 595.28, 841.89).fill();
  doc.fillColor("FFFFFF").fontSize(22).font("Helvetica-Bold").text(report.title, 42, 48, { width });
  doc.fillColor(accent).fontSize(10).font("Helvetica-Bold").text(report.date.toUpperCase(), 42, 80);
  doc.moveTo(42, 96).lineTo(553, 96).lineWidth(1).strokeColor("#1F2937").stroke();

  doc.moveDown(1.2);
  doc.fillColor("FFFFFF").fontSize(12).font("Helvetica-Bold").text("Executive Summary");
  doc.moveDown(0.35);
  doc.fillColor("E5E7EB").fontSize(10.5).font("Helvetica").text(report.executiveSummary, { width, lineGap: 3 });

  doc.moveDown(1);
  doc.fillColor("FFFFFF").fontSize(12).font("Helvetica-Bold").text("Key Findings");
  doc.moveDown(0.35);
  report.keyFindings.forEach((finding) => {
    doc.fillColor("FFFFFF").fontSize(10.5).font("Helvetica-Bold").text(`• ${finding.title}`);
    doc.fillColor("D1D5DB").fontSize(9.5).font("Helvetica").text(finding.description, { indent: 14, width: width - 14, lineGap: 2 });
    if (finding.metric) {
      doc.fillColor(accent).fontSize(9.5).font("Helvetica-Bold").text(`Metric: ${finding.metric}`, { indent: 14 });
    }
    doc.moveDown(0.45);
  });

  if (profile?.marketKPIs?.length) {
    doc.addPage();
    doc.fillColor("FFFFFF").fontSize(14).font("Helvetica-Bold").text("KPI Summary");
    doc.moveDown(0.4);
    profile.marketKPIs.slice(0, 4).forEach((kpi) => {
      doc.fillColor("FFFFFF").fontSize(10.5).font("Helvetica-Bold").text(kpi.label);
      doc.fillColor(accent).fontSize(18).font("Helvetica-Bold").text(kpi.value);
      doc.fillColor("D1D5DB").fontSize(9.5).font("Helvetica").text(kpi.businessValue, { width, lineGap: 2 });
      doc.moveDown(0.5);
    });
  }

  doc.addPage();
  doc.fillColor("FFFFFF").fontSize(14).font("Helvetica-Bold").text("Strategic Recommendations");
  doc.moveDown(0.4);
  report.recommendations.forEach((recommendation, index) => {
    doc.fillColor("FFFFFF").fontSize(10.5).font("Helvetica-Bold").text(`${index + 1}. ${recommendation}`);
    doc.moveDown(0.25);
  });

  if (forecast) {
    doc.moveDown(0.8);
    doc.fillColor("FFFFFF").fontSize(14).font("Helvetica-Bold").text("Forecast Snapshot");
    doc.moveDown(0.35);
    doc.fillColor("D1D5DB").fontSize(9.5).font("Helvetica").text(`Confidence: ${forecast.confidence}%`, { continued: true });
    doc.text(`  |  Metric: ${titleCase(forecast.metricUsed)}`);
    doc.moveDown(0.4);
    forecast.predicted.forEach((point) => {
      doc.fillColor("FFFFFF").fontSize(10).font("Helvetica-Bold").text(point.label);
      doc.fillColor(accent).fontSize(11).font("Helvetica-Bold").text(`Projected ${formatCompactNumber(point.value)}`);
      doc.fillColor("D1D5DB").fontSize(9.5).font("Helvetica").text(`Band: ${formatCompactNumber(point.lower)} to ${formatCompactNumber(point.upper)}`);
      doc.moveDown(0.3);
    });
  }

  doc.end();
  return await stream;
}

async function buildPptxBuffer(
  report: ExecutiveReport,
  profile?: DatasetProfile | null,
  forecast?: ForecastResult | null,
  customCharts?: ChartCard[] | null
): Promise<Buffer> {
  const PptxGen = (PptxGenJS as any).default || PptxGenJS;
  const pptx = new PptxGen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "AI Business Intelligence Copilot";
  pptx.company = "Local BI";
  pptx.subject = report.title;
  pptx.title = report.title;

  const slideWidth = 13.333;

  const addBaseSlide = (slide: any) => {
    slide.background = { color: "0A0A0B" };
    slide.addText(report.date, { x: 0.55, y: 0.35, w: 2.5, h: 0.3, fontFace: "Aptos", fontSize: 10, color: "8B949E", bold: true });
    slide.addText("Local BI Copilot", { x: slideWidth - 2.8, y: 0.35, w: 2.2, h: 0.3, align: "right", fontFace: "Aptos", fontSize: 10, color: "1D9BF0", bold: true });
  };

  const addBox = (slide: any, x: number, y: number, w: number, h: number, title: string, value: string, subtitle?: string) => {
    slide.addText([
      { text: title, options: { breakLine: true, bold: true, fontSize: 10, color: "8B949E" } },
      { text: value, options: { breakLine: true, bold: true, fontSize: 22, color: "FFFFFF" } },
      ...(subtitle ? [{ text: subtitle, options: { breakLine: true, fontSize: 8.5, color: "CBD5E1" } }] : []),
    ], { x, y, w, h, margin: 0.12, fill: { color: "111113", transparency: 2 }, line: { color: "1F2937", pt: 1 }, radius: 0.12 });
  };

  // 1. Process Slide Deck
  if (report.slideDeck?.length) {
    for (const slideData of report.slideDeck) {
      const slide = pptx.addSlide();
      addBaseSlide(slide);

      if (slideData.layout === "title") {
        slide.addText(slideData.title, { x: 0.6, y: 1.0, w: 11.8, h: 0.9, fontFace: "Aptos Display", fontSize: 24, bold: true, color: "FFFFFF" });
        if (slideData.subtitle) {
          slide.addText(slideData.subtitle, { x: 0.6, y: 2.0, w: 11.8, h: 1.8, fontFace: "Aptos", fontSize: 13, color: "D1D5DB", margin: 0 });
        }
        // Add market KPIs at the bottom for cover slide
        if (profile?.marketKPIs?.length && report.slideDeck[0]?.id === slideData.id) {
          profile.marketKPIs.slice(0, 3).forEach((kpi, index) => {
            addBox(slide, 0.6 + index * 4.15, 4.2, 3.8, 1.4, kpi.label, kpi.value, kpi.businessValue);
          });
        }
      } else if (slideData.layout === "metrics") {
        slide.addText(slideData.title, { x: 0.6, y: 0.8, w: 11.8, h: 0.4, fontFace: "Aptos Display", fontSize: 22, bold: true, color: "FFFFFF" });
        if (slideData.metrics?.length) {
          slideData.metrics.forEach((metric, index) => {
            addBox(slide, 0.6 + index * 4.15, 2.0, 3.8, 1.8, metric.label, metric.value, metric.sub);
          });
        }
      } else if (slideData.layout === "bullets") {
        slide.addText(slideData.title, { x: 0.6, y: 0.8, w: 11.8, h: 0.4, fontFace: "Aptos Display", fontSize: 22, bold: true, color: "FFFFFF" });
        if (slideData.bullets?.length) {
          slideData.bullets.forEach((bullet, index) => {
            slide.addText(bullet, {
              x: 0.8,
              y: 1.5 + index * 0.9,
              w: 11.8,
              h: 0.7,
              fontFace: "Aptos",
              fontSize: 12,
              color: "E5E7EB",
              margin: 0
            });
          });
        }
      } else if (slideData.layout === "chart") {
        slide.addText(slideData.title, { x: 0.6, y: 0.8, w: 11.8, h: 0.4, fontFace: "Aptos Display", fontSize: 22, bold: true, color: "FFFFFF" });

        const chartConfig = slideData.chartConfig;
        if (chartConfig) {
          // Find matching chart in custom charts or profile suggestions
          const targetChart = customCharts?.find(c => c.title === chartConfig.title)
            || profile?.chartCards?.find(c => c.title === chartConfig.title)
            || customCharts?.[0]
            || profile?.chartCards?.[0];

          if (targetChart && targetChart.data?.length) {
            let pptxChartType = pptx.ChartType.bar;
            if (targetChart.type === "line") pptxChartType = pptx.ChartType.line;
            else if (targetChart.type === "pie") pptxChartType = pptx.ChartType.pie;
            else if (targetChart.type === "scatter") pptxChartType = pptx.ChartType.scatter;
            else if (targetChart.type === "area") pptxChartType = pptx.ChartType.area;

            const seriesName = targetChart.yAxisKey || "Value";
            const labels = targetChart.data.map((row: any) => String(row[targetChart.xAxisKey] ?? ""));
            const values = targetChart.data.map((row: any) => {
              const v = parseFloat(row[targetChart.yAxisKey]);
              return isNaN(v) ? 0 : v;
            });

            const pptxChartData = [
              {
                name: seriesName,
                labels,
                values
              }
            ];

            slide.addChart(pptxChartType, pptxChartData, {
              x: 0.6,
              y: 1.5,
              w: 12.0,
              h: 4.8,
              showLegend: targetChart.type === "pie",
              legendPos: "r",
              showTitle: false,
              chartColors: ["38BDF8", "34D399", "06B6D4", "F59E0B", "F43F5E", "8B5CF6"],
              valAxisLabelColor: "CBD5E1",
              valAxisLineColor: "1F2937",
              catAxisLabelColor: "CBD5E1",
              catAxisLineColor: "1F2937",
              titleColor: "FFFFFF",
              legendColor: "CBD5E1",
              valGridLine: { color: "1F2937", style: "solid" }
            });
          } else {
            slide.addText("No chart data available.", {
              x: 0.6, y: 1.5, w: 12, h: 4,
              align: "center", fill: { color: "111113" }, line: { color: "1F2937", pt: 1 },
              fontFace: "Aptos", fontSize: 14, color: "CBD5E1"
            });
          }
        }
      }
    }
  }

  // 2. Forecast Slide (if present)
  if (forecast) {
    const slide = pptx.addSlide();
    addBaseSlide(slide);
    slide.addText("Forecast Snapshot", { x: 0.6, y: 0.8, w: 6, h: 0.4, fontFace: "Aptos Display", fontSize: 22, bold: true, color: "FFFFFF" });
    slide.addText(`Confidence: ${forecast.confidence}%`, { x: 0.7, y: 1.4, w: 4, h: 0.4, fontFace: "Aptos", fontSize: 16, bold: true, color: "1D9BF0" });
    forecast.predicted.slice(0, 5).forEach((point, index) => {
      addBox(slide, 0.7 + index * 2.45, 2.1, 2.15, 1.7, point.label, formatCompactNumber(point.value), `Band ${formatCompactNumber(point.lower)} - ${formatCompactNumber(point.upper)}`);
    });
  }

  const raw = await pptx.write({ outputType: "nodebuffer" });
  if (Buffer.isBuffer(raw)) return raw;
  if (raw instanceof Uint8Array) return Buffer.from(raw);
  if (raw instanceof ArrayBuffer) return Buffer.from(new Uint8Array(raw));
  return Buffer.from(String(raw));
}

function jsonResponseBuffer(res: express.Response, buffer: Buffer, contentType: string, fileName: string) {
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", `attachment; filename=\"${fileName}\"`);
  res.send(buffer);
}

// ---------------------------------------------------------------------------
// API Routes
// ---------------------------------------------------------------------------

/**
 * GET /api/health
 * Returns Phi-3 (Ollama) status + Qwen (Ollama) status + RAG store stats.
 */
app.get("/api/health", async (req, res) => {
  const [ollamaStatus, qwenStatus] = await Promise.all([
    ollamaClient.checkStatus(),
    ollamaClient.checkStatus(QWEN_LOCAL_MODEL),
  ]);
  const ragStats = ragService.getStoreStats();

  // Overall "available" = both models are up ideally, or at least orchestrator
  const available = ollamaStatus.available;

  res.json({
    available,
    provider: "ollama (dual model)",
    model: `phi3:mini + ${QWEN_LOCAL_MODEL}`,
    models: {
      phi3: {
        tag: ollamaStatus.model,
        available: ollamaStatus.available,
        role: "General assistant, Expert Mode critic",
        size: ollamaStatus.modelInfo?.size ?? "unknown",
        error: ollamaStatus.error,
      },
      qwen: {
        tag: qwenStatus.model,
        available: qwenStatus.available,
        role: "BI Analyst specialist",
        error: qwenStatus.error,
      },
    },
    rag: {
      documentCount: ragService.documentCount,
      datasetIds: ragService.datasetIds,
      byType: ragStats,
    },
    baseUrl: `http://localhost:${process.env.PORT || 3000}`,
    message: available
      ? `Ready — Phi-3: ${ollamaStatus.available ? "✓" : "✗"} | Qwen: ${qwenStatus.available ? "✓" : "✗"}`
      : `Models offline. Ollama: ${ollamaStatus.error ?? "unknown"}`,
  });
});

/**
 * POST /api/agent/status
 * Model health check: Ollama Phi-3 + Ollama Qwen.
 */
app.post("/api/agent/status", async (req, res) => {
  try {
    const [ollamaStatus, qwenStatus] = await Promise.all([
      ollamaClient.checkStatus(),
      ollamaClient.checkStatus(QWEN_LOCAL_MODEL),
    ]);
    res.json({
      phi3: ollamaStatus,
      qwen: qwenStatus,
      bothAvailable: ollamaStatus.available && qwenStatus.available,
      anyAvailable: ollamaStatus.available || qwenStatus.available,
      ragDocumentCount: ragService.documentCount,
      ragStats: ragService.getStoreStats(),
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Status check failed." });
  }
});

/**
 * POST /api/profile
 * Build dataset profile (deterministic) and auto-index into RAG.
 */
app.post("/api/profile", async (req, res) => {
  try {
    const dataset = ensureDataset(req.body);
    const profile = buildDatasetProfile(dataset);

    // Auto-index the profile into the RAG store (async, non-blocking)
    ragService.indexDatasetProfile(
      dataset.name,
      dataset.name,
      {
        summary: profile.summary,
        marketKPIs: profile.marketKPIs,
        analystInsights: profile.analystInsights,
        topSignals: profile.topSignals,
      }
    ).catch((err) => console.warn("[RAG] Index failed:", err));

    res.json(profile);
  } catch (error: any) {
    res.status(400).json({ error: error?.message || "Unable to profile dataset." });
  }
});

/**
 * POST /api/rag/index
 * Explicitly index a dataset profile or report into the RAG store.
 */
app.post("/api/rag/index", async (req, res) => {
  try {
    const { type, datasetId, datasetName, profile, report } = req.body;

    if (type === "profile" && profile && datasetId) {
      await ragService.indexDatasetProfile(datasetId, datasetName || datasetId, profile);
      return res.json({ success: true, documentCount: ragService.documentCount, message: `Indexed profile for "${datasetName}"` });
    }

    if (type === "report" && report && datasetId) {
      await ragService.indexReport(datasetId, report);
      return res.json({ success: true, documentCount: ragService.documentCount, message: `Indexed report "${report.title}"` });
    }

    res.status(400).json({ error: "Provide type='profile'|'report' with matching payload." });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "RAG indexing failed." });
  }
});

/**
 * POST /api/chat
 * Routing:
 *   BI queries  → Analytics Engine → RAG → Qwen BI Analyst (HuggingFace)
 *   General     → Phi-3 Mini (Ollama)
 *   Expert Mode → Qwen BI Analyst → Phi-3 Critic → Merged response
 *
 * Request body: { dataset, profile?, query, mode?: 'standard'|'expert' }
 */
app.post("/api/chat", async (req, res) => {
  try {
    const dataset = ensureDataset(req.body);
    const profile = ensureProfile(dataset, req.body);
    const query = String(req.body?.query || "").trim();
    const mode: AgentMode = (req.body?.mode === "expert") ? "expert" : "standard";

    if (!query) {
      return res.status(400).json({ error: "Missing query parameter." });
    }

    // Step 1: Deterministic analytics engine — always runs first
    const answer = buildQuestionAnswer(dataset, profile, query);
    const baseAnswer = answer.answerMarkdown;
    const evidence = answer.evidence || [];

    // Step 2: Agent pipeline (intent classification → model routing)
    const pipelineCtx: AgentQueryContext = {
      query,
      datasetId: dataset.name,
      datasetName: dataset.name,
      profileSummary: profile.summary,
      evidence,
      baseAnswer,
      kpis: profile.marketKPIs,
      mode,
    };

    const result = await agentPipeline.run(pipelineCtx);

    res.json({
      // Core answer
      ...answer,
      answerMarkdown: result.finalMarkdown,
      // Agent metadata
      agentThought: result.agentThought || profile.agentThought,
      reviewStatus: result.reviewStatus,
      routerResult: result.routerResult,
      poweredBy: result.poweredBy,
      // Pipeline trace (hidden debug panel)
      pipelineTrace: result.pipelineTrace,
      // RAG context used
      ragContext: result.ragContext,
      // Mode used
      mode: result.mode,
    });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || "Unable to answer query." });
  }
});

/**
 * Helper to serialize dataset payload to CSV in the scratch/ directory.
 */
function writeDatasetToCsv(dataset: Dataset): string {
  const scratchDir = path.join(process.cwd(), "scratch");
  if (!fs.existsSync(scratchDir)) {
    fs.mkdirSync(scratchDir, { recursive: true });
  }
  const csvPath = path.join(scratchDir, "dataset.csv");

  const escapeCell = (val: any) => {
    if (val === null || val === undefined) return "";
    const str = String(val);
    if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headerLine = dataset.headers.map(escapeCell).join(",");
  const rowLines = dataset.rows.map((row) =>
    dataset.headers.map((h) => escapeCell(row[h])).join(",")
  );
  const csvContent = [headerLine, ...rowLines].join("\n");
  fs.writeFileSync(csvPath, csvContent, "utf8");
  return csvPath;
}

/**
 * POST /api/chat/interpret
 * Python Code Interpreter route.
 * Generates and runs Python data analysis on local dataset securely.
 */
app.post("/api/chat/interpret", async (req, res) => {
  try {
    const dataset = ensureDataset(req.body);
    const query = String(req.body?.query || "").trim();

    if (!query) {
      return res.status(400).json({ error: "Missing query parameter." });
    }

    // 1. Write dataset to scratch/dataset.csv
    const datasetPath = writeDatasetToCsv(dataset);

    // 2. Build Python generation prompt
    const prompt = buildPythonInterpreterPrompt({
      query,
      datasetName: dataset.name,
      headers: dataset.headers,
      columns: dataset.metrics.map((m) => ({
        name: m.name,
        type: m.type,
        distinctValues: m.distinctValues,
      })),
    });

    // 3. Request python script from Qwen
    const response = await callQwenAnalyst(prompt, PYTHON_INTERPRETER_SYSTEM);
    let code = response.text.trim();

    // Clean up code block backticks
    const match = code.match(/```python([\s\S]*?)```/i);
    if (match) {
      code = match[1].trim();
    } else {
      const generalMatch = code.match(/```([\s\S]*?)```/);
      if (generalMatch) {
        code = generalMatch[1].trim();
      }
    }

    const pipelineTrace: any[] = [
      {
        stepIndex: 0,
        agentName: "Query Router",
        model: "Manual override",
        role: "Router",
        inputSummary: `Interpreter mode: "${query.slice(0, 40)}..."`,
        outputSummary: "Routed to Code Interpreter agent.",
        durationMs: 0,
        status: "success",
      },
      {
        stepIndex: 1,
        agentName: "Code Generator",
        model: response.modelUsed,
        role: `Code Generator (${response.source === "local-ollama" ? "Local Ollama" : response.source === "hf-inference" ? "HuggingFace API" : "None"})`,
        inputSummary: `Columns: ${dataset.headers.length} | Prompt: "${query.slice(0, 30)}..."`,
        outputSummary: `Generated python script (${code.split("\n").length} lines)`,
        durationMs: 0,
        status: response.source === "none" ? "error" : "success",
      }
    ];

    if (!code) {
      return res.json({
        success: false,
        stdout: "",
        stderr: "Code generator returned an empty response. Verify local Ollama or HuggingFace configuration.",
        code: "",
        poweredBy: response.source === "none" ? "fallback" : "qwen-bi",
        pipelineTrace,
      });
    }

    // 4. Run the code in Python subprocess sandbox
    const t0 = Date.now();
    const interpretResult = await runPythonCode(code, datasetPath);
    const duration = Date.now() - t0;

    pipelineTrace.push({
      stepIndex: 2,
      agentName: "Code Interpreter",
      model: "Python Subprocess",
      role: "Sandbox Execution",
      inputSummary: `Executing script: ${code.slice(0, 60)}...`,
      outputSummary: interpretResult.success
        ? `Finished successfully in ${duration}ms. Stdout: "${interpretResult.stdout.replace(/\n/g, " ").slice(0, 40)}..."`
        : `Execution failed: ${interpretResult.error || interpretResult.stderr}`,
      durationMs: duration,
      status: interpretResult.success ? "success" : "error",
      error: interpretResult.error,
    });

    res.json({
      success: interpretResult.success,
      stdout: interpretResult.stdout,
      stderr: interpretResult.stderr,
      code,
      chartPath: interpretResult.chartPath,
      poweredBy: response.source === "none" ? "fallback" : "qwen-bi",
      pipelineTrace,
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Internal Code Interpreter error." });
  }
});

/**
 * POST /api/forecast
 * Pure deterministic forecast — no LLM involvement.
 */
app.post("/api/forecast", (req, res) => {
  try {
    const dataset = ensureDataset(req.body);
    const labelField = String(req.body?.labelField || "");
    const targetField = String(req.body?.targetField || "");
    const horizon = Number(req.body?.horizon || 6);

    if (!labelField || !targetField) {
      return res.status(400).json({ error: "labelField and targetField are required." });
    }

    const forecast = buildForecast(dataset, labelField, targetField, horizon);
    res.json(forecast);
  } catch (error: any) {
    res.status(400).json({ error: error?.message || "Unable to generate forecast." });
  }
});

/**
 * POST /api/report
 * Build executive report (deterministic) and index into RAG.
 */
app.post("/api/report", async (req, res) => {
  try {
    const dataset = ensureDataset(req.body);
    const profile = ensureProfile(dataset, req.body);
    const forecast = (req.body?.forecast as ForecastResult | null) || null;
    const report = buildExecutiveReport(dataset, profile, forecast);

    // Index report into RAG (async, non-blocking)
    ragService.indexReport(dataset.name, report).catch((err) =>
      console.warn("[RAG] Report index failed:", err)
    );

    res.json(report);
  } catch (error: any) {
    res.status(400).json({ error: error?.message || "Unable to build report." });
  }
});

/**
 * POST /api/export/pdf
 */
app.post("/api/export/pdf", async (req, res) => {
  try {
    const dataset = req.body?.dataset as Dataset | undefined;
    const profile = dataset ? ensureProfile(dataset, req.body) : null;
    const forecast = (req.body?.forecast as ForecastResult | null) || null;
    const report = (req.body?.report as ExecutiveReport | undefined) || (dataset && profile ? buildExecutiveReport(dataset, profile, forecast) : null);

    if (!report) {
      return res.status(400).json({ error: "Report payload is required." });
    }

    const buffer = await buildPdfBuffer(report, profile, forecast);
    jsonResponseBuffer(res, buffer, "application/pdf", `${report.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf`);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Unable to export PDF." });
  }
});

/**
 * POST /api/export/pptx
 */
app.post("/api/export/pptx", async (req, res) => {
  try {
    const dataset = req.body?.dataset as Dataset | undefined;
    const profile = dataset ? ensureProfile(dataset, req.body) : null;
    const forecast = (req.body?.forecast as ForecastResult | null) || null;
    const report = (req.body?.report as ExecutiveReport | undefined) || (dataset && profile ? buildExecutiveReport(dataset, profile, forecast) : null);
    const customCharts = req.body?.customCharts as ChartCard[] | undefined;

    if (!report) {
      return res.status(400).json({ error: "Report payload is required." });
    }

    const buffer = await buildPptxBuffer(report, profile, forecast, customCharts);
    jsonResponseBuffer(res, buffer, "application/vnd.openxmlformats-officedocument.presentationml.presentation", `${report.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pptx`);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Unable to export PowerPoint." });
  }
});

// ---------------------------------------------------------------------------
// Dev server / static serving
// ---------------------------------------------------------------------------

async function initServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`\n🚀 AI Business Intelligence Copilot — http://localhost:${PORT}`);
    console.log(`   Phi-3 Mini   : phi3:mini (Ollama — general assistant + critic)`);
    console.log(`   Qwen BI      : ${QWEN_LOCAL_MODEL} (Ollama — BI Analyst)`);
    console.log();
  });
}

initServer().catch((error) => {
  console.error("Fatal server initialization error:", error);
  process.exit(1);
});
