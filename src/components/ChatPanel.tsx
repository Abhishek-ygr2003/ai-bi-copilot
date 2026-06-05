/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from "react";
import { ChatMessage, Dataset, DatasetProfile, AgentMode, PipelineStep, RAGContextInfo } from "../types";
import {
  Send,
  BarChart2,
  MessageSquare,
  Loader,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  BookOpen,
  ChevronDown,
  ChevronUp,
  FlaskConical,
  Zap,
  Brain,
  Terminal,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import CustomChart from "./CustomCharts";

interface ChatPanelProps {
  dataset: Dataset;
  profile: DatasetProfile;
  chatHistory: ChatMessage[];
  onAddMessage: (msg: ChatMessage) => void;
  isProcessing: boolean;
  onSetProcessing: (val: boolean) => void;
  onSetAgentThought: (thought: string) => void;
  agentMode?: AgentMode;
  onPipelineTrace?: (trace: PipelineStep[]) => void;
}

// ---------------------------------------------------------------------------
// Review Status Badge
// ---------------------------------------------------------------------------

function ReviewBadge({ status, reason }: { status: string; reason: string }) {
  const [showReason, setShowReason] = useState(false);

  const style =
    status === "Verified"
      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
      : status === "Claim Removed"
      ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
      : "bg-rose-500/10 text-rose-400 border-rose-500/20";

  const Icon =
    status === "Verified" ? CheckCircle2 : status === "Claim Removed" ? AlertTriangle : XCircle;

  return (
    <div className="mt-1.5 px-1">
      <button
        type="button"
        onClick={() => setShowReason((v) => !v)}
        className={`flex items-center gap-1.5 text-[9px] uppercase font-mono font-bold px-2 py-1 rounded-lg border cursor-pointer transition hover:opacity-80 ${style}`}
      >
        <Icon className="w-2.5 h-2.5" />
        {status}
        {showReason ? <ChevronUp className="w-2 h-2" /> : <ChevronDown className="w-2 h-2" />}
      </button>
      {showReason && reason && (
        <p className="text-[9.5px] text-gray-500 italic mt-1 pl-1">{reason}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// RAG Context Pill
// ---------------------------------------------------------------------------

function RAGContextPill({ ragContext }: { ragContext: RAGContextInfo }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mt-1.5 px-1">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1.5 text-[9px] text-amber-400 bg-amber-500/8 border border-amber-500/20 font-mono px-2 py-1 rounded-lg cursor-pointer hover:opacity-80 transition"
      >
        <BookOpen className="w-2.5 h-2.5" />
        Based on {ragContext.retrievedCount} document{ragContext.retrievedCount !== 1 ? "s" : ""}
        {expanded ? <ChevronUp className="w-2 h-2" /> : <ChevronDown className="w-2 h-2" />}
      </button>
      {expanded && ragContext.sources.length > 0 && (
        <div className="mt-1.5 pl-1 space-y-1">
          {ragContext.sources.map((src) => (
            <div key={src.id} className="flex items-center gap-2 text-[8.5px] text-gray-500">
              <span className="text-amber-600 font-bold font-mono">{src.docType}</span>
              <span className="truncate max-w-[180px]">{src.title}</span>
              <span className="ml-auto text-gray-600 font-mono">{src.score.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Powered-by badge (per-message)
// ---------------------------------------------------------------------------

function PoweredByBadge({ poweredBy, mode }: { poweredBy?: string; mode?: AgentMode }) {
  const isExpert = mode === "expert";
  const isGeneral = poweredBy === "phi3-general";
  const isFallback = poweredBy === "fallback";

  if (isGeneral) {
    return (
      <span className="flex items-center gap-1 text-[8.5px] font-mono font-bold px-1.5 py-0.5 rounded border text-sky-400 bg-sky-500/10 border-sky-500/25">
        <Zap className="w-2 h-2" />
        Phi-3 Mini
      </span>
    );
  }
  if (isFallback) {
    return (
      <span className="flex items-center gap-1 text-[8.5px] font-mono font-bold px-1.5 py-0.5 rounded border text-amber-400 bg-amber-500/10 border-amber-500/25">
        <AlertTriangle className="w-2 h-2" />
        Fallback
      </span>
    );
  }
  return (
    <span className={`flex items-center gap-1 text-[8.5px] font-mono font-bold px-1.5 py-0.5 rounded border ${
      isExpert
        ? "text-violet-400 bg-violet-500/10 border-violet-500/25"
        : "text-purple-400 bg-purple-500/10 border-purple-500/25"
    }`}>
      <Brain className="w-2 h-2" />
      {isExpert ? "BI Analyst + Critical Review" : "Powered by BI Analyst"}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Processing indicator (shows current pipeline step)
// ---------------------------------------------------------------------------

function ThinkingIndicator({ mode, route }: { mode: AgentMode; route?: string }) {
  const isBi = route === "qwen-bi" || mode === "expert";
  const steps = mode === "expert"
    ? ["Qwen BI Analyst analysing…", "Phi-3 reviewing critique…", "Synthesising…"]
    : isBi
      ? ["Routing to BI Analyst…", "Qwen generating analysis…", "Formatting response…"]
      : ["Phi-3 thinking…", "Composing response…"];

  const [stepIdx, setStepIdx] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setStepIdx((i) => (i + 1) % steps.length), 2200);
    return () => clearInterval(interval);
  }, [mode, route]);

  return (
    <div className="flex items-center gap-2 mr-auto bg-black/20 border border-white/5 px-4 py-2.5 rounded-2xl text-xs text-gray-400 max-w-[80%] animate-pulse">
      <Loader className="w-3.5 h-3.5 animate-spin text-sky-400 shrink-0" />
      <span className="font-mono">{steps[stepIdx]}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Collapsible debug trace panel
// ---------------------------------------------------------------------------

function DebugTrace({ steps }: { steps: PipelineStep[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2 px-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-[8.5px] text-gray-600 font-mono hover:text-gray-400 transition cursor-pointer"
      >
        <Terminal className="w-2.5 h-2.5" />
        Debug trace ({steps.length} steps)
        {open ? <ChevronUp className="w-2 h-2" /> : <ChevronDown className="w-2 h-2" />}
      </button>
      {open && (
        <div className="mt-1.5 space-y-1 border border-white/5 bg-black/20 rounded-lg p-2">
          {steps.map((s, i) => (
            <div key={i} className="text-[8.5px] font-mono text-gray-500">
              <span className="text-sky-600">[{s.agentName}]</span>{" "}
              <span className={s.status === "success" ? "text-emerald-600" : s.status === "error" ? "text-rose-600" : "text-amber-600"}>
                {s.status}
              </span>
              {" — "}{s.outputSummary?.slice(0, 80)}
              <span className="text-gray-700 ml-1">{s.durationMs}ms</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ChatPanel
// ---------------------------------------------------------------------------

export default function ChatPanel({
  dataset,
  profile,
  chatHistory,
  onAddMessage,
  isProcessing,
  onSetProcessing,
  onSetAgentThought,
  agentMode = "standard",
  onPipelineTrace,
}: ChatPanelProps) {
  const [input, setInput] = useState<string>("");
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const quickChips = profile.recommendedQuestions.slice(0, 4);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  const handleSend = async (textToSend: string) => {
    if (!textToSend.trim() || isProcessing) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: "user",
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    onAddMessage(userMsg);
    setInput("");
    onSetProcessing(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataset,
          profile,
          history: chatHistory.slice(-6),
          query: textToSend,
          mode: agentMode,
        }),
      });

      if (!response.ok) {
        throw new Error("Analytics agent returned an invalid status.");
      }

      const data = await response.json();

      if (data.agentThought) {
        onSetAgentThought(data.agentThought);
      }

      if (data.pipelineTrace && onPipelineTrace) {
        onPipelineTrace(data.pipelineTrace);
      }

      let chartSuggestion: any = undefined;
      if (data.chartSuggestion?.data?.length > 0) {
        chartSuggestion = {
          type: data.chartSuggestion.type || "bar",
          title: data.chartSuggestion.title || "Visual Comparison",
          xAxisKey: data.chartSuggestion.xAxisKey || "label",
          yAxisKey: data.chartSuggestion.yAxisKey || "value",
          data: data.chartSuggestion.data,
        };
      }

      const aiMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: "assistant",
        text: data.answerMarkdown || "I could not find a distinct answer to your request.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        chartSuggestion,
        reviewStatus: data.reviewStatus,
        agentMode: data.mode || agentMode,
        poweredBy: data.poweredBy,
        pipelineTrace: data.pipelineTrace,
        ragContext: data.ragContext
          ? { retrievedCount: data.ragContext.retrievedCount, sources: data.ragContext.sources }
          : undefined,
      };

      onAddMessage(aiMsg);
    } catch (error: any) {
      console.error(error);
      const errMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: "assistant",
        text: `### ⚠️ Operations Error\nThe system encountered an issue processing your data request. ${error.message || ""}\n\nThe local data server may be offline.`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      onAddMessage(errMsg);
    } finally {
      onSetProcessing(false);
    }
  };

  return (
    <div className="glass-card rounded-2xl p-4 shadow-xs flex flex-col h-[550px] font-sans">
      {/* Header */}
      <div className="border-b border-white/5 pb-3 mb-3 flex items-center justify-between select-none">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-sky-400" />
          <h3 className="font-semibold text-xs text-white uppercase tracking-wider">
            BI Chat Agent
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <span className={`flex items-center gap-1 text-[8.5px] font-mono font-bold px-1.5 py-0.5 rounded border ${
            agentMode === "expert"
              ? "text-violet-400 bg-violet-500/10 border-violet-500/25"
              : "text-gray-500 bg-white/5 border-white/10"
          }`}>
            {agentMode === "expert" ? <FlaskConical className="w-2 h-2" /> : <Zap className="w-2 h-2" />}
            {agentMode === "expert" ? "Expert Mode" : "Standard Mode"}
          </span>
          <span className="text-[10px] text-gray-400 font-mono bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">
            Context Window
          </span>
        </div>
      </div>

      {/* Quick suggest prompts */}
      {chatHistory.length <= 1 && (
        <div className="mb-3 space-y-1.5 select-none animate-fadeIn transition-all duration-300">
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
            Suggested Queries
          </p>
          <div className="flex flex-wrap gap-1.5">
            {quickChips.map((chip, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSend(chip)}
                className="glass-card hover:border-sky-500/30 text-[10.5px] text-sky-400 font-mono px-2.5 py-1 rounded-lg transition text-left cursor-pointer"
              >
                {chip}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-thin select-text">
        {chatHistory.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col max-w-[85%] ${
              msg.sender === "user" ? "ml-auto items-end" : "mr-auto items-start"
            }`}
          >
            {/* Sender row */}
            <div className="flex items-center gap-2 mb-1 px-1">
              <span className="text-[9px] text-gray-500 font-mono">
                {msg.sender === "user" ? "You" : "BI Copilot"} • {msg.timestamp}
              </span>
              {msg.sender === "assistant" && (
                <PoweredByBadge poweredBy={(msg as any).poweredBy} mode={msg.agentMode} />
              )}
            </div>

            {/* Bubble */}
            <div
              className={`p-3.5 rounded-2xl border leading-relaxed text-xs ${
                msg.sender === "user"
                  ? "bg-gradient-to-br from-sky-600 to-indigo-600 border-white/10 text-white shadow-lg shadow-sky-900/20"
                  : "glass-input text-gray-200 shadow-xs"
              }`}
            >
              {msg.sender === "user" ? (
                <p className="whitespace-pre-line">{msg.text}</p>
              ) : (
                <div className="markdown-body prose prose-invert max-w-none text-xs break-words space-y-2">
                  <ReactMarkdown>{msg.text}</ReactMarkdown>
                </div>
              )}
            </div>

            {/* Review badge */}
            {msg.reviewStatus && (
              <ReviewBadge
                status={msg.reviewStatus.status}
                reason={msg.reviewStatus.reason}
              />
            )}

            {/* RAG context pill */}
            {msg.ragContext && msg.ragContext.retrievedCount > 0 && (
              <RAGContextPill ragContext={msg.ragContext} />
            )}

            {/* Debug trace — hidden by default */}
            {msg.pipelineTrace && msg.pipelineTrace.length > 0 && (
              <DebugTrace steps={msg.pipelineTrace} />
            )}

            {/* Inline chart */}
            {msg.chartSuggestion && (
              <div className="w-full mt-3 border border-white/5 rounded-xl bg-black/15 p-2 sm:p-4 max-w-sm sm:max-w-md shadow-xs animate-fadeIn">
                <div className="flex items-center gap-1.5 mb-2">
                  <BarChart2 className="w-4 h-4 text-sky-450" />
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    Agent-Selected Visualization
                  </span>
                </div>
                <div className="h-[180px]">
                  <CustomChart
                    type={msg.chartSuggestion.type}
                    title={msg.chartSuggestion.title}
                    data={msg.chartSuggestion.data}
                    xAxisKey={msg.chartSuggestion.xAxisKey}
                    yAxisKey={msg.chartSuggestion.yAxisKey}
                    colorTheme="violet"
                    height={140}
                  />
                </div>
              </div>
            )}
          </div>
        ))}

        {isProcessing && <ThinkingIndicator mode={agentMode} />}
        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend(input);
        }}
        className="mt-3 flex items-center gap-2 glass-input p-1 rounded-xl transition-all shadow-[0_0_15px_rgba(0,0,0,0.5)]"
      >
        <input
          id="chat-input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            isProcessing
              ? agentMode === "expert"
                ? "Expert pipeline running…"
                : "Synthesizing figures…"
              : "Ask a quantitative question (e.g., Which region has best profit margin?)"
          }
          disabled={isProcessing}
          className="flex-1 bg-transparent px-3 py-2 text-xs focus:outline-none disabled:cursor-not-allowed text-gray-200 placeholder-gray-500"
        />
        <button
          id="chat-send-btn"
          type="submit"
          disabled={!input.trim() || isProcessing}
          className="bg-sky-600 border border-sky-650 text-white rounded-lg p-2 hover:bg-sky-500 transition disabled:opacity-20 disabled:cursor-not-allowed shrink-0 cursor-pointer"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
}
