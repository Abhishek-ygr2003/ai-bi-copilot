import React, { useEffect, useMemo, useState } from "react";
import {
  AgentLog,
  ChatMessage,
  Dataset,
  DatasetProfile,
  ExecutiveReport,
  ForecastResult,
  AgentMode,
  PipelineStep,
  ChartCard,
} from "./types";
import {
  applyDatasetAction,
  buildDatasetProfile,
  buildExecutiveReport,
  buildForecast,
  formatCompactNumber,
  rebuildDataset,
  titleCase,
  buildCustomChartData,
} from "./lib/analytics";
import Sidebar from "./components/Sidebar";
import CustomChart from "./components/CustomCharts";
import AgentPanel from "./components/AgentPanel";
import ReportView from "./components/ReportView";
import DatasetSelector from "./components/DatasetSelector";
import DataGrid from "./components/DataGrid";
import ChatPanel from "./components/ChatPanel";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Database,
  FileText,
  Layers,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Upload,
} from "lucide-react";

interface LocalModelStatus {
  available: boolean;
  provider: string;
  model: string;
  baseUrl: string;
}

function getTimestamp(): string {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function createLogEntry(agentName: AgentLog["agentName"], message: string, type: AgentLog["type"] = "info"): AgentLog {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    agentName,
    message,
    timestamp: getTimestamp(),
    type,
  };
}

function buildWelcomeMessage(dataset: Dataset, profile: DatasetProfile): ChatMessage {
  return {
    id: "welcome",
    sender: "assistant",
    text: `### Welcome to the local BI workspace\n\nI loaded **${dataset.name}** and profiled it entirely on your machine.\n\n- **Quality score:** ${profile.datasetQualityScore}/100\n- **Completeness:** ${profile.completenessScore}%\n- **Rows:** ${formatCompactNumber(dataset.rows.length)}\n\nAsk me about revenue, profit, churn, top customers, or trends over time.`,
    timestamp: getTimestamp(),
  };
}

