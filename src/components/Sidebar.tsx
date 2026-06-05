/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import {
  LayoutDashboard,
  TableProperties,
  TrendingUp,
  FileSpreadsheet,
  MessageSquareCode,
  Sparkles,
  Layers
} from "lucide-react";

interface SidebarProps {
  currentView: string;
  onViewChange: (view: string) => void;
  datasetName?: string;
  itemCount: number;
  qualityScore?: number;
  localModelLabel?: string;
  localModelReady?: boolean;
}

export default function Sidebar({ currentView, onViewChange, datasetName, itemCount, qualityScore, localModelLabel, localModelReady }: SidebarProps) {
  const menuItems = [
    { id: "dashboard", label: "Executive Dashboard", icon: LayoutDashboard, desc: "KPIs, quality, and charts" },
    { id: "datagrid", label: "Data Studio", icon: TableProperties, desc: "Rows, columns, and cleaning" },
    { id: "forecast", label: "Predictive Forecasting", icon: TrendingUp, desc: "Trend modeling and horizon view" },
    { id: "briefs", label: "Briefing Room", icon: FileSpreadsheet, desc: "PDF and PowerPoint exports" },
    { id: "chat", label: "Chat With Data", icon: MessageSquareCode, desc: "Natural language analysis" },
  ];

  return (
    <aside className="w-64 glass-panel text-gray-300 flex flex-col h-screen shrink-0 border-r border-white/5 font-sans select-none z-20">
      {/* Title logo block */}
      <div className="p-6">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-8 h-8 bg-sky-500 rounded flex items-center justify-center font-extrabold text-black text-sm">
            Σ
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-tight text-white leading-none">LocalBI Copilot</h1>
            <span className="text-[9px] uppercase font-bold text-sky-400 tracking-wider font-mono block mt-1">Offline BI stack</span>
          </div>
        </div>

        <div className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-4 px-1">Main Workspace</div>

        {/* Main navigational vertical tabs */}
        <nav className="space-y-1">
          {menuItems.map((item) => {
            const isActive = currentView === item.id;
            const Icon = item.icon;

            return (
              <button
                key={item.id}
                onClick={() => onViewChange(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md transition duration-150 text-left cursor-pointer group ${
                  isActive
                    ? "glass-card text-sky-400 font-medium scale-[1.02]"
                    : "text-gray-400 hover:text-white hover:bg-white/5 hover:scale-[1.02]"
                }`}
              >
                <Icon className={`w-4 h-4 stroke-[1.8] shrink-0 ${
                  isActive ? "text-sky-400" : "text-gray-500 group-hover:text-gray-300"
                }`} />
                <div className="flex-1 min-w-0">
                  <span className="text-xs block truncate">{item.label}</span>
                  <span className={`text-[9px] block truncate transition-colors ${
                    isActive ? "text-sky-500/70" : "text-gray-600 group-hover:text-gray-500"
                  }`}>
                    {item.desc}
                  </span>
                </div>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Dataset details card built natively into sidebar styling */}
      <div className="px-6 py-2">
        <div className="p-3.5 rounded-xl glass-card transition-all hover:scale-[1.02]">
          <p className="text-[9px] font-bold text-gray-550 uppercase tracking-widest mb-1.5 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-sky-400" />
            Workspace Binder
          </p>
          <h3 className="text-white text-xs font-semibold truncate" title={datasetName || "No Workbook loaded"}>
            {datasetName || "No Dataset Loaded"}
          </h3>
          <span className="text-[10px] text-gray-400 font-mono mt-1 block">
            {itemCount > 0 ? `${itemCount.toLocaleString()} grid rows` : "0 lines"}
          </span>
        </div>
      </div>

      {/* Local runtime status card */}
      <div className="mt-auto p-6">
        <div className="p-4 rounded-xl glass-card transition-all hover:border-sky-500/30 hover:shadow-[0_0_15px_rgba(14,165,233,0.15)]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase font-bold text-gray-400">Local model</span>
            <span className={`text-[10px] font-mono ${localModelReady ? "text-emerald-400" : "text-amber-400"}`}>
              {localModelReady ? "ready" : "offline"}
            </span>
          </div>
          <div className="h-1.5 bg-black/50 backdrop-blur-md rounded-full overflow-hidden border border-white/5">
            <div className={`h-full ${localModelReady ? "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]" : "bg-amber-500"}`} style={{ width: localModelReady ? "100%" : "35%" }}></div>
          </div>
          <p className="text-[9px] mt-2 text-gray-500 font-mono">{localModelLabel || "Ollama not configured yet"}</p>
        </div>
        
        {/* Secondary footer items */}
        <div className="text-[9px] text-gray-600 mt-4 px-1 font-mono flex flex-col gap-0.5">
          <span>{datasetName ? `${itemCount.toLocaleString()} rows loaded` : "No dataset loaded"}</span>
          <span>{qualityScore !== undefined ? `Quality score ${qualityScore}/100` : "Waiting for workbook"}</span>
        </div>
      </div>
    </aside>
  );
}

