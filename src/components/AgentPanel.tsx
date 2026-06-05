/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { AgentLog, PipelineStep, AgentMode } from "../types";
import {
  Sparkles,
  Terminal,
  ShieldAlert,
  Cpu,
  CheckCircle2,
  RotateCw,
  ChevronDown,
  ChevronUp,
  Zap,
  Brain,
  BookOpen,
  Shield,
  FlaskConical,
} from "lucide-react";

interface AgentPanelProps {
  logs: AgentLog[];
  activeAgent: string;
  isProcessing: boolean;
  onClearLogs?: () => void;
  /** Current pipeline mode for the Expert Mode toggle */
  agentMode?: AgentMode;
  onAgentModeChange?: (mode: AgentMode) => void;
  /** Latest pipeline trace (from most recent chat response) */
  pipelineTrace?: PipelineStep[];
}

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

function getAgentColor(name: string): string {
  switch (name) {
    case "Data Cleaner":
      return "bg-cyan-500/10 text-cyan-400 border-cyan-500/20";
    case "Data Analyst":
      return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    case "Forecasting Agent":
      return "bg-sky-500/10 text-sky-400 border-sky-500/20";
    case "Report Generator":
      return "bg-amber-500/10 text-amber-400 border-amber-500/20";
    case "Dashboard Agent":
      return "bg-indigo-500/10 text-indigo-400 border-indigo-500/20";
    case "Reviewer Agent":
    case "Phi-3 Reviewer":
      return "bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20";
    case "Phi-3 Orchestrator":
      return "bg-blue-500/10 text-blue-400 border-blue-500/20";
    case "Phi-3 Critic":
      return "bg-violet-500/10 text-violet-400 border-violet-500/20";
    case "Qwen BI Analyst":
    case "Qwen BI Analyst (fallback)":
      return "bg-purple-500/10 text-purple-400 border-purple-500/20";
    case "RAG Engine":
      return "bg-amber-500/10 text-amber-400 border-amber-500/20";
    default:
      return "bg-white/5 text-gray-300 border-white/10";
  }
}

function getLogTypeStyling(type: string): string {
  switch (type) {
    case "success":  return "text-emerald-400 font-medium";
    case "warning":  return "text-amber-400 font-medium";
    case "error":    return "text-rose-400 font-semibold";
    case "process":  return "text-sky-300 italic";
    default:         return "text-gray-300";
  }
}

function getStepStatusColor(status: PipelineStep["status"]): string {
  switch (status) {
    case "success":  return "text-emerald-400 border-emerald-500/20 bg-emerald-500/8";
    case "fallback": return "text-amber-400 border-amber-500/20 bg-amber-500/8";
    case "skipped":  return "text-gray-500 border-white/10 bg-white/5";
    case "error":    return "text-rose-400 border-rose-500/20 bg-rose-500/8";
    default:         return "text-gray-400 border-white/10 bg-white/5";
  }
}

function getStepIcon(agentName: string) {
  if (agentName.includes("Phi-3 Orchestrator") || agentName.includes("Router")) return <Cpu className="w-3 h-3" />;
  if (agentName.includes("Qwen") || agentName.includes("BI Analyst")) return <Brain className="w-3 h-3" />;
  if (agentName.includes("Reviewer")) return <Shield className="w-3 h-3" />;
  if (agentName.includes("Critic")) return <FlaskConical className="w-3 h-3" />;
  if (agentName.includes("RAG")) return <BookOpen className="w-3 h-3" />;
  return <Zap className="w-3 h-3" />;
}

// ---------------------------------------------------------------------------
// Sub-component: Pipeline Trace Timeline
// ---------------------------------------------------------------------------