function deriveForecastInput(dataset: Dataset): { label: string; target: string; horizon: number } {
  const dateColumn = dataset.metrics.find((metric) => metric.type === "date" || /date|month|quarter|year|week|day|signup/i.test(metric.name));
  const numericColumn =
    dataset.metrics.find((metric) => metric.type === "number" && /revenue|sales|profit|amount|cost|margin|mrr|arr|score|value/i.test(metric.name)) ??
    dataset.metrics.find((metric) => metric.type === "number");

  return {
    label: dateColumn?.name ?? dataset.headers[0] ?? "",
    target: numericColumn?.name ?? dataset.headers.find((header) => dataset.metrics.find((metric) => metric.name === header)?.type === "number") ?? dataset.headers[0] ?? "",
    horizon: 6,
  };
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function buildEmptyStateCards() {
  return [
    {
      title: "Data profiling",
      description: "Missing values, duplicates, type checks, and outlier detection are computed locally after upload.",
      icon: Database,
    },
    {
      title: "Forecasting",
      description: "A lightweight regression model projects the next periods directly in the browser.",
      icon: TrendingUp,
    },
    {
      title: "Executive delivery",
      description: "Board-ready summaries can be exported to PDF and PowerPoint from the local report engine.",
      icon: FileText,
    },
  ];
}

export default function App() {
  const [currentView, setCurrentView] = useState<string>("dashboard");
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [profile, setProfile] = useState<DatasetProfile | null>(null);
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [activeAgent, setActiveAgent] = useState<string>("System");
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [agentThought, setAgentThought] = useState<string>("");
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [forecastResult, setForecastResult] = useState<ForecastResult | null>(null);
  const [forecastInput, setForecastInput] = useState<{ label: string; target: string; horizon: number }>({
    label: "",
    target: "",
    horizon: 6,
  });
  const [executiveReport, setExecutiveReport] = useState<ExecutiveReport | null>(null);
  const [modelStatus, setModelStatus] = useState<LocalModelStatus>({
    available: false,
    provider: "ollama",
    model: "phi3:mini + bi-analyst",
    baseUrl: "http://localhost:11434",
  });
  /** Dual-model pipeline mode: standard, expert, or interpreter */
  const [agentMode, setAgentMode] = useState<AgentMode>("standard");
  /** Latest pipeline trace from the most recent chat response */
  const [pipelineTrace, setPipelineTrace] = useState<PipelineStep[] | undefined>(undefined);
  /** Customized dashboard visual cards */
  const [customCharts, setCustomCharts] = useState<ChartCard[]>([]);
  /** Current index of the dashboard chart being customized */
  const [editingChartIdx, setEditingChartIdx] = useState<number | null>(null);

  const numericColumns = useMemo(
    () => dataset?.metrics.filter((metric) => metric.type === "number").map((metric) => metric.name) ?? [],
    [dataset],
  );

  const dateColumns = useMemo(
    () =>
      dataset?.metrics.filter((metric) => metric.type === "date" || /date|month|quarter|year|week|day|signup/i.test(metric.name)).map((metric) => metric.name) ?? [],
    [dataset],
  );

  useEffect(() => {
    let active = true;

    const loadHealth = async () => {
      try {
        const response = await fetch("/api/health");
        if (!response.ok) {
          throw new Error(`Health check failed with ${response.status}`);
        }

        const data = await response.json();
        if (!active) return;

        setModelStatus({
          available: Boolean(data.available),
          provider: data.provider || "ollama",
          model: data.model || "qwen2.5:3b-instruct",
          baseUrl: data.baseUrl || "http://localhost:11434",
        });
      } catch {
        if (!active) return;
        setModelStatus({
          available: false,
          provider: "ollama",
          model: "qwen2.5:3b-instruct",
          baseUrl: "http://localhost:11434",
        });
      }
    };

    void loadHealth();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!dataset) {
      return;
    }

    setForecastInput((previous) => {
      const defaults = deriveForecastInput(dataset);
      return {
        label: previous.label && dataset.headers.includes(previous.label) ? previous.label : defaults.label,
        target: previous.target && dataset.headers.includes(previous.target) ? previous.target : defaults.target,
        horizon: previous.horizon || defaults.horizon,
      };
    });
  }, [dataset]);

  const addLog = (agentName: AgentLog["agentName"], message: string, type: AgentLog["type"] = "info") => {
    setLogs((previous) => [createLogEntry(agentName, message, type), ...previous]);
  };

  const refreshProfile = (targetDataset: Dataset) => {
    const nextProfile = buildDatasetProfile(targetDataset);
    setProfile(nextProfile);
    setAgentThought(nextProfile.agentThought);
    setForecastInput((previous) => {
      const defaults = deriveForecastInput(targetDataset);
      return {
        label: previous.label && targetDataset.headers.includes(previous.label) ? previous.label : defaults.label,
        target: previous.target && targetDataset.headers.includes(previous.target) ? previous.target : defaults.target,
        horizon: previous.horizon || defaults.horizon,
      };
    });
    return nextProfile;
  };

  const handleDatasetLoaded = (loadedDataset: Dataset, parsedLogs: string[]) => {
    setDataset(loadedDataset);
    setForecastResult(null);
    setExecutiveReport(null);
    setCurrentView("dashboard");
    setActiveAgent("Data Analyst");

    const nextProfile = refreshProfile(loadedDataset);
    setCustomCharts(nextProfile.chartCards);
    setEditingChartIdx(null);
    const seededLogs: AgentLog[] = [
      ...parsedLogs.map((message) => createLogEntry("System", message, "info")),
      createLogEntry("System", `Workbook ${loadedDataset.name} is now ready for local profiling.`, "success"),
      createLogEntry("Data Analyst", `Quality score calculated at ${nextProfile.datasetQualityScore}/100.`, "success"),
      createLogEntry("Data Cleaner", `${nextProfile.cleanerSuggestions.length} cleanup recommendation(s) detected.`, nextProfile.cleanerSuggestions.length > 0 ? "warning" : "info"),
      createLogEntry("Dashboard Agent", `${nextProfile.chartCards.length} chart suggestion(s) prepared for the dashboard.`, "info"),
    ];
    setLogs(seededLogs.reverse());

    setChatHistory([
      buildWelcomeMessage(loadedDataset, nextProfile),
    ]);

    setActiveAgent("System");
  };

  const handleCleanDataset = (actionKey: string, columnName: string) => {
    if (!dataset) return;

    setActiveAgent("Data Cleaner");
    setIsProcessing(true);
    addLog("Data Cleaner", `Executing ${actionKey} on ${columnName}.`, "process");

    const result = applyDatasetAction(dataset, actionKey, columnName);
    const nextDataset = result.dataset;
    setDataset(nextDataset);
    setForecastResult(null);
    setExecutiveReport(null);
    refreshProfile(nextDataset);

    addLog("Data Cleaner", result.message, "success");
    addLog("Data Analyst", `Profile refreshed after cleaning.`, "info");
    setIsProcessing(false);
    setActiveAgent("System");
  };

  const handleUpdateCell = (rowIdx: number, header: string, value: any) => {
    if (!dataset) return;

    const updatedRows = dataset.rows.map((row, index) => (index === rowIdx ? { ...row, [header]: value } : row));
    const nextDataset = rebuildDataset(dataset, updatedRows);

    setActiveAgent("Data Cleaner");
    setIsProcessing(true);
    setDataset(nextDataset);
    setForecastResult(null);
    setExecutiveReport(null);
    refreshProfile(nextDataset);
    addLog("System", `Updated row ${rowIdx + 1} field ${header}.`, "info");
    setActiveAgent("System");
    setIsProcessing(false);
  };

  const handleRunForecast = () => {
    if (!dataset || !forecastInput.label || !forecastInput.target) return;

    setActiveAgent("Forecasting Agent");
    setIsProcessing(true);
    addLog("Forecasting Agent", `Running forecast for ${forecastInput.target} using ${forecastInput.label}.`, "process");

    const nextForecast = buildForecast(dataset, forecastInput.label, forecastInput.target, forecastInput.horizon);
    setForecastResult(nextForecast);
    addLog("Forecasting Agent", `Generated a ${nextForecast.confidence}% confidence forecast across ${nextForecast.horizon} period(s).`, "success");
    setActiveAgent("System");
    setIsProcessing(false);
  };

  const handleGenerateReport = () => {
    if (!dataset || !profile) return;

    setActiveAgent("Report Generator");
    setIsProcessing(true);
    addLog("Report Generator", "Composing executive brief and slide deck.", "process");

    const report = buildExecutiveReport(dataset, profile, forecastResult);
    setExecutiveReport(report);
    addLog("Report Generator", `Prepared ${report.slideDeck.length} slide(s) for export.`, "success");
    setActiveAgent("System");
    setIsProcessing(false);
    setCurrentView("briefs");
  };

  const exportReport = async (format: "pdf" | "pptx") => {
    if (!dataset || !profile) return;

    const report = executiveReport ?? buildExecutiveReport(dataset, profile, forecastResult);
    if (!executiveReport) {
      setExecutiveReport(report);
    }

    const endpoint = format === "pdf" ? "/api/export/pdf" : "/api/export/pptx";
    const fileName = `${report.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.${format}`;

    try {
      setActiveAgent("Report Generator");
      setIsProcessing(true);
      addLog("Report Generator", `Requesting ${format.toUpperCase()} export from the local renderer.`, "process");

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          report,
          dataset,
          profile,
          forecast: forecastResult,
          customCharts,
        }),
      });

      if (!response.ok) {
        throw new Error(`Export failed with ${response.status}`);
      }

      const blob = await response.blob();
      downloadBlob(blob, fileName);
      addLog("Report Generator", `${format.toUpperCase()} export downloaded successfully.`, "success");
    } catch (error: any) {
      addLog("Report Generator", error?.message || `Unable to export ${format.toUpperCase()}.`, "error");
    } finally {
      setActiveAgent("System");
      setIsProcessing(false);
    }
  };

  const clearLogs = () => {
    setLogs([]);
  };

  const featureCards = buildEmptyStateCards();
  const chartCards = profile?.chartCards ?? [];
  const hasDataset = Boolean(dataset && profile);

  return (
    <div className="flex h-screen w-screen mesh-bg overflow-hidden text-gray-200">
      <Sidebar
        currentView={currentView}
        onViewChange={setCurrentView}
        datasetName={dataset?.name}
        itemCount={dataset?.rows.length || 0}
        qualityScore={profile?.datasetQualityScore}
        localModelLabel={modelStatus.available ? `${modelStatus.provider} ${modelStatus.model}` : "Local model offline"}
        localModelReady={modelStatus.available}
      />

      <main className="flex-1 flex flex-col min-w-0 h-full relative">
        <header className="h-16 border-b border-white/5 flex items-center justify-between px-8 glass-panel select-none shrink-0 z-10">
          <div className="flex items-center gap-4 min-w-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500 to-cyan-400 text-black font-bold flex items-center justify-center shadow-[0_0_24px_rgba(14,165,233,0.28)]">
                BI
              </div>
              <div className="min-w-0">
                <h1 className="text-sm font-semibold text-white leading-none truncate">AI Business Intelligence Copilot</h1>
                <p className="text-[10px] text-gray-500 uppercase tracking-[0.3em] mt-1">Local workbook intelligence</p>
              </div>
            </div>

            <div className="hidden lg:flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-3 py-1.5 text-[11px] text-gray-300">
              <Database className="w-3.5 h-3.5 text-sky-400" />
              <span className="truncate max-w-[220px]">{dataset?.name || "No workbook loaded"}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-3 py-1.5 text-[11px] text-gray-300">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>{profile ? `Quality ${profile.datasetQualityScore}/100` : "Awaiting workbook"}</span>
            </div>

            <div className="hidden md:flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-3 py-1.5 text-[11px] text-gray-300">
              <ShieldAlert className="w-3.5 h-3.5 text-sky-400" />
              <span className={modelStatus.available ? "text-emerald-300" : "text-amber-300"}>{modelStatus.available ? `${modelStatus.provider} ${modelStatus.model}` : "Local model offline"}</span>
            </div>

            <button
              onClick={() => dataset && refreshProfile(dataset)}
              disabled={!dataset || isProcessing}
              className="px-4 py-1.5 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold rounded-md transition-all cursor-pointer disabled:opacity-40 flex items-center gap-1.5"
              title="Recalculate the workbook profile"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isProcessing ? "animate-spin" : ""}`} />
              Re-Profile
            </button>
          </div>
        </header>

        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 space-y-6 transparent">
            <DatasetSelector onDatasetLoaded={handleDatasetLoaded} currentDatasetName={dataset?.name} />

            {!hasDataset ? (
              <div className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
                <section className="relative overflow-hidden rounded-3xl glass-panel p-8">
                  <div className="absolute -top-12 right-6 h-40 w-40 rounded-full bg-sky-500/10 blur-3xl" />
                  <div className="absolute -bottom-8 left-8 h-32 w-32 rounded-full bg-emerald-500/10 blur-3xl" />
                  <div className="relative space-y-6">
                    <div className="inline-flex items-center gap-2 rounded-full border border-sky-500/20 bg-sky-500/10 px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-sky-300">
                      <Sparkles className="w-3.5 h-3.5" />
                      Local-first intelligence
                    </div>
                    <div className="max-w-2xl space-y-4">
                      <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-white leading-[1.05]">
                        Upload a workbook and turn it into a live analyst.
                      </h2>
                      <p className="text-sm sm:text-base text-gray-300 leading-relaxed max-w-xl">
                        The copilot profiles spreadsheets locally, finds missing values and outliers, forecasts key metrics, answers questions, and exports board-ready reports without cloud connectivity.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                      {[
                        { title: "Data Cleaner", desc: "Flags missing values, outliers, and likely identifier fields." },
                        { title: "Data Analyst", desc: "Builds KPIs, trends, and chart-ready business insights." },
                        { title: "Report Generator", desc: "Exports executive summaries and slide decks locally." },
                      ].map((item) => (
                        <div key={item.title} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                          <div className="text-xs font-semibold text-white">{item.title}</div>
                          <p className="mt-2 text-[11px] leading-relaxed text-gray-400">{item.desc}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>

                <aside className="grid gap-4">
                  <div className="rounded-2xl border border-white/10 bg-[#161618] p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <Database className="w-4 h-4 text-sky-400" />
                      <h3 className="text-sm font-semibold text-white">What it does</h3>
                    </div>
                    <ul className="space-y-2 text-[11px] text-gray-400 leading-relaxed">
                      <li>Profiles CSV and Excel uploads locally.</li>
                      <li>Runs forecasting and workbook Q&amp;A on-device.</li>
                      <li>Generates PDF and PowerPoint exports from the current analysis.</li>
                      <li>Works with Ollama on your laptop when local model answers are enabled.</li>
                    </ul>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-[#161618] p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <Upload className="w-4 h-4 text-emerald-400" />
                      <h3 className="text-sm font-semibold text-white">Recommended local models</h3>
                    </div>
                    <div className="space-y-3 text-[11px] text-gray-400 leading-relaxed">
                      <p><strong className="text-white">qwen2.5:3b-instruct</strong> is the best balance for your laptop.</p>
                      <p><strong className="text-white">llama3.2:3b-instruct</strong> is a strong alternative for general BI chat.</p>
                      <p><strong className="text-white">qwen2.5:7b-instruct</strong> is possible if you want more quality and can accept slower inference.</p>
                    </div>
                  </div>
                </aside>
              </div>
            ) : (
              <div className="space-y-6 animate-fadeIn">
                {currentView === "dashboard" && profile && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                      <div className="glass-card rounded-2xl p-5 flex justify-between items-center group">
                        <div>
                          <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider block mb-1 group-hover:text-gray-300 transition-colors">Rows loaded</span>
                          <div className="flex items-baseline gap-2">
                            <h3 className="text-2xl font-bold tracking-tight text-white font-mono mt-1">{formatCompactNumber(dataset?.rows.length || 0)}</h3>
                            <span className="text-xs text-sky-400 font-medium">Live</span>
                          </div>
                        </div>
                        <div className="bg-sky-500/10 text-sky-400 p-2.5 rounded-xl border border-sky-500/10 group-hover:scale-110 group-hover:bg-sky-500/20 transition-all duration-300">
                          <Database className="w-5 h-5" />
                        </div>
                      </div>

                      <div className="glass-card rounded-2xl p-5 flex justify-between items-center group">
                        <div>
                          <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider block mb-1 group-hover:text-gray-300 transition-colors">Quality score</span>
                          <div className="flex items-baseline gap-2">
                            <h3 className="text-2xl font-bold tracking-tight text-white font-mono mt-1">{profile.datasetQualityScore}/100</h3>
                            <span className="text-xs text-emerald-400 font-medium">{profile.completenessScore}% complete</span>
                          </div>
                        </div>
                        <div className="bg-emerald-500/10 text-emerald-400 p-2.5 rounded-xl border border-emerald-500/10 group-hover:scale-110 group-hover:bg-emerald-500/20 transition-all duration-300">
                          <CheckCircle2 className="w-5 h-5" />
                        </div>
                      </div>

                      <div className="glass-card rounded-2xl p-5 flex justify-between items-center group">
                        <div>
                          <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider block mb-1 group-hover:text-gray-300 transition-colors">Columns</span>
                          <div className="flex items-baseline gap-2">
                            <h3 className="text-2xl font-bold tracking-tight text-white font-mono mt-1">{dataset?.headers.length || 0}</h3>
                            <span className="text-xs text-sky-400 font-medium">Schema</span>
                          </div>
                        </div>
                        <div className="bg-purple-500/10 text-purple-400 p-2.5 rounded-xl border border-purple-500/10 group-hover:scale-110 group-hover:bg-purple-500/20 transition-all duration-300">
                          <Layers className="w-5 h-5" />
                        </div>
                      </div>

                      <div className="glass-card rounded-2xl p-5 flex justify-between items-center group">
                        <div>
                          <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider block mb-1 group-hover:text-gray-300 transition-colors">Missing cells</span>
                          <div className="flex items-baseline gap-2">
                            <h3 className="text-2xl font-bold tracking-tight text-white font-mono mt-1">{profile.missingCells}</h3>
                          </div>
                        </div>
                        <div className="bg-rose-500/10 text-rose-400 p-2.5 rounded-xl border border-rose-500/10 group-hover:scale-110 group-hover:bg-rose-500/20 transition-all duration-300">
                          <Sparkles className="w-5 h-5" />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                      <div className="xl:col-span-2 glass-card rounded-2xl p-6 space-y-5">
                        <div className="flex items-center gap-2 border-b border-white/5 pb-2">
                          <Sparkles className="w-4 h-4 text-sky-400" />
                          <h4 className="font-bold text-xs uppercase tracking-wider text-white">Local analyst summary</h4>
                        </div>
                        <p className="text-xs leading-relaxed text-gray-300 whitespace-pre-line">{profile.summary}</p>
                        <div className="flex flex-wrap gap-2">
                          {profile.topSignals.map((signal) => (
                            <span key={signal} className="rounded-full border border-white/10 bg-white/5 hover:bg-white/10 px-3 py-1 text-[10px] text-gray-300 transition-colors cursor-default">
                              {signal}
                            </span>
                          ))}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {profile.analystInsights.map((insight) => (
                            <div key={insight.title} className="glass-card rounded-xl p-4 hover:-translate-y-0.5">
                              <div className="flex items-start justify-between gap-3 mb-2">
                                <h5 className="text-xs font-semibold text-white">{insight.title}</h5>
                                <span className="text-[9px] uppercase tracking-wider text-gray-500">{insight.type}</span>
                              </div>
                              <p className="text-[11px] leading-relaxed text-gray-400">{insight.description}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="glass-card rounded-2xl p-6 space-y-4">
                        <div className="flex items-center gap-2 border-b border-white/5 pb-2">
                          <FileText className="w-4 h-4 text-emerald-400" />
                          <h4 className="font-bold text-xs uppercase tracking-wider text-white">High-signal metrics</h4>
                        </div>
                        <div className="space-y-3">
                          {profile.marketKPIs.map((kpi) => (
                            <div key={kpi.label} className="glass-card rounded-xl p-4 hover:-translate-y-0.5">
                              <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">{kpi.label}</div>
                              <div className="text-xl font-bold text-white font-mono">{kpi.value}</div>
                              <p className="text-[11px] text-gray-400 mt-2 leading-relaxed">{kpi.businessValue}</p>
                            </div>
                          ))}
                        </div>
                        <div className="glass-card rounded-xl p-4 text-[11px] text-gray-400 leading-relaxed">
                          <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Agent thought</div>
                          {agentThought}
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-between items-center border-b border-white/5 pb-2">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-sky-400" />
                        <h4 className="font-bold text-xs uppercase tracking-wider text-white">Visual Analytics Dashboard</h4>
                      </div>
                      <button
                        onClick={() => {
                          if (!dataset) return;
                          const defaultCategory = dataset.headers.find(h => dataset.metrics.find(m => m.name === h)?.type !== "number") || dataset.headers[0];
                          const defaultNumeric = dataset.headers.find(h => dataset.metrics.find(m => m.name === h)?.type === "number") || dataset.headers[0];
                          const newChart: ChartCard = {
                            type: "bar",
                            title: `Custom Visual: ${titleCase(defaultNumeric)} by ${titleCase(defaultCategory)}`,
                            xAxisKey: defaultCategory,
                            yAxisKey: defaultNumeric,
                            colorTheme: "violet",
                            data: [],
                          };
                          setCustomCharts(prev => [...prev, newChart]);
                          setEditingChartIdx(customCharts.length);
                          addLog("Dashboard Agent", "Added a new custom visual configuration.", "info");
                        }}
                        className="bg-sky-600 hover:bg-sky-500 text-white font-semibold text-[10.5px] px-3 py-1.5 rounded-xl transition cursor-pointer"
                      >
                        + Add Custom Visual
                      </button>
                    </div>

                    {customCharts.length > 0 ? (
                      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                        {customCharts.map((chart, idx) => {
                          const safeX = dataset?.headers.includes(chart.xAxisKey) ? chart.xAxisKey : dataset?.headers[0] || "";
                          const safeY = chart.yAxisKey === "count" || dataset?.headers.includes(chart.yAxisKey) ? chart.yAxisKey : "count";
                          
                          const chartData = dataset 
                            ? buildCustomChartData(dataset.rows, safeX, safeY, chart.type)
                            : [];

                          const isEditing = editingChartIdx === idx;

                          return (
                            <div key={idx} className={`glass-card p-4 rounded-2xl flex flex-col justify-between transition-all duration-300 border ${
                              isEditing ? "border-sky-500/40 bg-sky-500/[0.02]" : "border-white/5 bg-[#161618]"
                            }`} style={{ height: isEditing ? "480px" : "360px" }}>
                              
                              <div className="flex justify-between items-center border-b border-white/5 pb-2 mb-3">
                                {isEditing ? (
                                  <div className="flex gap-2 items-center flex-1">
                                    <input
                                      type="text"
                                      value={chart.title}
                                      onChange={(e) => {
                                        const next = [...customCharts];
                                        next[idx] = { ...next[idx], title: e.target.value };
                                        setCustomCharts(next);
                                      }}
                                      className="bg-black/40 border border-white/15 text-xs rounded px-2.5 py-1 flex-1 text-white focus:outline-none focus:border-sky-500 font-sans"
                                      placeholder="Enter Visual Title"
                                    />
                                    <button
                                      onClick={() => setEditingChartIdx(null)}
                                      className="text-[10.5px] bg-sky-600 hover:bg-sky-500 text-white font-semibold px-3 py-1 rounded-lg cursor-pointer transition shadow-sm"
                                    >
                                      Save
                                    </button>
                                  </div>
                                ) : (
                                  <>
                                    <h5 className="font-sans font-semibold text-xs text-white truncate max-w-[200px]" title={chart.title}>
                                      {chart.title}
                                    </h5>
                                    <div className="flex gap-1.5 select-none shrink-0">
                                      <button
                                        onClick={() => setEditingChartIdx(idx)}
                                        className="text-gray-400 hover:text-white transition text-[9.5px] font-semibold bg-white/5 border border-white/10 px-2 py-1 rounded-lg cursor-pointer"
                                      >
                                        Customize
                                      </button>
                                      <button
                                        onClick={() => {
                                          const next = customCharts.filter((_, i) => i !== idx);
                                          setCustomCharts(next);
                                          addLog("Dashboard Agent", `Removed visual '${chart.title}'.`, "info");
                                        }}
                                        className="text-rose-450 hover:text-rose-400 transition text-[9.5px] font-semibold bg-rose-500/10 border border-rose-500/20 px-2 py-1 rounded-lg cursor-pointer"
                                      >
                                        Delete
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>

                              <div className="flex-1 min-h-0">
                                <CustomChart
                                  type={chart.type}
                                  title=""
                                  data={chartData}
                                  xAxisKey={chart.type === "pie" ? "label" : safeX}
                                  yAxisKey={chart.type === "pie" ? "value" : (safeY === "count" ? "Count" : safeY)}
                                  colorTheme={chart.colorTheme || "violet"}
                                  height={isEditing ? 180 : 250}
                                />
                              </div>

                              {isEditing && (
                                <div className="grid grid-cols-2 gap-3 mt-3 border-t border-white/5 pt-3 text-[10px] text-gray-400 select-none animate-fadeIn font-mono">
                                  <div>
                                    <label className="block mb-1 font-bold uppercase tracking-wider text-gray-500">Visual Type</label>
                                    <select
                                      value={chart.type}
                                      onChange={(e) => {
                                        const next = [...customCharts];
                                        next[idx] = { ...next[idx], type: e.target.value as any };
                                        setCustomCharts(next);
                                      }}
                                      className="bg-black/50 border border-white/10 rounded-xl px-2.5 py-1.5 w-full text-white text-[11px] outline-none focus:border-sky-500"
                                    >
                                      <option value="bar">Bar Chart</option>
                                      <option value="line">Line Chart</option>
                                      <option value="area">Area Chart</option>
                                      <option value="pie">Pie Chart</option>
                                      <option value="scatter">Scatter Plot</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block mb-1 font-bold uppercase tracking-wider text-gray-500">Color Theme</label>
                                    <select
                                      value={chart.colorTheme || "violet"}
                                      onChange={(e) => {
                                        const next = [...customCharts];
                                        next[idx] = { ...next[idx], colorTheme: e.target.value as any };
                                        setCustomCharts(next);
                                      }}
                                      className="bg-black/50 border border-white/10 rounded-xl px-2.5 py-1.5 w-full text-white text-[11px] outline-none focus:border-sky-500"
                                    >
                                      <option value="violet">Sky Blue (Violet)</option>
                                      <option value="emerald">Emerald Green</option>
                                      <option value="amber">Amber Yellow</option>
                                      <option value="rose">Rose Red</option>
                                      <option value="cyan">Cyan Blue</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block mb-1 font-bold uppercase tracking-wider text-gray-500">X-Axis (Category)</label>
                                    <select
                                      value={chart.xAxisKey}
                                      onChange={(e) => {
                                        const next = [...customCharts];
                                        next[idx] = { ...next[idx], xAxisKey: e.target.value };
                                        setCustomCharts(next);
                                      }}
                                      className="bg-black/50 border border-white/10 rounded-xl px-2.5 py-1.5 w-full text-white text-[11px] outline-none focus:border-sky-500"
                                    >
                                      {dataset?.headers.map((h) => (
                                        <option key={h} value={h}>{h}</option>
                                      ))}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block mb-1 font-bold uppercase tracking-wider text-gray-500">Y-Axis (Measure)</label>
                                    <select
                                      value={chart.yAxisKey}
                                      onChange={(e) => {
                                        const next = [...customCharts];
                                        next[idx] = { ...next[idx], yAxisKey: e.target.value };
                                        setCustomCharts(next);
                                      }}
                                      className="bg-black/50 border border-white/10 rounded-xl px-2.5 py-1.5 w-full text-white text-[11px] outline-none focus:border-sky-500"
                                    >
                                      <option value="count">Record Count (Count)</option>
                                      {dataset?.headers.map((h) => (
                                        <option key={h} value={h}>{h}</option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-white/10 glass-card p-10 text-center text-sm text-gray-400">
                        No visuals loaded. Click '+ Add Custom Visual' to start designing charts.
                      </div>
                    )}

                    <div className="glass-card rounded-2xl p-5">
                      <div className="flex items-center justify-between gap-3 border-b border-white/5 pb-3 mb-4">
                        <div>
                          <h4 className="text-xs font-semibold text-white uppercase tracking-wider">Suggested questions</h4>
                          <p className="text-[11px] text-gray-500 mt-1">Use these prompts in the chat panel.</p>
                        </div>
                        <ArrowRight className="w-4 h-4 text-sky-400" />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {profile.recommendedQuestions.map((question) => (
                          <button
                            key={question}
                            type="button"
                            onClick={() => setCurrentView("chat")}
                            className="text-[10.5px] glass-card text-sky-300 font-mono px-3 py-1.5 transition text-left cursor-pointer"
                          >
                            {question}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {currentView === "datagrid" && dataset && (
                  <DataGrid dataset={dataset} onCleanDataset={handleCleanDataset} onUpdateCell={handleUpdateCell} />
                )}

                {currentView === "forecast" && dataset && profile && (
                  <div className="space-y-6">
                    <div className="glass-card rounded-2xl p-6">
                      <div className="flex items-center gap-2 mb-4 border-b border-white/5 pb-2">
                        <TrendingUp className="w-4 h-4 text-violet-500 animate-pulse" />
                        <h4 className="font-bold text-xs uppercase tracking-wider text-white">Forecasting Agent</h4>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end mb-6">
                        <div>
                          <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-1.5">Sequence field</label>
                          <select
                            value={forecastInput.label}
                            onChange={(e) => setForecastInput((previous) => ({ ...previous, label: e.target.value }))}
                            className="bg-black/30 border border-white/10 text-xs rounded-xl px-3 py-2 w-full focus:outline-none focus:border-violet-500 text-white"
                          >
                            {[...dateColumns, ...dataset.headers.filter((header) => !dateColumns.includes(header))].map((header) => (
                              <option key={header} value={header}>
                                {header}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-1.5">Target numeric field</label>
                          <select
                            value={forecastInput.target}
                            onChange={(e) => setForecastInput((previous) => ({ ...previous, target: e.target.value }))}
                            className="bg-black/30 border border-white/10 text-xs rounded-xl px-3 py-2 w-full focus:outline-none focus:border-violet-500 text-white"
                          >
                            {numericColumns.map((header) => (
                              <option key={header} value={header}>
                                {header}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="flex gap-2">
                          <div className="flex-1">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-1.5">Horizon</label>
                            <input
                              type="number"
                              min={1}
                              max={12}
                              value={forecastInput.horizon}
                              onChange={(e) => setForecastInput((previous) => ({ ...previous, horizon: Number.parseInt(e.target.value) || 3 }))}
                              className="bg-black/30 border border-white/10 text-xs rounded-xl px-3 py-2 w-full focus:outline-none focus:border-violet-500 text-white"
                            />
                          </div>

                          <button
                            onClick={handleRunForecast}
                            disabled={isProcessing}
                            className="bg-slate-900 border border-slate-800 hover:bg-slate-800 text-white font-semibold text-xs px-5 py-2.5 rounded-xl transition cursor-pointer self-end shrink-0 disabled:opacity-50 disabled:cursor-wait"
                          >
                            Run forecast
                          </button>
                        </div>
                      </div>

                      {forecastResult ? (
                        <div className="space-y-6">
                          <div className="bg-slate-950 border border-slate-900 rounded-2xl p-4 sm:p-6 shadow-md">
                            <h5 className="font-semibold text-xs text-gray-400 uppercase tracking-wider mb-4">
                              Projected {forecastResult.metricUsed} across the next {forecastResult.horizon} period(s)
                            </h5>

                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                              <div className="lg:col-span-2 h-[280px]">
                                <CustomChart
                                  type="line"
                                  title={`${titleCase(forecastInput.target)} forecast`}
                                  data={[
                                    ...forecastResult.historical,
                                    ...forecastResult.predicted.map((point) => ({ [forecastInput.label]: point.label, [forecastInput.target]: point.value })),
                                  ]}
                                  xAxisKey={forecastInput.label}
                                  yAxisKey={forecastInput.target}
                                  colorTheme="violet"
                                  height={230}
                                />
                              </div>

                              <div className="space-y-3.5 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
                                <div>
                                  <span className="text-[10px] text-gray-400 block uppercase font-bold tracking-wider">Confidence</span>
                                  <p className="text-2xl font-extrabold font-mono text-emerald-400 mt-1">{forecastResult.confidence}%</p>
                                </div>

                                <div className="border-t border-slate-800 pt-3">
                                  <span className="text-[10px] text-gray-450 block font-semibold uppercase tracking-wider">Forecast notes</span>
                                  <p className="text-[11px] text-slate-300 leading-relaxed mt-1.5 whitespace-pre-line max-h-[160px] overflow-y-auto pr-1">
                                    {forecastResult.insights}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                            {forecastResult.predicted.map((point) => (
                              <div key={point.label} className="glass-card rounded-2xl p-4">
                                <p className="text-[10px] uppercase tracking-[0.2em] text-gray-500 mb-2">{point.label}</p>
                                <p className="text-2xl font-bold text-white font-mono">{formatCompactNumber(point.value)}</p>
                                <p className="mt-2 text-[11px] text-gray-400 leading-relaxed">
                                  Range {formatCompactNumber(point.lower)} to {formatCompactNumber(point.upper)}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="border border-dashed border-gray-700 bg-black/20 p-12 text-center rounded-2xl flex flex-col items-center justify-center">
                          <TrendingUp className="w-12 h-12 text-gray-500 stroke-[1.2] mb-3" />
                          <p className="font-sans font-semibold text-xs text-gray-200">Predictive modeling is ready</p>
                          <p className="text-[10px] text-gray-500 max-w-sm mt-1 leading-relaxed">
                            Choose a sequence field and a numeric target to generate a lightweight local forecast.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {currentView === "briefs" && dataset && (
                  <ReportView
                    report={executiveReport}
                    datasetRows={dataset.rows}
                    isGenerating={isProcessing}
                    onTriggerGenerate={handleGenerateReport}
                    onExportPdf={() => void exportReport("pdf")}
                    onExportPptx={() => void exportReport("pptx")}
                  />
                )}

                {currentView === "chat" && dataset && profile && (
                  <ChatPanel
                    dataset={dataset}
                    profile={profile}
                    chatHistory={chatHistory}
                    onAddMessage={(message) => setChatHistory((previous) => [...previous, message])}
                    isProcessing={isProcessing}
                    onSetProcessing={setIsProcessing}
                    onSetAgentThought={setAgentThought}
                    agentMode={agentMode}
                    onPipelineTrace={setPipelineTrace}
                  />
                )}
              </div>
            )}
          </div>

          <aside className="w-80 border-l border-white/5 glass-panel shrink-0 hidden xl:flex flex-col h-full animate-fadeIn select-none">
            <AgentPanel
              logs={logs}
              activeAgent={activeAgent}
              isProcessing={isProcessing}
              onClearLogs={() => setLogs([])}
              agentMode={agentMode}
              onAgentModeChange={setAgentMode}
              pipelineTrace={pipelineTrace}
            />
          </aside>
        </div>
      </main>
    </div>
  );
}
