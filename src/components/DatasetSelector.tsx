import React, { useMemo, useState } from "react";
import { Dataset } from "../types";
import { parseWorkbookFile } from "../data";
import { Upload, FileSpreadsheet, HardDriveDownload, ShieldAlert, CheckCircle2, LoaderCircle } from "lucide-react";

interface DatasetSelectorProps {
  onDatasetLoaded: (dataset: Dataset, logs: string[]) => void;
  currentDatasetName?: string;
}

export default function DatasetSelector({ onDatasetLoaded, currentDatasetName }: DatasetSelectorProps) {
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const acceptLabel = useMemo(() => ".csv, .xlsx, .xls", []);

  const processFile = async (file: File) => {
    setErrorMsg(null);
    setIsParsing(true);

    try {
      const parsed = file.name.toLowerCase().endsWith(".csv")
        ? await parseWorkbookFile(file)
        : await parseWorkbookFile(file);

      const logs = [
        `Loaded file: ${file.name}`,
        `Detected ${parsed.headers.length} column(s) and ${parsed.rows.length} row(s).`,
        `Workbook source: ${parsed.sheetName || parsed.sourceType || "csv"}`,
        `Data is ready for local profiling, forecasting, and chat.`,
      ];

      onDatasetLoaded(parsed, logs);
    } catch (error: any) {
      setErrorMsg(error?.message || "Unable to parse the uploaded file.");
    } finally {
      setIsParsing(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    void processFile(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void processFile(file);
    }
  };

  return (
    <div className="bg-[#161618] border border-white/5 rounded-2xl p-6 shadow-xs flex flex-col gap-6 font-sans">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h3 className="font-semibold text-sm text-white tracking-tight flex items-center gap-2 mb-1">
            <FileSpreadsheet className="w-4 h-4 text-sky-400" />
            Local Data Workspace
          </h3>
          <p className="text-[11px] text-gray-400 font-medium max-w-2xl">
            Upload a CSV or Excel workbook from your laptop. The app will profile it locally, then route insights to the offline BI agents.
          </p>
        </div>

        <div className="flex items-center gap-2 text-[10px] text-gray-400 bg-black/20 border border-white/5 px-3 py-2 rounded-full">
          <HardDriveDownload className="w-3.5 h-3.5 text-emerald-400" />
          Local only
        </div>
      </div>

      <div
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-2xl p-8 text-center flex flex-col items-center justify-center transition-all ${
          dragActive
            ? "border-sky-500 bg-sky-500/10 text-sky-200"
            : "border-white/10 bg-black/20 hover:border-white/20 text-gray-400"
        }`}
      >
        {isParsing ? (
          <LoaderCircle className="w-10 h-10 text-sky-400 stroke-[1.5] mb-3 animate-spin" />
        ) : (
          <Upload className="w-10 h-10 text-gray-500 stroke-[1.4] mb-3" />
        )}

        <label className="text-xs font-semibold text-gray-300 cursor-pointer mb-1 block">
          Drag and drop a workbook
          <span className="text-sky-400 hover:text-sky-350 underline ml-1 font-semibold">
            or browse files
          </span>
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleFileUpload}
            className="hidden"
          />
        </label>
        <p className="text-[10px] text-gray-500 font-mono">Accepted formats: {acceptLabel}</p>
      </div>

      {errorMsg && (
        <div className="p-3.5 bg-red-500/10 text-red-300 rounded-xl border border-red-500/20 text-xs font-medium flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {currentDatasetName ? (
        <div className="flex items-center gap-2 text-xs font-semibold text-sky-300 bg-sky-500/10 border border-sky-500/20 p-3 rounded-xl">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-sky-400" />
          <span>
            Active workbook: <strong className="font-bold text-white">{currentDatasetName}</strong>
          </span>
        </div>
      ) : (
        <div className="text-xs text-gray-500 bg-black/15 border border-white/5 rounded-xl p-3">
          No workbook loaded yet. Upload a dataset to begin profiling and analysis.
        </div>
      )}
    </div>
  );
}
