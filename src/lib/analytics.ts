import type {
  ChartCard,
  CleanerSuggestion,
  ColumnMetric,
  Dataset,
  DatasetProfile,
  ExecutiveReport,
  ForecastResult,
  InsightCard,
  KpiSummary,
  QuestionAnswer,
} from "../types";

type DatasetRow = Record<string, any>;
type NumericStats = {
  values: number[];
  mean: number;
  median: number;
  stdDev: number;
  min: number;
  max: number;
  q1: number;
  q3: number;
  iqr: number;
};

type QuestionIntent = "ranking" | "trend" | "churn" | "count" | "distribution" | "general";

const BUSINESS_TERMS: Record<string, string[]> = {
  revenue: ["revenue", "sales", "turnover", "income", "billings", "mrr", "arr", "bookings"],
  profit: ["profit", "netprofit", "net profit", "margin", "ebit", "earnings"],
  cost: ["cost", "cogs", "expense", "spend", "opex"],
  marketing: ["marketing", "ad", "ads", "spend", "campaign"],
  customer: ["customer", "client", "account", "buyer", "subscriber", "user"],
  product: ["product", "sku", "item", "service", "plan", "package"],
  region: ["region", "market", "country", "state", "territory", "geo"],
  date: ["date", "month", "quarter", "year", "week", "day", "signup"],
  churn: ["churn", "cancel", "attrition", "retention", "haschurned", "inactive"],
  rating: ["rating", "score", "nps", "satisfaction", "review"],
  quantity: ["quantity", "units", "volume", "orders", "count", "transactions"],
  support: ["ticket", "support", "case", "issue", "complaint"],
};

const ID_PATTERNS = ["id", "code", "key", "uuid", "order", "customer", "account"];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isMissing(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

export function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function formatNumber(value: number, digits = 2): string {
  if (!Number.isFinite(value)) {
    return "0";
  }

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }

  const absolute = Math.abs(value);
  const sign = value < 0 ? "-" : "";

  if (absolute >= 1_000_000_000) return `${sign}${(absolute / 1_000_000_000).toFixed(1)}B`;
  if (absolute >= 1_000_000) return `${sign}${(absolute / 1_000_000).toFixed(1)}M`;
  if (absolute >= 1_000) return `${sign}${(absolute / 1_000).toFixed(1)}K`;
  return `${sign}${formatNumber(absolute, absolute % 1 === 0 ? 0 : 1)}`;
}

export function formatPercent(value: number, digits = 1): string {
  return `${formatNumber(value, digits)}%`;
}

