/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { ExecutiveReport } from "../types";
import { FileText, Presentation, ChevronLeft, ChevronRight, Download, CheckSquare, Award, ArrowUpRight, Copy } from "lucide-react";
import CustomChart from "./CustomCharts";

interface ReportViewProps {
  report: ExecutiveReport | null;
  datasetRows: any[];
  isGenerating: boolean;
  onTriggerGenerate: () => void;
  onExportPdf: () => void;
  onExportPptx: () => void;
}

export default function ReportView({ report, datasetRows, isGenerating, onTriggerGenerate, onExportPdf, onExportPptx }: ReportViewProps) {
  const [activeMode, setActiveMode] = useState<"document" | "presentation">("document");
  const [currentSlideIdx, setCurrentSlideIdx] = useState<number>(0);
  const [copied, setCopied] = useState<boolean>(false);

  const copyToClipboard = () => {
    if (!report) return;
    const bulletsText = report.keyFindings.map(f => `- [${f.impact.toUpperCase()}] ${f.title}: ${f.description}`).join("\n");
    const recsText = report.recommendations.map((r, i) => `${i + 1}. ${r}`).join("\n");
    const reportStr = `TITLE: ${report.title}\nDATE: ${report.date}\n\nEXECUTIVE SUMMARY:\n${report.executiveSummary}\n\nKEY FINDINGS:\n${bulletsText}\n\nRECOMMENDATIONS:\n${recsText}`;

    navigator.clipboard.writeText(reportStr);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getImpactBadge = (impact: "positive" | "negative" | "neutral") => {
    switch (impact) {
      case "positive":
        return "bg-emerald-500/10 text-emerald-300 border-emerald-500/20";
      case "negative":
        return "bg-rose-500/10 text-rose-300 border-rose-500/20";
      default:
        return "bg-white/5 text-gray-350 border-white/10";
    }
  };

  if (!report) {
    return (
      <div className="glass-card rounded-2xl p-12 text-center flex flex-col items-center justify-center min-h-[400px]">
        <FileText className="w-16 h-16 text-gray-600 stroke-[1.1] mb-4 animate-pulse" />
        <h3 className="font-sans font-bold text-base text-white tracking-tight mb-2">
          Automated Report Engine
        </h3>
        <p className="text-xs text-gray-400 max-w-sm mb-6 leading-relaxed">
          Unlock Agent 4: Report Generator to parse key financial bounds, category concentrations, and forecasting horizons into an executive memo and slide deck layout.
        </p>
        <button
          onClick={onTriggerGenerate}
          disabled={isGenerating}
          className="bg-sky-600 hover:bg-sky-500 border border-transparent text-white text-xs font-semibold px-5 py-2.5 rounded-xl transition shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-wait"
        >
          {isGenerating ? "Compiling executive briefing..." : "Generate AI Insights & Slide Deck"}
        </button>
      </div>
    );
  }

  const slide = report.slideDeck[currentSlideIdx];

  return (
    <div className="space-y-6">
      {/* Tab Selectors & Top Level Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-white/5 pb-4 gap-4">
        <div>
          <h3 className="font-sans font-bold text-base text-white tracking-tight">
            Corporate Briefing Room
          </h3>
          <p className="text-[11px] text-gray-400">
            Export executive summaries or present visual projections instantly.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* View Modes toggle */}
          <div className="glass-input p-0.5 rounded-xl flex items-center">
            <button
              onClick={() => setActiveMode("document")}
              className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-all cursor-pointer ${activeMode === "document"
                  ? "bg-white/10 text-white shadow-xs"
                  : "text-gray-450 hover:text-white"
                }`}
            >
              <FileText className="w-3.5 h-3.5" />
              Boardroom Report
            </button>
            <button
              onClick={() => setActiveMode("presentation")}
              className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-all cursor-pointer ${activeMode === "presentation"
                  ? "bg-white/10 text-white shadow-xs"
                  : "text-gray-450 hover:text-white"
                }`}
            >
              <Presentation className="w-3.5 h-3.5" />
              Presentation Slides
            </button>
          </div>

          <button
            onClick={copyToClipboard}
            className="flex items-center gap-1.5 border border-white/10 hover:bg-white/5 text-gray-300 font-semibold text-xs px-3 py-1.5 rounded-xl transition cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5" />
            {copied ? "Copied!" : "Copy Report"}
          </button>

          <button
            onClick={onExportPdf}
            disabled={isGenerating}
            className="flex items-center gap-1.5 border border-white/10 hover:bg-white/5 text-gray-300 font-semibold text-xs px-3 py-1.5 rounded-xl transition cursor-pointer disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            PDF
          </button>

          <button
            onClick={onExportPptx}
            disabled={isGenerating}
            className="flex items-center gap-1.5 border border-white/10 hover:bg-white/5 text-gray-300 font-semibold text-xs px-3 py-1.5 rounded-xl transition cursor-pointer disabled:opacity-50"
          >
            <Presentation className="w-3.5 h-3.5" />
            PPTX
          </button>
        </div>
      </div>

      {activeMode === "document" ? (
        /* Executive Document Briefing Style */
        <div className="glass-panel p-10 min-h-[600px] printable-area">
          <div className="border-b border-white/5 pb-8 mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-wider font-mono font-bold text-sky-400 block mb-1">
                EXECUTIVE ANALYTICAL BRIEF
              </p>
              <h1 className="text-2xl font-bold tracking-tight font-sans text-white">
                {report.title}
              </h1>
            </div>
            <div className="text-left md:text-right">
              <span className="text-[11px] font-mono bg-white/5 text-gray-300 px-2.5 py-1 rounded-full font-medium border border-white/10">
                {report.date}
              </span>
            </div>
          </div>

          {/* executive summary section */}
          <div className="space-y-6">
            <section>
              <h2 className="font-sans font-bold text-sm text-white tracking-tight flex items-center gap-2 mb-3">
                <span className="w-1.5 h-5 bg-sky-500 rounded-full"></span>
                Executive Summary
              </h2>
              <p className="font-sans text-xs text-gray-300 leading-relaxed max-w-3xl whitespace-pre-line">
                {report.executiveSummary}
              </p>
            </section>

            {/* key findings grid */}
            <section>
              <h2 className="font-sans font-bold text-sm text-white tracking-tight flex items-center gap-2 mb-4">
                <span className="w-1.5 h-5 bg-sky-500 rounded-full"></span>
                Key Statistical Findings & Strategic Insights
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {report.keyFindings.map((finding, idx) => (
                  <div
                    key={idx}
                    className="glass-card p-5 rounded-xl hover:border-white/10 transition flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h4 className="font-semibold text-xs text-white tracking-tight">
                          {finding.title}
                        </h4>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {finding.confidence && (
                            <span className={`text-[9px] uppercase font-mono font-bold px-1.5 py-0.5 rounded border ${finding.confidence === "High" ? "bg-sky-500/10 text-sky-400 border-sky-500/20" : finding.confidence === "Medium" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-rose-500/10 text-rose-400 border-rose-500/20"}`}>
                              {finding.confidence} CONF
                            </span>
                          )}
                          <span
                            className={`text-[9px] uppercase font-mono font-bold px-2 py-0.5 rounded-full border ${getImpactBadge(
                              finding.impact as any
                            )}`}
                          >
                            {finding.impact}
                          </span>
                        </div>
                      </div>
                      <p className="text-[11px] text-gray-400 leading-relaxed mb-3">
                        {finding.description}
                      </p>
                    </div>

                    <div className="flex flex-col gap-2 mt-auto border-t border-white/5 pt-3">
                      {finding.metric && (
                        <div>
                          <span className="text-[10px] text-gray-500 font-mono">Key Metric Impact:</span>
                          <p className="text-sm font-mono font-bold text-sky-400 mt-0.5">
                            {finding.metric}
                          </p>
                        </div>
                      )}
                      
                      {finding.evidenceList && finding.evidenceList.length > 0 && (
                        <div className="glass-input p-3 rounded-lg mt-1">
                          <div className="flex items-center gap-1.5 mb-2">
                            <CheckSquare className="w-3.5 h-3.5 text-sky-450" />
                            <span className="text-[9px] uppercase tracking-wider font-bold text-gray-500">Supporting Evidence</span>
                          </div>
                          <ul className="text-[10px] font-mono text-gray-400 space-y-1">
                            {finding.evidenceList.map((ev, i) => (
                              <li key={i} className="flex gap-1.5 items-start">
                                <span className="text-sky-500 mt-0.5 opacity-50">›</span>
                                <span>{ev}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {finding.assumptions && finding.assumptions !== "None" && (
                        <div className="flex gap-1.5 items-start mt-1">
                          <span className="text-[9px] text-amber-500 font-mono mt-0.5 shrink-0">⚠️</span>
                          <span className="text-[9px] text-amber-400/80 font-mono leading-snug">
                            <span className="font-bold opacity-80">Assumptions: </span>{finding.assumptions}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Recommendations Section */}
            <div className="mb-6">
              <h5 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Award className="w-4 h-4 text-emerald-400" />
                Strategic Recommendations
              </h5>
              <div className="space-y-3">
                {report.recommendations.map((rec, idx) => (
                  <div key={idx} className="flex gap-4 glass-card p-4 rounded-xl">
                    <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold w-4.5 h-4.5 rounded-full flex items-center justify-center shrink-0 mt-0.5 font-mono">
                      {idx + 1}
                    </span>
                    <p className="text-xs text-gray-300 leading-relaxed font-sans">
                      {rec}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* High Fidelity Presentation Slide View */
        <div className="max-w-4xl mx-auto flex flex-col gap-4">
          <div className="glass-panel text-white rounded-2xl p-8 sm:p-12 min-h-[380px] flex flex-col justify-between relative overflow-hidden transition-all duration-300">
            {/* Ambient subtle backdrop elements */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-sky-500/5 rounded-full filter blur-3xl pointer-events-none"></div>
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-500/5 rounded-full filter blur-3xl pointer-events-none"></div>

            {/* Slide Header */}
            <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-4 select-none">
              <div className="flex items-center gap-2">
                <Presentation className="w-4 h-4 text-sky-400" />
                <span className="text-[10px] uppercase font-mono tracking-wider font-semibold text-sky-350">
                  SLIDE {currentSlideIdx + 1} OF {report.slideDeck.length} • {slide.layout.toUpperCase()} Layout
                </span>
              </div>
              <span className="text-[9px] font-mono text-gray-400 bg-white/5 px-2.5 py-1 rounded-full border border-white/10">
                BOARD DECK PREVIEW
              </span>
            </div>

            {/* Slide Core Content Frame depending on layouts */}
            <div className="flex-1 flex flex-col justify-center py-4 text-gray-100">
              {slide.layout === "title" && (
                <div className="text-center space-y-3 max-w-xl mx-auto">
                  <span className="text-xs font-mono text-emerald-405 uppercase tracking-widest font-bold">
                    {slide.subtitle || "Insights Briefing"}
                  </span>
                  <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight font-sans text-white leading-tight">
                    {slide.title}
                  </h2>
                  <div className="w-12 h-1 bg-sky-500 mx-auto rounded"></div>
                </div>
              )}

              {slide.layout === "metrics" && (
                <div className="space-y-6">
                  <h3 className="text-lg font-bold tracking-tight text-white">{slide.title}</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {slide.metrics?.map((m, idx) => (
                      <div key={idx} className="glass-card p-5 rounded-xl text-center shadow-xs">
                        <span className="text-[10px] text-gray-500 block mb-1 uppercase tracking-wider font-mono">{m.label}</span>
                        <span className="text-xl font-bold font-mono text-emerald-400">{m.value}</span>
                        {m.sub && <span className="text-[9px] text-gray-500 block mt-1">{m.sub}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {slide.layout === "bullets" && (
                <div className="space-y-4">
                  <h3 className="text-lg font-bold tracking-tight text-white mb-2">{slide.title}</h3>
                  <div className="grid grid-cols-1 gap-2.5">
                    {slide.bullets?.map((bullet, idx) => (
                      <div key={idx} className="flex gap-2.5 items-start bg-black/15 border border-white/5 p-3 rounded-lg hover:border-white/10 transition">
                        <span className="w-2 h-2 rounded-full bg-sky-400 shrink-0 mt-1.5"></span>
                        <p className="text-xs text-gray-300 leading-normal">{bullet}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {slide.layout === "chart" && (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <h3 className="text-base font-bold tracking-tight text-white">{slide.title}</h3>
                    <span className="text-[10px] text-gray-400 font-mono">{slide.chartConfig?.yAxis} metrics relative to indices</span>
                  </div>
                  <div className="border border-white/5 rounded-xl bg-black/20 p-4 h-[210px]">
                    <CustomChart
                      type={slide.chartConfig?.type as any || "area"}
                      title={slide.chartConfig?.title || "Visual Projection"}
                      data={datasetRows.slice(0, 10)}
                      xAxisKey={slide.chartConfig?.xAxis || "Month"}
                      yAxisKey={slide.chartConfig?.yAxis || "Revenue"}
                      colorTheme="violet"
                      height={150}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Slide Navigation controls */}
            <div className="flex items-center justify-between border-t border-white/5 pt-4 mt-4 select-none">
              <span className="text-[10px] text-gray-550 font-mono">
                Generated automatically by corporate analytics agent
              </span>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentSlideIdx(prev => Math.max(0, prev - 1))}
                  disabled={currentSlideIdx === 0}
                  className="bg-[#1e1e21] border border-white/10 text-white rounded-lg p-2 hover:bg-[#27272a] transition disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setCurrentSlideIdx(prev => Math.min(report.slideDeck.length - 1, prev + 1))}
                  disabled={currentSlideIdx === report.slideDeck.length - 1}
                  className="bg-[#1e1e21] border border-white/10 text-white rounded-lg p-2 hover:bg-[#27272a] transition disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          <p className="text-[10px] text-gray-500 text-center uppercase tracking-wide">
            💡 Protip: Switch back to Document briefing to view the comprehensive textual summaries.
          </p>
        </div>
      )}
    </div>
  );
}
