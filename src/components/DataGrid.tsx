/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { Dataset, ColumnMetric } from "../types";
import { Search, Filter, AlertTriangle, Check, Trash2, Calendar, ClipboardCheck, ArrowUpDown } from "lucide-react";

interface DataGridProps {
  dataset: Dataset;
  onCleanDataset: (actionKey: string, columnName: string) => void;
  onUpdateCell: (rowIdx: number, header: string, value: any) => void;
}

export default function DataGrid({ dataset, onCleanDataset, onUpdateCell }: DataGridProps) {
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [sortDesc, setSortDesc] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"table" | "profiler">("table");

  // Filtering Logic
  const filteredRows = dataset.rows.filter((row) =>
    Object.values(row).some((val) =>
      val !== null && val !== undefined
        ? String(val).toLowerCase().includes(searchTerm.toLowerCase())
        : false
    )
  );

  // Sorting Logic
  if (sortBy) {
    filteredRows.sort((a, b) => {
      const aVal = a[sortBy!];
      const bVal = b[sortBy!];

      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDesc ? bVal - aVal : aVal - bVal;
      }
      return sortDesc
        ? String(bVal).localeCompare(String(aVal))
        : String(aVal).localeCompare(String(bVal));
    });
  }

  const handleSort = (header: string) => {
    if (sortBy === header) {
      setSortDesc(!sortDesc);
    } else {
      setSortBy(header);
      setSortDesc(false);
    }
  };

  return (
    <div className="bg-[#161618] border border-white/5 rounded-2xl shadow-xs overflow-hidden font-sans">
      {/* Sub tabs header */}
      <div className="border-b border-white/5 px-6 py-4 bg-[#1e1e21] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex bg-black/40 p-0.5 rounded-xl border border-white/5 self-start">
          <button
            onClick={() => setActiveTab("table")}
            className={`text-xs font-semibold px-4 py-1.5 rounded-lg transition-all cursor-pointer ${
              activeTab === "table" ? "bg-white/5 text-white border border-white/5 shadow-xs" : "text-gray-400 hover:text-white"
            }`}
          >
            Tabular Editor
          </button>
          <button
            onClick={() => setActiveTab("profiler")}
            className={`text-xs font-semibold px-4 py-1.5 rounded-lg transition-all cursor-pointer ${
              activeTab === "profiler" ? "bg-white/5 text-white border border-white/5 shadow-xs" : "text-gray-400 hover:text-white"
            }`}
          >
            Schema Profiler
          </button>
        </div>

        {activeTab === "table" && (
          <div className="relative max-w-xs w-full">
            <input
              type="text"
              placeholder="Search tabular records..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-black/30 border border-white/10 pl-8 pr-4 py-1.5 rounded-xl text-xs text-white focus:outline-none focus:border-sky-500 transition placeholder-gray-500"
            />
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-gray-500" />
          </div>
        )}
      </div>

      {activeTab === "table" ? (
        /* Grid Table mode with inline adjustments */
        <div className="overflow-x-auto select-text max-h-[500px]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/5 bg-black/20">
                {dataset.headers.map((hdr) => (
                  <th
                    key={hdr}
                    onClick={() => handleSort(hdr)}
                    className="p-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider font-mono cursor-pointer hover:bg-white/5 select-none group"
                  >
                    <div className="flex items-center gap-1.5">
                      {hdr}
                      <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-xs">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={dataset.headers.length} className="p-12 text-center text-gray-500">
                    No results match search key.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row, rowIdx) => (
                  <tr key={rowIdx} className="hover:bg-white/2 transition duration-150">
                    {dataset.headers.map((header) => {
                      const value = row[header];
                      const isNull = value === null || value === undefined || value === "";

                      return (
                        <td
                          key={header}
                          className={`p-2.5 font-mono min-w-[120px] transition ${
                            isNull ? "bg-red-500/5 text-red-400 font-semibold" : "text-gray-300"
                          }`}
                        >
                          <input
                            type={typeof value === "number" ? "number" : "text"}
                            value={isNull ? "" : value}
                            placeholder="NULL"
                            onChange={(e) => {
                              const val = e.target.type === "number" ? parseFloat(e.target.value) : e.target.value;
                              const finalValue = typeof val === "number" && isNaN(val) ? null : val;
                              onUpdateCell(rowIdx, header, finalValue);
                            }}
                            className="bg-transparent w-full focus:bg-black/30 focus:ring-1 focus:ring-sky-500/20 rounded px-1 py-0.5 border-none outline-none transition text-gray-200"
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        /* Profiler summary cards & cleaner actions */
        <div className="p-6 space-y-6 bg-[#161618]">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {dataset.metrics.map((metric) => (
              <div
                key={metric.name}
                className="bg-black/20 border border-white/5 rounded-xl p-4 flex flex-col justify-between hover:border-white/10 transition"
              >
                <div>
                  <div className="flex items-start justify-between border-b border-white/5 pb-2 mb-2">
                    <div>
                      <h4 className="font-semibold text-xs text-white tracking-tight">
                        {metric.name}
                      </h4>
                      <span className="text-[9px] uppercase font-mono text-gray-500">
                        Type: {metric.type}
                      </span>
                    </div>

                    {metric.missingCount > 0 && (
                      <span className="text-[9px] font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-full px-2 py-0.5 flex items-center gap-1 animate-pulse">
                        <AlertTriangle className="w-2.5 h-2.5" />
                        {metric.missingCount} Missing
                      </span>
                    )}
                  </div>

                  <div className="space-y-1.5 text-[11px] text-gray-400">
                    <div className="flex justify-between">
                      <span>Unique values:</span>
                      <strong className="font-semibold text-gray-200">{metric.distinctValues}</strong>
                    </div>

                    {metric.type === "number" && (
                      <>
                        <div className="flex justify-between">
                          <span>Mean Value:</span>
                          <strong className="font-semibold text-gray-200">{metric.mean}</strong>
                        </div>
                        <div className="flex justify-between">
                          <span>Median:</span>
                          <strong className="font-semibold text-gray-200">{metric.median}</strong>
                        </div>
                        <div className="flex justify-between">
                          <span>Bounds [Min - Max]:</span>
                          <strong className="font-mono text-[10px] text-sky-400">
                            [{metric.min} - {metric.max}]
                          </strong>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Agent 1 Data Cleaner action suggestion bar */}
                <div className="border-t border-white/5 pt-3 mt-4 flex items-center justify-between gap-2">
                  <span className="text-[9px] text-gray-500 font-medium font-mono">Auto-Cleaner Actions:</span>
                  <div className="flex gap-1">
                    {metric.missingCount > 0 && (
                      <button
                        onClick={() => onCleanDataset("fill_median", metric.name)}
                        className="bg-sky-500/10 border border-sky-500/20 text-sky-400 font-semibold hover:bg-sky-500/20 text-[10px] px-2.5 py-1 rounded transition cursor-pointer"
                        title="Impute Null files with average/median values"
                      >
                        Impute Nulls
                      </button>
                    )}
                    <button
                      onClick={() => onCleanDataset("drop_null", metric.name)}
                      className="border border-white/10 hover:bg-rose-500/10 hover:text-rose-455 text-[10px] p-1 rounded transition cursor-pointer text-gray-400"
                      title="Drop rows where this column is missing"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-[#1e1e21] border border-white/5 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-start gap-2.5">
              <ClipboardCheck className="w-7 h-7 text-sky-400 stroke-[1.2] shrink-0 mt-0.5" />
              <div>
                <h5 className="font-semibold text-xs text-white leading-tight">Data Quality Standard Verified</h5>
                <p className="text-[10px] text-gray-400 leading-normal max-w-lg mt-0.5">
                  Agent 1 cleans values by running client-side imputations or calling Llama to structure commercial patterns automatically.
                </p>
              </div>
            </div>
            
            <button
              onClick={() => onCleanDataset("remove_outliers", "*")}
              className="bg-sky-600 hover:bg-sky-500 text-white font-semibold text-[10px] px-3.5 py-2 rounded-xl transition cursor-pointer"
            >
              Impute Comprehensive Outliers (Z-Score)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