function PipelineTrace({ steps }: { steps: PipelineStep[] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-white/8 rounded-xl bg-black/20 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest hover:text-white transition cursor-pointer"
      >
        <span className="flex items-center gap-1.5">
          <Zap className="w-3 h-3 text-sky-400" />
          Pipeline Trace · {steps.length} steps
        </span>
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          {steps.map((step, idx) => (
            <div key={idx} className="relative pl-5">
              {/* Connector line */}
              {idx < steps.length - 1 && (
                <span className="absolute left-[7px] top-5 bottom-0 w-px bg-white/8" />
              )}
              {/* Step dot */}
              <span className={`absolute left-0 top-1.5 w-3.5 h-3.5 rounded-full flex items-center justify-center border ${getStepStatusColor(step.status)}`}>
                {getStepIcon(step.agentName)}
              </span>

              <div className="text-[9.5px] font-mono space-y-0.5 pt-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-white">{step.agentName}</span>
                  <span className={`px-1.5 py-0.5 rounded border text-[8.5px] font-bold ${getStepStatusColor(step.status)}`}>
                    {step.status}
                  </span>
                  <span className="text-gray-600">{step.model}</span>
                  <span className="ml-auto text-gray-600">{step.durationMs}ms</span>
                </div>
                <p className="text-gray-500">→ {step.outputSummary}</p>
                {step.error && <p className="text-rose-400 text-[8.5px]">⚠ {step.error}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Agent registry config
// ---------------------------------------------------------------------------

const AGENT_LIST = [
  {
    name: "Qwen BI Analyst",
    shortLabel: "QWEN",
    desc: "KPI interpretation, churn, forecast, executive reports (HuggingFace)",
    color: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  },
  {
    name: "Phi-3 Mini",
    shortLabel: "PHI3",
    desc: "General assistant, app guidance, Expert Mode critic (Ollama local)",
    color: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  },
  {
    name: "Phi-3 Critic",
    shortLabel: "CRIT",
    desc: "Socratic critique, alternative interpretations (Expert Mode only)",
    color: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  },
  {
    name: "RAG Engine",
    shortLabel: "RAG",
    desc: "Semantic retrieval, hybrid reranking, context augmentation",
    color: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  },
  {
    name: "Forecasting Agent",
    shortLabel: "FORE",
    desc: "Deterministic math algorithms, horizon projection (no LLM)",
    color: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  },
  {
    name: "Report Generator",
    shortLabel: "RPT",
    desc: "Compiles PDF & slide deck, structures executive recommendations",
    color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  },
];

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function AgentPanel({
  logs,
  activeAgent,
  isProcessing,
  onClearLogs,
  agentMode = "standard",
  onAgentModeChange,
  pipelineTrace,
}: AgentPanelProps) {
  return (
    <div className="glass-panel rounded-2xl overflow-hidden flex flex-col h-full font-sans">
      {/* Header */}
      <div className="glass-card border-b border-white/5 p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cpu className="w-5 h-5 text-sky-400 stroke-[1.5]" />
          <div>
            <h3 className="font-semibold text-sm tracking-tight text-white animate-fadeIn">
              AI Agentic Engine
            </h3>
            <p className="text-[10px] text-gray-400">Dual-model BI pipeline</p>
          </div>
        </div>

        {isProcessing ? (
          <div className="flex items-center gap-1.5 bg-sky-500/10 border border-sky-500/20 px-2.5 py-1 rounded-full">
            <RotateCw className="w-3 h-3 text-sky-400 animate-spin" />
            <span className="text-[10px] text-sky-300 font-medium font-mono">Running pipeline...</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 bg-green-500/10 text-green-400 border border-green-500/20 px-2.5 py-1 rounded-full text-[10px] font-medium font-mono">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_6px_rgba(34,197,94,0.6)]" />
            System Idle
          </div>
        )}
      </div>

      {/* Expert Mode Toggle */}
      <div className="px-3 py-2.5 bg-black/20 border-b border-white/5 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
            Pipeline Mode
          </p>
          <p className="text-[9.5px] text-gray-600 mt-0.5">
            {agentMode === "expert"
              ? "Qwen → Phi-3 Critique → Merge"
              : "Router → Qwen BI → Phi-3 Review"}
          </p>
        </div>
        <button
          id="expert-mode-toggle"
          type="button"
          onClick={() => onAgentModeChange?.(agentMode === "expert" ? "standard" : "expert")}
          className={`relative flex items-center h-6 w-12 rounded-full border transition-all duration-300 cursor-pointer ${
            agentMode === "expert"
              ? "bg-violet-600/40 border-violet-500/60"
              : "bg-white/5 border-white/15"
          }`}
          title={agentMode === "expert" ? "Switch to Standard Mode" : "Switch to Expert Mode"}
        >
          <span
            className={`absolute w-4 h-4 rounded-full shadow transition-all duration-300 flex items-center justify-center ${
              agentMode === "expert"
                ? "left-7 bg-violet-400"
                : "left-1 bg-gray-400"
            }`}
          >
            {agentMode === "expert" ? (
              <FlaskConical className="w-2.5 h-2.5 text-violet-900" />
            ) : (
              <Sparkles className="w-2.5 h-2.5 text-gray-700" />
            )}
          </span>
        </button>
        <span className={`text-[9px] font-bold font-mono px-1.5 py-0.5 rounded border ml-2 ${
          agentMode === "expert"
            ? "text-violet-400 bg-violet-500/10 border-violet-500/25"
            : "text-sky-400 bg-sky-500/10 border-sky-500/25"
        }`}>
          {agentMode === "expert" ? "Expert" : "Standard"}
        </span>
      </div>

      {/* Agent Registry */}
      <div className="p-3 bg-black/10 border-b border-white/5">
        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-2 px-1">
          Agent Registry · Activity
        </label>
        <div className="grid grid-cols-1 gap-1.5">
          {AGENT_LIST.map((agent) => {
            const isActive = activeAgent === agent.name;
            return (
              <div
                key={agent.name}
                className={`flex items-start justify-between p-2 rounded-xl border transition-all duration-300 ${
                  isActive
                    ? "bg-white/5 border-sky-500/30 shadow-xs"
                    : "bg-transparent border-white/5 hover:border-white/10"
                }`}
              >
                <div className="flex gap-2 min-w-0">
                  <span
                    className={`text-[8.5px] font-extrabold px-1.5 py-0.5 rounded-md border shrink-0 flex items-center justify-center h-5 font-mono ${agent.color}`}
                  >
                    {agent.shortLabel}
                  </span>
                  <div className="min-w-0">
                    <h5 className="font-semibold text-xs text-white leading-tight">
                      {agent.name}
                    </h5>
                    <p className="text-[10px] text-gray-400 leading-normal line-clamp-1 mt-0.5">
                      {agent.desc}
                    </p>
                  </div>
                </div>
                {isActive && (
                  <span className="flex items-center gap-1 text-[9.5px] font-bold text-sky-400 animate-pulse bg-sky-500/10 px-1.5 py-0.5 rounded-md border border-sky-500/25 shrink-0 font-mono">
                    <Sparkles className="w-2.5 h-2.5" />
                    Working
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Pipeline Trace (last response) */}
      {pipelineTrace && pipelineTrace.length > 0 && (
        <div className="p-3 border-b border-white/5 bg-black/10">
          <PipelineTrace steps={pipelineTrace} />
        </div>
      )}

      {/* Execution Logs */}
      <div className="flex-1 p-3 flex flex-col justify-between overflow-hidden bg-black/40 backdrop-blur-md text-gray-300 font-mono text-[11px]">
        <div className="flex items-center justify-between text-[10px] text-gray-550 border-b border-white/5 pb-2 mb-2">
          <span className="flex items-center gap-1.5 uppercase tracking-widest font-bold">
            <Terminal className="w-3.5 h-3.5 text-sky-400" />
            Engine Execution Logs
          </span>
          {onClearLogs && (
            <button
              onClick={onClearLogs}
              className="text-gray-400 hover:text-white transition hover:bg-white/5 text-[9px] border border-white/10 px-2 py-0.5 rounded cursor-pointer"
            >
              Clear Logs
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin select-text">
          {logs.length === 0 ? (
            <div className="text-center text-gray-600 py-12 flex flex-col items-center gap-2">
              <Terminal className="w-8 h-8 text-gray-700 stroke-[1.2]" />
              <p className="text-[10px] leading-relaxed max-w-[200px]">
                No agent logs. Initiate an analytical action to trigger coordination.
              </p>
            </div>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="border-b border-white/2 pb-1.5 last:border-0 leading-relaxed font-mono">
                <div className="flex items-center justify-between text-[9px] text-gray-500 mb-0.5">
                  <span className="flex items-center gap-1">
                    <span className="w-1 h-1 bg-gray-700 rounded-full" />
                    {log.timestamp}
                  </span>
                  <span className={`text-[8.5px] px-1 rounded font-bold border ${getAgentColor(log.agentName)}`}>
                    {log.agentName}
                  </span>
                </div>
                <div className="flex items-start gap-1">
                  <span className="text-sky-500 select-none">&gt;</span>
                  <p className={getLogTypeStyling(log.type)}>{log.message}</p>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="border-t border-white/5 pt-2 mt-2 flex items-center justify-between text-[9.5px] text-gray-500">
          <span>Local service: localhost:3000</span>
          <span>Buffer: {logs.length} operations</span>
        </div>
      </div>
    </div>
  );
}
