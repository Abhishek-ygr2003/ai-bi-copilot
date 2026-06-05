/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";

interface ChartProps {
  type: "bar" | "line" | "scatter" | "area" | "pie";
  title: string;
  data: any[];
  xAxisKey: string;
  yAxisKey: string;
  colorTheme?: "violet" | "emerald" | "amber" | "rose" | "cyan";
  height?: number;
}

export default function CustomChart({
  type,
  title,
  data,
  xAxisKey,
  yAxisKey,
  colorTheme = "violet",
  height = 250,
}: ChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center border border-dashed border-white/5 rounded-xl bg-black/20 p-6 text-gray-400 font-sans text-xs">
        No dataset records available to plot.
      </div>
    );
  }

  // Extract clean labels and numeric values
  const points = data.map((item, idx) => {
    const rawX = item[xAxisKey];
    const rawY = item[yAxisKey];
    const xLabel = rawX !== undefined && rawX !== null ? String(rawX) : `Row ${idx + 1}`;
    const yVal = typeof rawY === "number" ? rawY : parseFloat(String(rawY)) || 0;
    return { label: xLabel, value: yVal, index: idx, original: item };
  });

  const values = points.map((p) => p.value);
  const minVal = Math.min(...values, 0); // floor axis at 0
  const maxVal = Math.max(...values, 10) * 1.1; // 10% ceiling
  const valRange = maxVal - minVal;

  const width = 500;
  const paddingLeft = 45;
  const paddingRight = 15;
  const paddingTop = 25;
  const paddingBottom = 35;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  // Colors dictionary matching selected professional profiles
  const colors = {
    violet: {
      primary: "#38bdf8", // Changed to Sky blue to represent the unified Elegant Dark vibe
      sec: "#0284c7",
      gradient: ["rgba(56, 189, 248, 0.4)", "rgba(56, 189, 248, 0.0)"],
      bg: "bg-sky-500/15 text-sky-300 border-sky-500/20",
      fill: "fill-sky-500",
      stroke: "stroke-sky-600",
    },
    emerald: {
      primary: "#34d399",
      sec: "#059669",
      gradient: ["rgba(52, 211, 153, 0.4)", "rgba(52, 211, 153, 0.0)"],
      bg: "bg-emerald-500/15 text-emerald-300 border-emerald-500/20",
      fill: "fill-emerald-500",
      stroke: "stroke-emerald-600",
    },
    amber: {
      primary: "#fbbf24",
      sec: "#d97706",
      gradient: ["rgba(251, 191, 36, 0.4)", "rgba(251, 191, 36, 0.0)"],
      bg: "bg-amber-500/15 text-amber-300 border-amber-500/20",
      fill: "fill-amber-500",
      stroke: "stroke-amber-600",
    },
    rose: {
      primary: "#f43f5e",
      sec: "#fb7185",
      gradient: ["rgba(244, 63, 94, 0.4)", "rgba(244, 63, 94, 0.0)"],
      bg: "bg-rose-500/15 text-rose-300 border-rose-500/20",
      fill: "fill-rose-500",
      stroke: "stroke-rose-600",
    },
    cyan: {
      primary: "#22d3ee",
      sec: "#0891b2",
      gradient: ["rgba(34, 211, 238, 0.4)", "rgba(34, 211, 238, 0.0)"],
      bg: "bg-cyan-500/15 text-cyan-300 border-cyan-500/20",
      fill: "fill-cyan-500",
      stroke: "stroke-cyan-600",
    },
  }[colorTheme];

  // Map database points to exact coordinate grids in the canvas box
  const coords = points.map((p, idx) => {
    const x = paddingLeft + (idx / Math.max(points.length - 1, 1)) * chartWidth;
    const normY = valRange > 0 ? (p.value - minVal) / valRange : 0.5;
    const y = paddingTop + chartHeight - normY * chartHeight;
    return { x, y, label: p.label, value: p.value };
  });

  // Dynamic gridlines calculation
  const tickCount = 4;
  const gridYValues = Array.from({ length: tickCount }, (_, i) => {
    const fract = i / (tickCount - 1);
    const value = minVal + fract * valRange;
    const y = paddingTop + chartHeight - fract * chartHeight;
    return { y, label: value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value.toFixed(0) };
  });

  const renderSelectedChart = () => {
    if (type === "bar") {
      const barWidth = Math.max(8, (chartWidth / points.length) * 0.6);
      return coords.map((c, i) => {
        const barHeight = paddingTop + chartHeight - c.y;
        const xPos = c.x - barWidth / 2;
        const isHovered = hoveredIdx === i;
        return (
          <g key={i}>
            {/* Extended invisible overlay for comfortable touch target/hovers */}
            <rect
              x={c.x - (chartWidth / points.length) / 2}
              y={paddingTop}
              width={chartWidth / points.length}
              height={chartHeight}
              fill="transparent"
              className="cursor-pointer"
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
            />
            <rect
              x={xPos}
              y={c.y}
              width={barWidth}
              height={Math.max(barHeight, 2)}
              rx={Math.min(4, barWidth / 2)}
              fill={isHovered ? colors.primary : colors.sec}
              className="transition-all duration-300 pointer-events-none"
              style={{ filter: isHovered ? "drop-shadow(0 4px 6px rgba(0,0,0,0.15))" : "none" }}
            />
          </g>
        );
      });
    }

    if (type === "line" || type === "area") {
      if (coords.length < 2) return null;
      let pathD = `M ${coords[0].x} ${coords[0].y}`;
      for (let i = 1; i < coords.length; i++) {
        pathD += ` L ${coords[i].x} ${coords[i].y}`;
      }

      let areaD = "";
      if (type === "area") {
        areaD = `${pathD} L ${coords[coords.length - 1].x} ${paddingTop + chartHeight} L ${coords[0].x} ${paddingTop + chartHeight} Z`;
      }

      return (
        <g>
          {type === "area" && (
            <path
              d={areaD}
              fill={`url(#areaGradient-${colorTheme})`}
              className="pointer-events-none transition-all duration-300"
            />
          )}
          <path
            d={pathD}
            fill="none"
            stroke={colors.primary}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="pointer-events-none"
          />
          {coords.map((c, i) => {
            const isHovered = hoveredIdx === i;
            return (
              <g key={i}>
                <circle
                  cx={c.x}
                  cy={c.y}
                  r={isHovered ? 6 : 4}
                  fill={isHovered ? "#FFFFFF" : colors.primary}
                  stroke={colors.primary}
                  strokeWidth={isHovered ? 3 : 1.5}
                  className="transition-all duration-300 cursor-pointer"
                  onMouseEnter={() => setHoveredIdx(i)}
                  onMouseLeave={() => setHoveredIdx(null)}
                />
                {/* Bigger trigger helper */}
                <circle
                  cx={c.x}
                  cy={c.y}
                  r={20}
                  fill="transparent"
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredIdx(i)}
                  onMouseLeave={() => setHoveredIdx(null)}
                />
              </g>
            );
          })}
        </g>
      );
    }

    if (type === "scatter") {
      return coords.map((c, i) => {
        const isHovered = hoveredIdx === i;
        return (
          <g key={i}>
            <circle
              cx={c.x}
              cy={c.y}
              r={isHovered ? 8 : 6}
              fill={colors.primary}
              fillOpacity={isHovered ? 1.0 : 0.7}
              stroke="#FFFFFF"
              strokeWidth={1.5}
              className="transition-all duration-300 cursor-pointer"
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
            />
            <circle
              cx={c.x}
              cy={c.y}
              r={20}
              fill="transparent"
              className="cursor-pointer"
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
            />
          </g>
        );
      });
    }

    if (type === "pie") {
      const sum = values.reduce((a, b) => a + b, 0);
      let cumulativeAngle = 0;
      const r = Math.min(chartWidth, chartHeight) / 2.2;
      const cx = paddingLeft + chartWidth / 2;
      const cy = paddingTop + chartHeight / 2;

      if (sum === 0) return null;

      return points.map((p, i) => {
        const percentage = p.value / sum;
        const angle = percentage * 360;
        const isHovered = hoveredIdx === i;

        // Calculate start and end point coordinates
        const x1 = cx + r * Math.cos(((cumulativeAngle - 90) * Math.PI) / 180);
        const y1 = cy + r * Math.sin(((cumulativeAngle - 90) * Math.PI) / 180);

        cumulativeAngle += angle;

        const x2 = cx + r * Math.cos(((cumulativeAngle - 90) * Math.PI) / 180);
        const y2 = cy + r * Math.sin(((cumulativeAngle - 90) * Math.PI) / 180);

        // Large arc flag
        const largeArc = angle > 180 ? 1 : 0;

        // Build sector path
        const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;

        // Generates varying shifts of base color
        const baseOpacity = 0.3 + (i / points.length) * 0.7;

        return (
          <path
            key={i}
            d={d}
            fill={colors.primary}
            fillOpacity={isHovered ? 1.0 : baseOpacity}
            stroke="#161618"
            strokeWidth={1.5}
            className="transition-all duration-300 cursor-pointer"
            style={{
              transform: isHovered ? "scale(1.03)" : "scale(1)",
              transformOrigin: `${cx}px ${cy}px`,
            }}
            onMouseEnter={() => setHoveredIdx(i)}
            onMouseLeave={() => setHoveredIdx(null)}
          />
        );
      });
    }

    return null;
  };

  return (
    <div className="bg-[#161618] border border-white/5 rounded-xl p-4 shadow-xs flex flex-col justify-between h-full group">
      <div className="flex items-center justify-between mb-3 border-b border-white/5 pb-2">
        <h4 className="font-sans font-semibold text-xs text-white tracking-tight">{title}</h4>
        <span className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded-full font-semibold border ${colors.bg}`}>
          {type} • {yAxisKey}
        </span>
      </div>

      <div className="relative flex-1 select-none">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
          <defs>
            <linearGradient id={`areaGradient-${colorTheme}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colors.gradient[0]} />
              <stop offset="100%" stopColor={colors.gradient[1]} />
            </linearGradient>
          </defs>

          {/* Grid lines (except for Pie) */}
          {type !== "pie" && (
            <g className="opacity-20">
              {gridYValues.map((tick, i) => (
                <g key={i}>
                  <line
                    x1={paddingLeft}
                    y1={tick.y}
                    x2={width - paddingRight}
                    y2={tick.y}
                    stroke="rgba(255, 255, 255, 0.2)"
                    strokeWidth={1}
                    strokeDasharray="3 3"
                  />
                  <text
                    x={paddingLeft - 8}
                    y={tick.y + 3}
                    textAnchor="end"
                    className="font-mono text-[9px] fill-gray-405 font-medium"
                  >
                    {tick.label}
                  </text>
                </g>
              ))}
            </g>
          )}

          {/* Core chart drawing content */}
          {renderSelectedChart()}

          {/* Horizontal labels / X Axis (except for Pie) */}
          {type !== "pie" && (
            <g>
              {points.map((p, i) => {
                const step = Math.max(1, Math.ceil(points.length / 5));
                if (i % step !== 0 && i !== points.length - 1) return null;
                const xVal = coords[i].x;
                return (
                  <text
                    key={i}
                    x={xVal}
                    y={height - paddingBottom + 16}
                    textAnchor="middle"
                    className="font-sans text-[8px] fill-gray-400 max-w-[40px] truncate"
                  >
                    {p.label.length > 8 ? `${p.label.substring(0, 6)}..` : p.label}
                  </text>
                );
              })}
            </g>
          )}
        </svg>

        {/* Dynamic Tooltip */}
        {hoveredIdx !== null && points[hoveredIdx] && (
          <div
            className="absolute z-30 bg-slate-900/90 text-white p-2 rounded-lg text-[10px] shadow-lg pointer-events-none border border-slate-700 min-w-[120px] transition-all duration-100"
            style={{
              left: `${coords[hoveredIdx]?.x ? (coords[hoveredIdx].x / width) * 100 : 50}%`,
              top: `${coords[hoveredIdx]?.y ? Math.max(10, ((coords[hoveredIdx].y - 45) / height) * 100) : 10}%`,
              transform: "translateX(-50%)",
            }}
          >
            <p className="font-semibold text-gray-300 border-b border-slate-700 pb-0.5 mb-1 max-w-[130px] truncate">
              {points[hoveredIdx].label}
            </p>
            <div className="flex justify-between items-center gap-2">
              <span className="text-gray-400 capitalize">{yAxisKey}:</span>
              <span className="font-mono font-bold text-emerald-400">
                {typeof points[hoveredIdx].value === "number"
                  ? points[hoveredIdx].value.toLocaleString(undefined, { maximumFractionDigits: 2 })
                  : points[hoveredIdx].value}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