export function normalizeCellValue(value: unknown): unknown {
  if (isMissing(value)) {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }

  const text = String(value).trim();
  if (!text) {
    return null;
  }

  const lower = text.toLowerCase();
  if (["true", "yes", "y"].includes(lower)) return true;
  if (["false", "no", "n"].includes(lower)) return false;

  const percentMatch = text.match(/^(-?[\d,.]+)%$/);
  if (percentMatch) {
    const parsed = Number(percentMatch[1].replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : text;
  }

  const numericText = text.replace(/[$€£,\s]/g, "");
  if (/^-?\d+(\.\d+)?$/.test(numericText)) {
    const parsed = Number(numericText);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  const timestamp = Date.parse(text);
  if (!Number.isNaN(timestamp) && /[-/:]/.test(text)) {
    const iso = new Date(timestamp).toISOString();
    return iso.slice(0, 10);
  }

  return text;
}

function coerceNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "boolean" || isMissing(value)) {
    return null;
  }

  const text = String(value).trim();
  if (!text) {
    return null;
  }

  const stripped = text.replace(/[$€£,\s]/g, "");
  if (/^-?\d+(\.\d+)?%$/.test(stripped)) {
    const percentValue = Number(stripped.replace("%", ""));
    return Number.isFinite(percentValue) ? percentValue : null;
  }

  if (/^-?\d+(\.\d+)?$/.test(stripped)) {
    const parsed = Number(stripped);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function coerceDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === "number") {
    if (value > 10_000 && value < 100_000) {
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      const adjusted = new Date(excelEpoch.getTime() + value * 24 * 60 * 60 * 1000);
      return Number.isNaN(adjusted.getTime()) ? null : adjusted;
    }
    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) {
    return null;
  }

  const date = new Date(parsed);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isBooleanLike(value: unknown): boolean {
  if (typeof value === "boolean") return true;
  if (typeof value !== "string") return false;
  const lower = value.trim().toLowerCase();
  return ["true", "false", "yes", "no", "y", "n", "0", "1"].includes(lower);
}

function calculateNumericStats(values: number[]): NumericStats | null {
  const cleanValues = values.filter((value) => Number.isFinite(value));
  if (cleanValues.length === 0) {
    return null;
  }

  const sorted = [...cleanValues].sort((a, b) => a - b);
  const sum = cleanValues.reduce((total, value) => total + value, 0);
  const mean = sum / cleanValues.length;
  const median =
    sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[(sorted.length - 1) / 2];

  const q1 = sorted[Math.floor((sorted.length - 1) * 0.25)] ?? sorted[0];
  const q3 = sorted[Math.floor((sorted.length - 1) * 0.75)] ?? sorted[sorted.length - 1];
  const variance = cleanValues.reduce((accumulator, value) => accumulator + Math.pow(value - mean, 2), 0) / cleanValues.length;
  const stdDev = Math.sqrt(variance);

  return {
    values: cleanValues,
    mean,
    median,
    stdDev,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    q1,
    q3,
    iqr: q3 - q1,
  };
}

function patternScore(name: string, patterns: string[]): number {
  const normalized = normalizeKey(name);
  return patterns.reduce((score, pattern) => (normalized.includes(normalizeKey(pattern)) ? score + 1 : score), 0);
}

function inferColumnType(values: unknown[]): ColumnMetric["type"] {
  const nonNullValues = values.filter((value) => !isMissing(value));
  if (nonNullValues.length === 0) {
    return "string";
  }

  const numericCount = nonNullValues.filter((value) => coerceNumber(value) !== null).length;
  const dateCount = nonNullValues.filter((value) => coerceDate(value) !== null).length;
  const booleanCount = nonNullValues.filter((value) => isBooleanLike(value)).length;

  const numericRatio = numericCount / nonNullValues.length;
  const dateRatio = dateCount / nonNullValues.length;
  const booleanRatio = booleanCount / nonNullValues.length;

  if (numericRatio >= 0.8) return "number";
  if (dateRatio >= 0.8) return "date";
  if (booleanRatio >= 0.8) return "boolean";
  return "string";
}

export function calculateColumnMetrics(headers: string[], rows: DatasetRow[]): ColumnMetric[] {
  return headers.map((header) => {
    const values = rows.map((row) => row[header]);
    const nonNullValues = values.filter((value) => !isMissing(value));
    const type = inferColumnType(nonNullValues);
    const uniqueValues = Array.from(new Set(nonNullValues.map((value) => String(value))));
    const metric: ColumnMetric = {
      name: header,
      type,
      missingCount: values.length - nonNullValues.length,
      distinctValues: uniqueValues.length,
      sampleValues: uniqueValues.slice(0, 5),
    };

    if (type === "number") {
      const numericValues = nonNullValues.map(coerceNumber).filter((value): value is number => value !== null);
      const stats = calculateNumericStats(numericValues);
      if (stats) {
        metric.min = stats.min;
        metric.max = stats.max;
        metric.mean = Number(stats.mean.toFixed(2));
        metric.median = Number(stats.median.toFixed(2));
        metric.stdDev = Number(stats.stdDev.toFixed(2));
      }
    }

    return metric;
  });
}

export function rebuildDataset(dataset: Dataset, rows: DatasetRow[]): Dataset {
  return {
    ...dataset,
    rows,
    metrics: calculateColumnMetrics(dataset.headers, rows),
  };
}

function findMetricsByPattern(metrics: ColumnMetric[], patterns: string[]): ColumnMetric[] {
  return metrics.filter((metric) => patternScore(metric.name, patterns) > 0);
}

function findBestNumericMetric(metrics: ColumnMetric[]): ColumnMetric | undefined {
  const scored = metrics
    .filter((metric) => metric.type === "number")
    .map((metric) => {
      const normalizedName = normalizeKey(metric.name);
      const looksLikeId = ID_PATTERNS.some((pattern) => normalizedName.includes(normalizeKey(pattern)));
      const mean = metric.mean ?? 1;
      const cv = mean !== 0 ? Math.min(1.5, (metric.stdDev ?? 0) / Math.abs(mean)) : 0;

      let score =
        patternScore(metric.name, BUSINESS_TERMS.revenue) * 5 +
        patternScore(metric.name, BUSINESS_TERMS.profit) * 4 +
        patternScore(metric.name, BUSINESS_TERMS.quantity) * 2 +
        cv;

      if (looksLikeId) {
        score -= 50; // Heavily penalize ID-like fields (Row ID, Order ID, Postal Code)
      }

      return { metric, score };
    })
    .sort((left, right) => right.score - left.score);

  return scored[0]?.metric ?? metrics.find((metric) => metric.type === "number");
}

function findBestEntityMetric(metrics: ColumnMetric[], rows: DatasetRow[]): ColumnMetric | undefined {
  const candidates = metrics.filter((metric) => metric.type !== "number" && metric.type !== "date");
  const scored = candidates
    .map((metric) => ({
      metric,
      score:
        patternScore(metric.name, BUSINESS_TERMS.product) * 5 +
        patternScore(metric.name, BUSINESS_TERMS.customer) * 4 +
        patternScore(metric.name, BUSINESS_TERMS.region) * 3 +
        patternScore(metric.name, BUSINESS_TERMS.support) * 2 +
        Math.max(0, 12 - metric.distinctValues) +
        (metric.distinctValues <= rows.length ? 1 : 0),
    }))
    .sort((left, right) => right.score - left.score);

  return scored[0]?.metric ?? candidates[0];
}

function findDateMetric(metrics: ColumnMetric[]): ColumnMetric | undefined {
  return metrics.find((metric) => metric.type === "date" || patternScore(metric.name, BUSINESS_TERMS.date) > 0);
}

function findChurnMetric(metrics: ColumnMetric[]): ColumnMetric | undefined {
  return metrics.find((metric) => patternScore(metric.name, BUSINESS_TERMS.churn) > 0);
}

function getNumericValue(row: DatasetRow, field: string): number | null {
  return coerceNumber(row[field]);
}

function getDateValue(row: DatasetRow, field: string): Date | null {
  return coerceDate(row[field]);
}

export function aggregateByCategory(rows: DatasetRow[], categoryField: string, numericField: string, limit = 10): DatasetRow[] {
  const buckets = new Map<string, number>();

  rows.forEach((row) => {
    const categoryValue = row[categoryField];
    const numericValue = getNumericValue(row, numericField);
    if (isMissing(categoryValue) || numericValue === null) {
      return;
    }

    const label = String(categoryValue);
    buckets.set(label, (buckets.get(label) ?? 0) + numericValue);
  });

  return Array.from(buckets.entries())
    .map(([label, value]) => ({ [categoryField]: label, [numericField]: Number(value.toFixed(2)) }))
    .sort((left, right) => (right[numericField] as number) - (left[numericField] as number))
    .slice(0, limit);
}

export function aggregateByCount(rows: DatasetRow[], field: string, limit = 10): DatasetRow[] {
  const buckets = new Map<string, number>();

  rows.forEach((row) => {
    const value = row[field];
    if (isMissing(value)) {
      return;
    }
    const label = String(value);
    buckets.set(label, (buckets.get(label) ?? 0) + 1);
  });

  return Array.from(buckets.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((left, right) => right.value - left.value)
    .slice(0, limit);
}

/**
 * Builds custom aggregated data array for user-customized dashboard visuals.
 */
export function buildCustomChartData(
  rows: DatasetRow[],
  xAxisKey: string,
  yAxisKey: string,
  type: "bar" | "line" | "scatter" | "area" | "pie"
): Record<string, any>[] {
  if (type === "scatter") {
    return rows
      .map((row) => {
        const xVal = coerceNumber(row[xAxisKey]);
        const yVal = coerceNumber(row[yAxisKey]);
        if (xVal === null || yVal === null) return null;
        return {
          [xAxisKey]: Number(xVal.toFixed(2)),
          [yAxisKey]: Number(yVal.toFixed(2)),
        };
      })
      .filter((v): v is Record<string, any> => v !== null)
      .slice(0, 40);
  }

  if (type === "pie") {
    const isYValid = yAxisKey && yAxisKey !== xAxisKey && yAxisKey !== "value" && yAxisKey !== "count";
    if (!isYValid) {
      const counts = aggregateByCount(rows, xAxisKey, 10);
      return counts.map((item) => ({
        label: item.label,
        value: item.value,
      }));
    } else {
      const grouped = aggregateByCategory(rows, xAxisKey, yAxisKey, 10);
      return grouped.map((item) => ({
        label: String(item[xAxisKey]),
        value: Number(item[yAxisKey]),
      }));
    }
  }

  const isNumericY = yAxisKey && yAxisKey !== xAxisKey;
  if (!isNumericY) {
    const counts = aggregateByCount(rows, xAxisKey, 15);
    return counts.map((item) => ({
      [xAxisKey]: item.label,
      [yAxisKey || "Count"]: item.value,
    }));
  }

  return aggregateByCategory(rows, xAxisKey, yAxisKey, 15);
}

function buildOutlierCount(rows: DatasetRow[], metrics: ColumnMetric[]): number {
  const numberMetrics = metrics.filter((metric) => metric.type === "number");
  if (numberMetrics.length === 0) {
    return 0;
  }

  const statsByMetric = new Map<string, NumericStats>();
  numberMetrics.forEach((metric) => {
    const numericValues = rows.map((row) => getNumericValue(row, metric.name)).filter((value): value is number => value !== null);
    const stats = calculateNumericStats(numericValues);
    if (stats) {
      statsByMetric.set(metric.name, stats);
    }
  });

  const outlierRows = new Set<number>();
  rows.forEach((row, rowIndex) => {
    for (const metric of numberMetrics) {
      const value = getNumericValue(row, metric.name);
      const stats = statsByMetric.get(metric.name);
      if (value === null || !stats || stats.stdDev === 0) {
        continue;
      }

      const zScore = Math.abs((value - stats.mean) / stats.stdDev);
      const outsideIqr = value < stats.q1 - 1.5 * stats.iqr || value > stats.q3 + 1.5 * stats.iqr;
      if (zScore > 3 || outsideIqr) {
        outlierRows.add(rowIndex);
        break;
      }
    }
  });

  return outlierRows.size;
}

function buildDuplicateCount(rows: DatasetRow[]): number {
  const signatures = new Set<string>();
  let duplicates = 0;

  rows.forEach((row) => {
    const signature = JSON.stringify(row, Object.keys(row).sort());
    if (signatures.has(signature)) {
      duplicates += 1;
      return;
    }
    signatures.add(signature);
  });

  return duplicates;
}

function buildCleanerSuggestions(dataset: Dataset, metrics: ColumnMetric[], outlierRows: number): CleanerSuggestion[] {
  const suggestions: CleanerSuggestion[] = [];

  metrics.forEach((metric) => {
    if (metric.missingCount > 0) {
      suggestions.push({
        column: metric.name,
        issueType: "Missing Values",
        description: `${metric.missingCount} rows have empty values in ${metric.name}.`,
        remedyCode: metric.type === "number" ? "fill_median" : "fill_mode",
        impact: metric.missingCount > dataset.rows.length * 0.15 ? "High" : "Medium",
      });
    }

    if (metric.type === "number" && outlierRows > 0) {
      suggestions.push({
        column: metric.name,
        issueType: "Outliers",
        description: `Potential extreme values detected in ${metric.name}. Review spikes before forecasting or aggregation.`,
        remedyCode: "remove_outliers",
        impact: "Medium",
      });
    }

    const normalizedName = normalizeKey(metric.name);
    const looksLikeId = ID_PATTERNS.some((pattern) => normalizedName.includes(normalizeKey(pattern)));
    if (looksLikeId && metric.distinctValues >= Math.max(5, dataset.rows.length * 0.75)) {
      suggestions.push({
        column: metric.name,
        issueType: "Identifier Field",
        description: `${metric.name} behaves like an identifier with very high cardinality. Keep it for joins, not aggregation.`,
        remedyCode: "index_only",
        impact: "Low",
      });
    }
  });

  return suggestions.slice(0, 6);
}

function buildBusinessKpis(dataset: Dataset, metrics: ColumnMetric[]): KpiSummary[] {
  const kpis: KpiSummary[] = [];
  const revenueMetric = findMetricsByPattern(metrics, BUSINESS_TERMS.revenue).find((metric) => metric.type === "number") ?? findBestNumericMetric(metrics);
  const profitMetric = findMetricsByPattern(metrics, BUSINESS_TERMS.profit).find((metric) => metric.type === "number");
  const costMetric = findMetricsByPattern(metrics, BUSINESS_TERMS.cost).find((metric) => metric.type === "number");
  const customerMetric = findMetricsByPattern(metrics, BUSINESS_TERMS.customer).find((metric) => metric.distinctValues > 0);
  const churnMetric = findChurnMetric(metrics);
  const ratingMetric = findMetricsByPattern(metrics, BUSINESS_TERMS.rating).find((metric) => metric.type === "number");

  if (revenueMetric?.type === "number") {
    const totalRevenue = dataset.rows.reduce((total, row) => total + (getNumericValue(row, revenueMetric.name) ?? 0), 0);
    kpis.push({
      label: `Total ${titleCase(revenueMetric.name)}`,
      value: formatCompactNumber(totalRevenue),
      valueFormula: `sum(${revenueMetric.name})`,
      businessValue: `Measures the full monetary volume captured in ${revenueMetric.name}.`,
    });
  }

  if (profitMetric?.type === "number") {
    const totalProfit = dataset.rows.reduce((total, row) => total + (getNumericValue(row, profitMetric.name) ?? 0), 0);
    const revenueMetricName = revenueMetric?.name;
    const profitMargin = revenueMetricName
      ? dataset.rows.reduce((total, row) => total + (getNumericValue(row, profitMetric.name) ?? 0), 0) /
        Math.max(1, dataset.rows.reduce((total, row) => total + (getNumericValue(row, revenueMetricName) ?? 0), 0))
      : null;

    kpis.push({
      label: `Net ${titleCase(profitMetric.name)}`,
      value: formatCompactNumber(totalProfit),
      valueFormula: `sum(${profitMetric.name})`,
      businessValue: profitMargin !== null ? `Aggregate profitability with an estimated margin of ${formatPercent(profitMargin * 100, 1)}.` : "Aggregate profitability across all records.",
    });
  }

  if (customerMetric) {
    kpis.push({
      label: `Unique ${titleCase(customerMetric.name)}`,
      value: formatCompactNumber(customerMetric.distinctValues),
      valueFormula: `count_distinct(${customerMetric.name})`,
      businessValue: `Counts the number of unique ${titleCase(customerMetric.name)} values in the dataset.`,
    });
  }

  if (churnMetric) {
    const churnCount = dataset.rows.filter((row) => {
      const value = row[churnMetric.name];
      if (typeof value === "boolean") return value;
      const text = String(value).trim().toLowerCase();
      return ["yes", "true", "1", "churned", "inactive"].includes(text);
    }).length;
    const churnRate = churnCount / Math.max(1, dataset.rows.length);

    kpis.push({
      label: `${titleCase(churnMetric.name)} Rate` ,
      value: formatPercent(churnRate * 100, 1),
      valueFormula: `count_if(${churnMetric.name}) / count(*)`,
      businessValue: "Shows how much of the customer base is flagged as churned or inactive.",
    });
  }

  if (ratingMetric?.type === "number") {
    const averageRating = dataset.rows.reduce((total, row) => total + (getNumericValue(row, ratingMetric.name) ?? 0), 0) / Math.max(1, dataset.rows.length);
    kpis.push({
      label: `Average ${titleCase(ratingMetric.name)}`,
      value: formatNumber(averageRating, 1),
      valueFormula: `avg(${ratingMetric.name})`,
      businessValue: "Represents customer sentiment or operational performance as a score.",
    });
  }

  if (costMetric?.type === "number") {
    const totalCost = dataset.rows.reduce((total, row) => total + (getNumericValue(row, costMetric.name) ?? 0), 0);
    kpis.push({
      label: `Total ${titleCase(costMetric.name)}`,
      value: formatCompactNumber(totalCost),
      valueFormula: `sum(${costMetric.name})`,
      businessValue: "Captures the total cost pressure seen in the workbook.",
    });
  }

  if (kpis.length === 0) {
    kpis.push({
      label: "Record Count",
      value: formatCompactNumber(dataset.rows.length),
      valueFormula: "count(*)",
      businessValue: "Baseline row count for the uploaded workbook.",
    });
  }

  return kpis.slice(0, 4);
}

function buildChartCards(dataset: Dataset, metrics: ColumnMetric[]): ChartCard[] {
  const charts: ChartCard[] = [];
  const numericMetrics = metrics.filter((metric) => metric.type === "number");
  const dateMetric = findDateMetric(metrics);
  const businessNumericMetric = findBestNumericMetric(metrics);
  const entityMetric = findBestEntityMetric(metrics, dataset.rows);

  if (dateMetric && businessNumericMetric) {
    const timeSeries = dataset.rows
      .map((row) => ({
        row,
        date: getDateValue(row, dateMetric.name),
        value: getNumericValue(row, businessNumericMetric.name),
      }))
      .filter((item): item is { row: DatasetRow; date: Date; value: number } => Boolean(item.date) && item.value !== null)
      .sort((left, right) => left.date.getTime() - right.date.getTime())
      .slice(0, 24)
      .map((item) => ({
        [dateMetric.name]: item.row[dateMetric.name],
        [businessNumericMetric.name]: Number(item.value.toFixed(2)),
      }));

    if (timeSeries.length > 1) {
      charts.push({
        type: "line",
        title: `${titleCase(businessNumericMetric.name)} over ${titleCase(dateMetric.name)}`,
        data: timeSeries,
        xAxisKey: dateMetric.name,
        yAxisKey: businessNumericMetric.name,
        colorTheme: "emerald",
      });
    }
  }

  if (entityMetric && businessNumericMetric && entityMetric.name !== businessNumericMetric.name) {
    const grouped = aggregateByCategory(dataset.rows, entityMetric.name, businessNumericMetric.name, 10);
    if (grouped.length > 1) {
      charts.push({
        type: "bar",
        title: `${titleCase(businessNumericMetric.name)} by ${titleCase(entityMetric.name)}`,
        data: grouped,
        xAxisKey: entityMetric.name,
        yAxisKey: businessNumericMetric.name,
        colorTheme: "violet",
      });
    }
  }

  if (numericMetrics.length >= 2) {
    const first = findBestNumericMetric(metrics);
    let secondCandidates = numericMetrics.filter(
      (metric) => metric.name !== first?.name &&
      !ID_PATTERNS.some((pattern) => normalizeKey(metric.name).includes(normalizeKey(pattern)))
    );
    if (secondCandidates.length === 0) {
      secondCandidates = numericMetrics.filter((metric) => metric.name !== first?.name);
    }
    const second = secondCandidates.length > 0 ? findBestNumericMetric(secondCandidates) : undefined;
    if (first && second) {
      const scatterData = dataset.rows
        .map((row) => {
          const firstValue = getNumericValue(row, first.name);
          const secondValue = getNumericValue(row, second.name);
          if (firstValue === null || secondValue === null) {
            return null;
          }
          return {
            [first.name]: Number(firstValue.toFixed(2)),
            [second.name]: Number(secondValue.toFixed(2)),
          };
        })
        .filter((value): value is Record<string, any> => value !== null)
        .slice(0, 40);

      if (scatterData.length > 3) {
        charts.push({
          type: "scatter",
          title: `${titleCase(first.name)} vs ${titleCase(second.name)}`,
          data: scatterData,
          xAxisKey: first.name,
          yAxisKey: second.name,
          colorTheme: "cyan",
        });
      }
    }
  }

  const churnMetric = findChurnMetric(metrics);
  if (churnMetric) {
    const pieData = aggregateByCount(dataset.rows, churnMetric.name, 6);
    if (pieData.length > 1) {
      charts.push({
        type: "pie",
        title: `${titleCase(churnMetric.name)} distribution`,
        data: pieData,
        xAxisKey: "label",
        yAxisKey: "value",
        colorTheme: "rose",
      });
    }
  }

  return charts.slice(0, 3);
}

function buildInsights(dataset: Dataset, metrics: ColumnMetric[], kpis: KpiSummary[], outlierRows: number, duplicateRows: number): InsightCard[] {
  const insights: InsightCard[] = [];
  const dateMetric = findDateMetric(metrics);
  const numericMetric = findBestNumericMetric(metrics);
  const categoryMetric = findBestEntityMetric(metrics, dataset.rows);

  const missingCells = metrics.reduce((total, metric) => total + metric.missingCount, 0);
  const missingRatio = missingCells / Math.max(1, dataset.rows.length * Math.max(1, dataset.headers.length));

  insights.push({
    title: "Data Quality Snapshot",
    description: `${formatPercent((1 - missingRatio) * 100, 1)} completeness across ${dataset.rows.length} rows and ${dataset.headers.length} columns.`,
    type: missingRatio > 0.1 ? "negative" : "positive",
    evidence: `${missingCells} missing cells, ${duplicateRows} duplicate row(s), ${outlierRows} row(s) with extreme values.`,
  });

  if (dateMetric && numericMetric) {
    const ordered = dataset.rows
      .map((row) => ({ date: getDateValue(row, dateMetric.name), value: getNumericValue(row, numericMetric.name) }))
      .filter((item): item is { date: Date; value: number } => Boolean(item.date) && item.value !== null)
      .sort((left, right) => left.date.getTime() - right.date.getTime());

    if (ordered.length > 1) {
      // Aggregate by month to prevent row-by-row noise
      const monthlyValues = new Map<string, number>();
      ordered.forEach(item => {
        const monthKey = item.date.toISOString().slice(0, 7);
        monthlyValues.set(monthKey, (monthlyValues.get(monthKey) ?? 0) + item.value);
      });
      
      const months = Array.from(monthlyValues.entries()).sort((a, b) => a[0].localeCompare(b[0]));
      
      if (months.length > 1) {
        const firstMonth = months[0];
        const lastMonth = months[months.length - 1];
        const firstValue = firstMonth[1];
        const lastValue = lastMonth[1];
        const change = lastValue - firstValue;
        const percentChange = Math.abs(firstValue) > 0 ? (change / Math.abs(firstValue)) * 100 : 0;

        insights.push({
          title: "Trend Direction",
          description: `${titleCase(numericMetric.name)} moved from ${formatCompactNumber(firstValue)} to ${formatCompactNumber(lastValue)} (${change >= 0 ? "+" : ""}${formatPercent(percentChange, 1)}).`,
          type: change >= 0 ? "trend" : "negative",
          evidence: `Timeline anchored on ${titleCase(dateMetric.name)} with ${months.length} monthly aggregations.`,
          evidenceList: [
            `Start (${firstMonth[0]}): ${formatCompactNumber(firstValue)}`,
            `End (${lastMonth[0]}): ${formatCompactNumber(lastValue)}`,
          ],
          assumptions: "Data aggregated by calendar month to reduce daily/weekly noise.",
        });
      }
    }
  }

  if (categoryMetric && numericMetric) {
    const grouped = aggregateByCategory(dataset.rows, categoryMetric.name, numericMetric.name, 1);
    const top = grouped[0];
    if (top) {
      const topValue = top[numericMetric.name] as number;
      const total = dataset.rows.reduce((sum, row) => sum + (getNumericValue(row, numericMetric.name) ?? 0), 0);
      const share = total > 0 ? (topValue / total) * 100 : 0;

      insights.push({
        title: "Concentration Check",
        description: `${titleCase(categoryMetric.name)} '${String(top[categoryMetric.name])}' contributes ${formatPercent(share, 1)} of total ${titleCase(numericMetric.name)}.`,
        type: share > 35 ? "anomaly" : "distribution",
        evidence: `Top bucket derived from ${categoryMetric.name} grouped against ${numericMetric.name}.`,
      });
    }
  }

  if (outlierRows > 0) {
    insights.push({
      title: "Anomaly Review",
      description: `${outlierRows} row(s) contain extreme values that should be inspected before forecasting or board reporting.`,
      type: "anomaly",
      evidence: "Outlier detection uses z-score and IQR thresholds across numeric columns.",
      evidenceList: [
        `Z-Score threshold: > 3`,
        `IQR bounds applied across all numeric variables.`,
      ]
    });
  }

  // Inject ROI calculation if both Revenue and Marketing are present
  const marketingMetric = findMetricsByPattern(metrics, BUSINESS_TERMS.marketing).find((m) => m.type === "number");
  if (numericMetric && marketingMetric && categoryMetric) {
     const grouped = aggregateByCategory(dataset.rows, categoryMetric.name, numericMetric.name, 1);
     const top = grouped[0];
     if (top) {
       const topCategoryVal = String(top[categoryMetric.name]);
       // Calculate revenue and spend for this top category
       const categoryRows = dataset.rows.filter(r => String(r[categoryMetric.name]) === topCategoryVal);
       const revSum = categoryRows.reduce((acc, row) => acc + (getNumericValue(row, numericMetric.name) ?? 0), 0);
       const spendSum = categoryRows.reduce((acc, row) => acc + (getNumericValue(row, marketingMetric.name) ?? 0), 0);
       
       if (spendSum > 0) {
         const roi = revSum / spendSum;
         insights.push({
           title: `${titleCase(categoryMetric.name)} ROI Performance`,
           description: `${titleCase(categoryMetric.name)} '${topCategoryVal}' achieved the highest ROI of ${formatNumber(roi, 1)}x.`,
           type: "positive",
           evidence: `Based on ${numericMetric.name} and ${marketingMetric.name} columns.`,
           evidenceList: [
             `Category: ${topCategoryVal}`,
             `Revenue: ${formatCompactNumber(revSum)}`,
             `Spend: ${formatCompactNumber(spendSum)}`,
             `ROI: ${formatNumber(roi, 1)}x`
           ],
           assumptions: "ROI assumes all marketing spend within the category is directly attributable to the revenue."
         });
       }
     }
  }

  if (duplicateRows > 0) {
    insights.push({
      title: "Duplicate Records",
      description: `${duplicateRows} duplicate row(s) were found. Consider de-duplicating before aggregating totals.`,
      type: "neutral",
      evidence: "Duplicate rows were detected by exact record signature comparison.",
    });
  }

  if (kpis.length > 0) {
    insights.push({
      title: "Primary KPI Focus",
      description: `Monitor ${kpis[0].label.toLowerCase()} first. It is the most business-relevant measure in the current workbook.`,
      type: "positive",
      evidence: kpis[0].businessValue,
    });
  }

  return insights.slice(0, 4);
}

function buildTopSignals(insights: InsightCard[], kpis: KpiSummary[], metrics: ColumnMetric[]): string[] {
  const signals = new Set<string>();

  insights.forEach((insight) => signals.add(insight.title));
  kpis.forEach((kpi) => signals.add(`${kpi.label}: ${kpi.value}`));
  metrics
    .filter((metric) => metric.missingCount > 0)
    .slice(0, 2)
    .forEach((metric) => signals.add(`${metric.name} has ${metric.missingCount} missing cell(s)`));

  return Array.from(signals).slice(0, 6);
}

function buildRecommendedQuestions(dataset: Dataset, metrics: ColumnMetric[]): string[] {
  const revenueMetric = findMetricsByPattern(metrics, BUSINESS_TERMS.revenue).find((metric) => metric.type === "number");
  const profitMetric = findMetricsByPattern(metrics, BUSINESS_TERMS.profit).find((metric) => metric.type === "number");
  const customerMetric = findMetricsByPattern(metrics, BUSINESS_TERMS.customer).find((metric) => metric.distinctValues > 0);
  const productMetric = findMetricsByPattern(metrics, BUSINESS_TERMS.product).find((metric) => metric.distinctValues > 0);
  const regionMetric = findMetricsByPattern(metrics, BUSINESS_TERMS.region).find((metric) => metric.distinctValues > 0);
  const dateMetric = findDateMetric(metrics);
  const churnMetric = findChurnMetric(metrics);

  const questions = new Set<string>();

  if (productMetric && profitMetric) {
    questions.add(`Which ${productMetric.name} made the most ${profitMetric.name}?`);
  }

  if (regionMetric && revenueMetric) {
    questions.add(`Which ${regionMetric.name} contributed the most ${revenueMetric.name}?`);
  }

  if (dateMetric && revenueMetric) {
    questions.add(`Why did ${revenueMetric.name} change over ${dateMetric.name}?`);
    questions.add(`Show the ${revenueMetric.name} trend over time.`);
  }

  if (customerMetric && revenueMetric) {
    questions.add(`Show top 10 ${customerMetric.name} by ${revenueMetric.name}.`);
  }

  if (churnMetric) {
    questions.add(`What is the churn profile in this dataset?`);
  }

  if (questions.size === 0) {
    questions.add(`What are the most important insights in this workbook?`);
    questions.add(`Show the top 10 rows by the main numeric metric.`);
  }

  return Array.from(questions).slice(0, 4);
}

function buildQualityScore(missingRatio: number, duplicateRows: number, outlierRows: number, rowCount: number): number {
  let score = 100;
  score -= missingRatio * 50;
  score -= Math.min(15, (duplicateRows / Math.max(1, rowCount)) * 60);
  score -= Math.min(20, (outlierRows / Math.max(1, rowCount)) * 70);
  return Math.round(clamp(score, 35, 99));
}

export function buildDatasetProfile(dataset: Dataset): DatasetProfile {
  const metrics = dataset.metrics.length > 0 ? dataset.metrics : calculateColumnMetrics(dataset.headers, dataset.rows);
  const totalRows = dataset.rows.length;
  const totalColumns = dataset.headers.length;
  const missingCells = metrics.reduce((total, metric) => total + metric.missingCount, 0);
  const missingRatio = missingCells / Math.max(1, totalRows * Math.max(1, totalColumns));
  const duplicateRows = buildDuplicateCount(dataset.rows);
  const outlierRows = buildOutlierCount(dataset.rows, metrics);
  const completenessScore = Math.round(clamp((1 - missingRatio) * 100, 0, 100));
  const datasetQualityScore = buildQualityScore(missingRatio, duplicateRows, outlierRows, totalRows);
  const cleanerSuggestions = buildCleanerSuggestions(dataset, metrics, outlierRows);
  const marketKPIs = buildBusinessKpis(dataset, metrics);
  const analystInsights = buildInsights(dataset, metrics, marketKPIs, outlierRows, duplicateRows);
  const chartCards = buildChartCards(dataset, metrics);
  const topSignals = buildTopSignals(analystInsights, marketKPIs, metrics);
  const recommendedQuestions = buildRecommendedQuestions(dataset, metrics);

  const summary = [
    `${dataset.name} contains ${formatCompactNumber(totalRows)} rows across ${totalColumns} columns.`,
    `Data quality currently sits at ${datasetQualityScore}/100 with ${formatPercent(completenessScore, 1)} completeness.`,
    chartCards[0] ? `The most useful chart starts with ${chartCards[0].title}.` : "No dominant chart pattern was detected automatically.",
  ].join(" ");

  const agentThought = [
    `Data Cleaner reviewed ${cleanerSuggestions.length} actionable issue(s).`,
    `Data Analyst prioritized ${marketKPIs.length} KPI(s) and ${analystInsights.length} evidence-backed insight(s).`,
    chartCards.length > 0 ? `Dashboard Agent prepared ${chartCards.length} chart suggestion(s) for the executive overview.` : "Dashboard Agent did not find a strong chart pattern.",
  ].join(" ");

  return {
    datasetQualityScore,
    completenessScore,
    missingCells,
    missingRatio,
    outlierRows,
    totalRows,
    totalColumns,
    cleanerSuggestions,
    marketKPIs,
    analystInsights,
    chartCards,
    topSignals,
    recommendedQuestions,
    summary,
    agentThought,
  };
}

function scoreQuestionIntent(query: string): QuestionIntent {
  const normalized = normalizeKey(query);
  if (/top\d*|highest|largest|most|best|rank|showtop/.test(normalized)) return "ranking";
  if (/why|drop|decline|fall|decrease|down|change/.test(normalized)) return "trend";
  if (/churn|cancel|retention|inactive/.test(normalized)) return "churn";
  if (/count|howmany|numberof|totalrows/.test(normalized)) return "count";
  if (/distribution|split|share|breakdown|pie/.test(normalized)) return "distribution";
  return "general";
}

function formatRankingTable(rows: DatasetRow[], categoryField: string, valueField: string): string {
  const header = `| Rank | ${titleCase(categoryField)} | ${titleCase(valueField)} | Share |\n| --- | --- | ---: | ---: |`;
  const total = rows.reduce((sum, row) => sum + (getNumericValue(row, valueField) ?? 0), 0);
  const body = rows.map((row, index) => {
    const value = getNumericValue(row, valueField) ?? 0;
    const share = total > 0 ? (value / total) * 100 : 0;
    return `| ${index + 1} | ${String(row[categoryField])} | ${formatCompactNumber(value)} | ${formatPercent(share, 1)} |`;
  });

  return [header, ...body].join("\n");
}

function buildTrendAnswer(dataset: Dataset, metrics: ColumnMetric[], query: string): QuestionAnswer {
  const dateMetric = findDateMetric(metrics);
  const numericMetric = findMetricsByPattern(metrics, BUSINESS_TERMS.revenue).find((metric) => metric.type === "number") ?? findBestNumericMetric(metrics);
  let comparisonCandidates = metrics.filter(
    (metric) => metric.type === "number" &&
    metric.name !== numericMetric?.name &&
    !ID_PATTERNS.some((pattern) => normalizeKey(metric.name).includes(normalizeKey(pattern)))
  );
  if (comparisonCandidates.length === 0) {
    comparisonCandidates = metrics.filter((metric) => metric.type === "number" && metric.name !== numericMetric?.name);
  }
  const comparisonMetric = comparisonCandidates.length > 0 ? findBestNumericMetric(comparisonCandidates) : undefined;

  if (!dateMetric || !numericMetric) {
    return {
      answerMarkdown: `I could not infer a clean time series for **${query}**. Try choosing a date-like column and a numeric measure.`,
      evidence: ["No suitable date + numeric pair detected."],
    };
  }

  const ordered = dataset.rows
    .map((row) => ({
      row,
      date: getDateValue(row, dateMetric.name),
      primary: getNumericValue(row, numericMetric.name),
      secondary: comparisonMetric ? getNumericValue(row, comparisonMetric.name) : null,
    }))
    .filter((item): item is { row: DatasetRow; date: Date; primary: number; secondary: number | null } => Boolean(item.date) && item.primary !== null)
    .sort((left, right) => left.date.getTime() - right.date.getTime());

  // Aggregate by month for trend answer
  const monthlyValues = new Map<string, { primary: number, secondary: number }>();
  ordered.forEach(item => {
    const monthKey = item.date.toISOString().slice(0, 7);
    const existing = monthlyValues.get(monthKey) ?? { primary: 0, secondary: 0 };
    monthlyValues.set(monthKey, {
      primary: existing.primary + item.primary,
      secondary: existing.secondary + (item.secondary ?? 0)
    });
  });

  const months = Array.from(monthlyValues.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  if (months.length < 2) {
    return {
      answerMarkdown: `I found only one usable period for **${numericMetric.name}**. Share a longer history to diagnose the drop or trend.`,
      evidence: ["Only one monthly observation was available."],
    };
  }

  const previous = months[months.length - 2];
  const current = months[months.length - 1];
  const delta = current[1].primary - previous[1].primary;
  const percentDelta = Math.abs(previous[1].primary) > 0 ? (delta / Math.abs(previous[1].primary)) * 100 : 0;

  const comparisonLines: string[] = [];
  if (comparisonMetric) {
    const secondaryDelta = current[1].secondary - previous[1].secondary;
    comparisonLines.push(`- ${titleCase(comparisonMetric.name)} changed by ${secondaryDelta >= 0 ? "+" : ""}${formatCompactNumber(secondaryDelta)} over the same interval.`);
  }

  const answerMarkdown = [
    `### ${titleCase(numericMetric.name)} changed from ${formatCompactNumber(previous[1].primary)} to ${formatCompactNumber(current[1].primary)}.`,
    `The latest interval (${current[0]}) moved by ${delta >= 0 ? "+" : ""}${formatCompactNumber(delta)} (${delta >= 0 ? "+" : ""}${formatPercent(percentDelta, 1)}).`,
    comparisonLines.length > 0 ? `### Related movement\n${comparisonLines.join("\n")}` : "",
    `### Evidence\n- Observed comparing ${previous[0]} and ${current[0]}.`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    answerMarkdown,
    chartSuggestion: {
      type: "line",
      title: `${titleCase(numericMetric.name)} trend`,
      xAxisKey: "month",
      yAxisKey: numericMetric.name,
      data: months.slice(-12).map((item) => ({
        month: item[0],
        [numericMetric.name]: item[1].primary,
      })),
    },
    evidence: [
      `Previous period (${previous[0]}): ${formatCompactNumber(previous[1].primary)}`,
      `Current period (${current[0]}): ${formatCompactNumber(current[1].primary)}`,
    ],
  };
}

function buildRankingAnswer(dataset: Dataset, metrics: ColumnMetric[], query: string): QuestionAnswer {
  const entityMetric = findBestEntityMetric(metrics, dataset.rows);
  const numericMetric = findMetricsByPattern(metrics, BUSINESS_TERMS.revenue).find((metric) => metric.type === "number") ?? findBestNumericMetric(metrics);

  if (!entityMetric || !numericMetric) {
    return {
      answerMarkdown: `I could not identify a clean ranking pair in **${query}**.`,
      evidence: ["No ranking-ready category + metric pair detected."],
    };
  }

  const ranking = aggregateByCategory(dataset.rows, entityMetric.name, numericMetric.name, 10);
  if (ranking.length === 0) {
    return {
      answerMarkdown: `There are no usable values for **${entityMetric.name}** and **${numericMetric.name}**.`,
      evidence: ["Aggregation returned no rows."],
    };
  }

  const answerMarkdown = [
    `### Top ${Math.min(10, ranking.length)} ${titleCase(entityMetric.name)} by ${titleCase(numericMetric.name)}`,
    formatRankingTable(ranking, entityMetric.name, numericMetric.name),
  ].join("\n\n");

  return {
    answerMarkdown,
    chartSuggestion: {
      type: "bar",
      title: `Top ${titleCase(entityMetric.name)} by ${titleCase(numericMetric.name)}`,
      xAxisKey: entityMetric.name,
      yAxisKey: numericMetric.name,
      data: ranking,
    },
    evidence: ranking.slice(0, 3).map((row) => `${String(row[entityMetric.name])}: ${formatCompactNumber(row[numericMetric.name] ?? 0)}`),
  };
}

function buildChurnAnswer(dataset: Dataset, metrics: ColumnMetric[]): QuestionAnswer {
  const churnMetric = findChurnMetric(metrics);
  const segmentMetric = findBestEntityMetric(metrics, dataset.rows);

  if (!churnMetric) {
    return {
      answerMarkdown: "I could not find a churn-style field in this workbook.",
      evidence: ["No churn column detected."],
    };
  }

  const churnedRows = dataset.rows.filter((row) => {
    const value = row[churnMetric.name];
    if (typeof value === "boolean") return value;
    const text = String(value).trim().toLowerCase();
    return ["yes", "true", "1", "churned", "inactive"].includes(text);
  });
  const churnRate = churnedRows.length / Math.max(1, dataset.rows.length);
  const label = segmentMetric ? titleCase(segmentMetric.name) : "records";

  const answerMarkdown = [
    `### Churn profile`,
    `**${formatPercent(churnRate * 100, 1)}** of rows are marked as churned or inactive.`,
    segmentMetric
      ? `The best segment field for drilling into retention is **${titleCase(segmentMetric.name)}**.`
      : `No strong segment field was detected for deeper churn breakdowns.`,
  ].join("\n\n");

  return {
    answerMarkdown,
    chartSuggestion: {
      type: "pie",
      title: `${titleCase(churnMetric.name)} distribution`,
      xAxisKey: "label",
      yAxisKey: "value",
      data: [
        { label: "Churned", value: churnedRows.length },
        { label: "Active", value: dataset.rows.length - churnedRows.length },
      ],
    },
    evidence: [`Churned ${label}: ${churnedRows.length}`, `Active ${label}: ${dataset.rows.length - churnedRows.length}`],
  };
}

function buildGeneralAnswer(dataset: Dataset, profile: DatasetProfile): QuestionAnswer {
  const strongestChart = profile.chartCards[0];
  const answerMarkdown = [
    `### Data snapshot for ${dataset.name}`,
    profile.summary,
    `### Key signals\n${profile.topSignals.map((signal) => `- ${signal}`).join("\n")}`,
  ].join("\n\n");

  return {
    answerMarkdown,
    chartSuggestion: strongestChart
      ? {
          type: strongestChart.type,
          title: strongestChart.title,
          xAxisKey: strongestChart.xAxisKey,
          yAxisKey: strongestChart.yAxisKey,
          data: strongestChart.data,
        }
      : undefined,
    evidence: profile.topSignals.slice(0, 3),
  };
}

export function buildQuestionAnswer(dataset: Dataset, profile: DatasetProfile, query: string): QuestionAnswer {
  const intent = scoreQuestionIntent(query);

  switch (intent) {
    case "ranking":
      return buildRankingAnswer(dataset, dataset.metrics, query);
    case "trend":
      return buildTrendAnswer(dataset, dataset.metrics, query);
    case "churn":
      return buildChurnAnswer(dataset, dataset.metrics);
    case "count":
      return {
        answerMarkdown: [
          `### Count summary`,
          `There are **${formatCompactNumber(dataset.rows.length)}** rows across **${formatCompactNumber(dataset.headers.length)}** columns.`,
          `Quality score: **${profile.datasetQualityScore}/100** with **${formatPercent(profile.completenessScore, 1)}** completeness.`,
        ].join("\n\n"),
        evidence: [
          `Rows: ${dataset.rows.length}`,
          `Columns: ${dataset.headers.length}`,
        ],
      };
    case "distribution":
      return profile.chartCards[0]
        ? {
            answerMarkdown: [
              `### Distribution overview`,
              `The most useful distribution chart is **${profile.chartCards[0].title}**.`,
              `It highlights the current spread and concentration pattern in the data.`,
            ].join("\n\n"),
            chartSuggestion: {
              type: profile.chartCards[0].type,
              title: profile.chartCards[0].title,
              xAxisKey: profile.chartCards[0].xAxisKey,
              yAxisKey: profile.chartCards[0].yAxisKey,
              data: profile.chartCards[0].data,
            },
            evidence: profile.topSignals.slice(0, 3),
          }
        : buildGeneralAnswer(dataset, profile);
    default:
      return buildGeneralAnswer(dataset, profile);
  }
}

function buildForecastLabels(labels: string[], horizon: number): string[] {
  if (labels.length === 0) {
    return Array.from({ length: horizon }, (_, index) => `Forecast ${index + 1}`);
  }

  const lastLabel = labels[labels.length - 1];
  const monthMatch = lastLabel.match(/^(\d{4})-(\d{2})$/);
  if (monthMatch) {
    let year = Number(monthMatch[1]);
    let month = Number(monthMatch[2]);
    return Array.from({ length: horizon }, () => {
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
      return `${year}-${String(month).padStart(2, "0")}`;
    });
  }

  const dateLabels = labels.map((label) => Date.parse(label)).filter((value) => !Number.isNaN(value));
  if (dateLabels.length === labels.length && labels.length > 0) {
    const sorted = [...dateLabels].sort((left, right) => left - right);
    const gap = sorted.length > 1 ? sorted[sorted.length - 1] - sorted[sorted.length - 2] : 30 * 24 * 60 * 60 * 1000;
    const lastDate = new Date(sorted[sorted.length - 1]);
    return Array.from({ length: horizon }, (_, index) => {
      const next = new Date(lastDate.getTime() + gap * (index + 1));
      return next.toISOString().slice(0, 10);
    });
  }

  return Array.from({ length: horizon }, (_, index) => `Step +${index + 1}`);
}

function buildForecastSummary(values: number[], predicted: number[], targetField: string, r2: number): string {
  const start = values[0];
  const end = values[values.length - 1];
  const direction = end >= start ? "rising" : "declining";
  const forecastDirection = predicted[predicted.length - 1] >= predicted[0] ? "upward" : "downward";
  return [
    `The historical series for ${titleCase(targetField)} is ${direction} and the simple local regression projects a ${forecastDirection} path over the next periods.`,
    `Model fit is moderate with an estimated ${formatPercent(clamp(r2 * 100, 0, 100), 1)} explained variance.`,
    `Use this as a directional planning signal, not as a substitute for a dedicated forecasting pipeline.`,
  ].join(" ");
}

export function buildForecast(dataset: Dataset, labelField: string, targetField: string, horizon: number): ForecastResult {
  // Parse all dates to determine the temporal span and appropriate aggregation granularity
  const validDates = dataset.rows
    .map((row) => getDateValue(row, labelField))
    .filter((d): d is Date => d !== null && !Number.isNaN(d.getTime()));

  let diffMonths = 0;
  if (validDates.length > 0) {
    const minTime = Math.min(...validDates.map((d) => d.getTime()));
    const maxTime = Math.max(...validDates.map((d) => d.getTime()));
    const minDate = new Date(minTime);
    const maxDate = new Date(maxTime);
    diffMonths = (maxDate.getFullYear() - minDate.getFullYear()) * 12 + (maxDate.getMonth() - minDate.getMonth());
  }

  // Aggregate transactional rows by grouping keys (monthly or daily)
  const grouped = new Map<string, { sum: number; date: Date | null }>();

  dataset.rows.forEach((row) => {
    const val = getNumericValue(row, targetField);
    if (val === null) return;

    const date = getDateValue(row, labelField);
    let key = "";
    if (date && !Number.isNaN(date.getTime())) {
      // If the dataset covers at least 5 months, group by month (YYYY-MM). Otherwise group by day (YYYY-MM-DD).
      key = diffMonths >= 5
        ? date.toISOString().slice(0, 7)
        : date.toISOString().slice(0, 10);
    } else {
      key = String(row[labelField] ?? "");
    }

    if (!key) return;

    const existing = grouped.get(key) ?? { sum: 0, date };
    grouped.set(key, {
      sum: existing.sum + val,
      date: existing.date || date,
    });
  });

  const points = Array.from(grouped.entries())
    .map(([key, item]) => ({
      label: key,
      value: item.sum,
      date: item.date,
    }))
    .sort((left, right) => {
      if (left.date && right.date) {
        return left.date.getTime() - right.date.getTime();
      }
      return left.label.localeCompare(right.label);
    });

  const historical = points.map((point) => ({ label: point.label, value: Number(point.value!.toFixed(2)) }));
  if (historical.length < 2) {
    return {
      historical,
      predicted: [],
      horizon,
      confidence: 35,
      method: "Linear Regression",
      modelConfidence: 35,
      metricUsed: targetField,
      insights: `There are not enough ordered points to forecast ${targetField}.`,
    };
  }

  const values = points.map((point) => point.value ?? 0);
  const indices = values.map((_, index) => index);
  const count = values.length;
  const sumX = indices.reduce((total, value) => total + value, 0);
  const sumY = values.reduce((total, value) => total + value, 0);
  const sumXY = indices.reduce((total, value, index) => total + value * values[index], 0);
  const sumXX = indices.reduce((total, value) => total + value * value, 0);
  const denominator = count * sumXX - sumX * sumX;
  const slope = denominator === 0 ? 0 : (count * sumXY - sumX * sumY) / denominator;
  const intercept = count === 0 ? 0 : (sumY - slope * sumX) / count;

  const fitted = indices.map((index) => slope * index + intercept);
  const residuals = values.map((value, index) => value - fitted[index]);
  const residualVariance = residuals.reduce((total, value) => total + value * value, 0) / Math.max(1, count - 2);
  const residualStdDev = Math.sqrt(Math.max(0, residualVariance));
  const meanY = sumY / count;
  const totalVariance = values.reduce((total, value) => total + Math.pow(value - meanY, 2), 0);
  const residualSum = residuals.reduce((total, value) => total + value * value, 0);
  const r2 = totalVariance === 0 ? 0 : clamp(1 - residualSum / totalVariance, 0, 1);

  const predictedValues = Array.from({ length: horizon }, (_, index) => {
    const nextIndex = count + index;
    const predicted = slope * nextIndex + intercept;
    const margin = Math.max(Math.abs(predicted) * 0.1, residualStdDev * 1.64);
    return {
      label: `Step +${index + 1}`,
      value: Number(predicted.toFixed(2)),
      upper: Number((predicted + margin).toFixed(2)),
      lower: Number((predicted - margin).toFixed(2)),
    };
  });

  const labels = buildForecastLabels(points.map((point) => point.label), horizon);
  const forecast = predictedValues.map((point, index) => ({ ...point, label: labels[index] }));
  const confidence = Math.round(clamp(55 + r2 * 35 + Math.min(8, count / 3), 45, 96));

  const forecastSummary = buildForecastSummary(values, forecast.map((point) => point.value), targetField, r2);
  const prescriptiveActions = [
    `Monitor ${titleCase(targetField)} against the confidence band before committing budget or inventory changes.`,
    `Validate the forecast with a second model if the series is volatile or seasonal.`,
    `Use the next ${horizon} periods as a planning window, not a hard guarantee.`,
  ];

  return {
    historical,
    predicted: forecast,
    horizon,
    confidence,
    method: "Linear Regression",
    modelConfidence: Math.round(clamp(r2 * 100, 0, 100)),
    metricUsed: targetField,
    insights: `${forecastSummary}\n\n${prescriptiveActions.map((action) => `- ${action}`).join("\n")}`,
  };
}

function summariseKeyFindings(profile: DatasetProfile, forecast?: ForecastResult | null): ExecutiveReport["keyFindings"] {
  const findings: ExecutiveReport["keyFindings"] = [];

  profile.analystInsights.slice(0, 3).forEach((insight, index) => {
    findings.push({
      title: insight.title,
      description: insight.description,
      metric: profile.marketKPIs[index]?.value,
      impact: insight.type === "positive" || insight.type === "trend" ? "positive" : insight.type === "anomaly" || insight.type === "negative" ? "negative" : "neutral",
      evidenceList: insight.evidenceList || [insight.evidence || "Derived from standard column metrics."],
      assumptions: insight.assumptions || "None",
      confidence: "High",
    });
  });

  if (forecast) {
    const finalPrediction = forecast.predicted[forecast.predicted.length - 1];
    findings.push({
      title: "Forecast Direction",
      description: `The local model projects ${titleCase(forecast.metricUsed)} toward ${formatCompactNumber(finalPrediction.value)} by the end of the horizon.`,
      metric: `${formatCompactNumber(finalPrediction.lower)} - ${formatCompactNumber(finalPrediction.upper)}`,
      impact: finalPrediction.value >= (forecast.historical[0]?.value || 0) ? "positive" : "negative",
      evidenceList: [
        `Method: ${forecast.method}`,
        `Model Confidence: ${forecast.modelConfidence}%`,
        `Prediction: ${formatCompactNumber(finalPrediction.value)}`,
        `Band: ${formatCompactNumber(finalPrediction.lower)} - ${formatCompactNumber(finalPrediction.upper)}`
      ],
      assumptions: "Future trends strictly follow historical linear patterns.",
      confidence: forecast.modelConfidence > 75 ? "High" : forecast.modelConfidence > 50 ? "Medium" : "Low",
    });
  }

  return findings.slice(0, 4);
}

export function buildExecutiveReport(dataset: Dataset, profile: DatasetProfile, forecast?: ForecastResult | null): ExecutiveReport {
  const chart = profile.chartCards[0];
  const kpis = profile.marketKPIs.slice(0, 3);
  const recommendations = [
    ...profile.cleanerSuggestions.slice(0, 2).map((suggestion) => `${suggestion.column}: ${suggestion.description}`),
    `Use ${profile.recommendedQuestions[0] ?? "the suggested business questions"} to brief stakeholders interactively.`,
    forecast ? `Review the forecast before changing any budget, inventory, or hiring plan.` : "Add a longer time series if you want a stronger predictive signal.",
  ];

  const slideDeck: ExecutiveReport["slideDeck"] = [
    {
      id: 1,
      title: `${dataset.name} Executive Brief`,
      subtitle: profile.summary,
      layout: "title",
    },
    {
      id: 2,
      title: "Core Metrics",
      layout: "metrics",
      metrics: kpis.map((kpi) => ({
        label: kpi.label,
        value: kpi.value,
        sub: kpi.businessValue,
      })),
    },
    {
      id: 3,
      title: chart?.title ?? "Primary trend view",
      layout: "chart",
      chartConfig: chart
        ? {
            type: chart.type,
            title: chart.title,
            xAxis: chart.xAxisKey,
            yAxis: chart.yAxisKey,
          }
        : undefined,
    },
    {
      id: 4,
      title: "Key Insights",
      layout: "bullets",
      bullets: profile.analystInsights.map((insight) => insight.description),
    },
    {
      id: 5,
      title: "Recommended Actions",
      layout: "bullets",
      bullets: recommendations,
    },
  ];

  return {
    title: `${dataset.name} Executive Brief`,
    date: new Date().toLocaleDateString(),
    executiveSummary: [
      profile.summary,
      forecast ? `The forecast engine detected a ${forecast.confidence}% confidence signal for ${titleCase(forecast.metricUsed)}.` : "No forecast has been generated yet, so the report focuses on profiling and operational insight.",
    ].join(" "),
    keyFindings: summariseKeyFindings(profile, forecast),
    recommendations,
    slideDeck,
  };
}

export function applyDatasetAction(dataset: Dataset, actionKey: string, columnName: string): { dataset: Dataset; message: string } {
  const headers = dataset.headers;
  const rows = dataset.rows.map((row) => ({ ...row }));
  const targetMetric = dataset.metrics.find((metric) => metric.name === columnName);
  let updatedRows = rows;
  let message = "";

  if (actionKey === "fill_median" && targetMetric) {
    const values = rows.map((row) => getNumericValue(row, targetMetric.name)).filter((value): value is number => value !== null);
    const stats = calculateNumericStats(values);
    const fallback = stats?.median ?? stats?.mean ?? 0;
    updatedRows = rows.map((row) => {
      if (isMissing(row[targetMetric.name])) {
        return { ...row, [targetMetric.name]: fallback };
      }
      return row;
    });
    message = `Filled missing values in ${targetMetric.name} with ${formatNumber(fallback, 2)}.`;
  }

  if (actionKey === "drop_null") {
    if (columnName === "*") {
      updatedRows = rows.filter((row) => headers.every((header) => !isMissing(row[header])));
      message = `Removed rows containing any missing values across the workbook.`;
    } else {
      updatedRows = rows.filter((row) => !isMissing(row[columnName]));
      message = `Removed rows where ${columnName} was empty.`;
    }
  }

  if (actionKey === "remove_outliers") {
    const numberMetrics = dataset.metrics.filter((metric) => metric.type === "number");
    const statsByMetric = new Map<string, NumericStats>();

    numberMetrics.forEach((metric) => {
      const values = rows.map((row) => getNumericValue(row, metric.name)).filter((value): value is number => value !== null);
      const stats = calculateNumericStats(values);
      if (stats) {
        statsByMetric.set(metric.name, stats);
      }
    });

    updatedRows = rows.filter((row) => {
      const rowHasOutlier = numberMetrics.some((metric) => {
        const value = getNumericValue(row, metric.name);
        const stats = statsByMetric.get(metric.name);
        if (value === null || !stats || stats.stdDev === 0) {
          return false;
        }
        const zScore = Math.abs((value - stats.mean) / stats.stdDev);
        const outsideIqr = value < stats.q1 - 1.5 * stats.iqr || value > stats.q3 + 1.5 * stats.iqr;
        return zScore > 3 || outsideIqr;
      });
      return !rowHasOutlier;
    });

    message = `Removed rows with extreme outlier values across numeric columns.`;
  }

  if (actionKey === "drop_duplicates") {
    const signatures = new Set<string>();
    updatedRows = rows.filter((row) => {
      const signature = JSON.stringify(row, Object.keys(row).sort());
      if (signatures.has(signature)) return false;
      signatures.add(signature);
      return true;
    });
    const diff = rows.length - updatedRows.length;
    message = `Removed ${diff} duplicate row(s) from the workbook.`;
  }

  if (actionKey === "drop_column") {
    const nextHeaders = headers.filter((h) => h !== columnName);
    updatedRows = rows.map((row) => {
      const nextRow = { ...row };
      delete nextRow[columnName];
      return nextRow;
    });
    message = `Dropped column '${columnName}' from the workbook.`;
    return {
      dataset: {
        ...dataset,
        headers: nextHeaders,
        rows: updatedRows,
        metrics: calculateColumnMetrics(nextHeaders, updatedRows),
      },
      message,
    };
  }

  if (!message) {
    message = `No changes were applied for ${actionKey}.`;
  }

  return {
    dataset: rebuildDataset(dataset, updatedRows),
    message,
  };
}
