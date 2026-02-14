import { useEffect, useState, useRef, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LineChart,
  Line,
  ResponsiveContainer,
} from 'recharts';
import { api, RunDetail } from '../api/client';
import { useTheme } from '../context/ThemeContext';
import Layout from '../components/Layout';
import { ErrorState } from '../components/ErrorBoundary';
import { parseError } from '../utils/errorMessages';

function formatValue(value: number, unit?: string | null): string {
  if (unit === null || unit === undefined) {
    if (value >= 0 && value <= 1) {
      return `${(value * 100).toFixed(1)}%`;
    }
  }
  if (Number.isInteger(value)) {
    return value.toString();
  }
  return value.toFixed(3);
}

function formatMetricName(name: string): string {
  return name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function truncateModel(model: string, maxLen: number = 24): string {
  if (model.length <= maxLen) return model;
  return model.slice(0, maxLen - 2) + '…';
}

// Generate distinct colors for runs
const RUN_COLORS = [
  '#c9a227',   // gold
  '#8b9dc3',   // light blue-gray
  '#b4a7d6',   // lavender
  '#e07c7c',   // coral
  '#7cb07c',   // sage green
  '#7cc9c9',   // teal
];

function getRunColor(index: number): string {
  return RUN_COLORS[index % RUN_COLORS.length];
}

interface CompareMetric {
  name: string;
  values: (number | null)[];
}

interface CompareBreakdownItem {
  key: string;
  values: (number | null)[];
}

interface CompareBreakdown {
  name: string;
  items: CompareBreakdownItem[];
}

interface MetricStats {
  name: string;
  best: { value: number; runIndex: number } | null;
  worst: { value: number; runIndex: number } | null;
  avg: number | null;
}

// Chart export utility
async function exportChartAsPng(element: HTMLElement, filename: string) {
  try {
    const { toPng } = await import('html-to-image');
    const dataUrl = await toPng(element, {
      backgroundColor: 'transparent',
      pixelRatio: 2,
    });
    const link = document.createElement('a');
    link.download = `${filename}.png`;
    link.href = dataUrl;
    link.click();
  } catch (err) {
    console.error('Failed to export chart:', err);
  }
}

// Export button component
function ExportButton({ chartRef, filename }: { chartRef: React.RefObject<HTMLDivElement | null>; filename: string }) {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (!chartRef.current) return;
    setExporting(true);
    await exportChartAsPng(chartRef.current, filename);
    setExporting(false);
  };

  return (
    <button
      onClick={handleExport}
      disabled={exporting}
      className="text-[11px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 min-h-[44px] px-2 flex items-center"
      title="Export as PNG"
    >
      {exporting ? 'Exporting…' : '↓ PNG'}
    </button>
  );
}

// Summary statistics component
function SummaryStats({ metrics, runs }: { metrics: CompareMetric[]; runs: RunDetail[] }) {
  const { resolvedTheme } = useTheme();
  void runs; // Used for run count context
  
  const stats: MetricStats[] = metrics.map((metric) => {
    const validValues = metric.values
      .map((v, i) => ({ value: v, index: i }))
      .filter((item): item is { value: number; index: number } => item.value !== null);

    if (validValues.length === 0) {
      return { name: metric.name, best: null, worst: null, avg: null };
    }

    const sorted = [...validValues].sort((a, b) => b.value - a.value);
    const sum = validValues.reduce((acc, v) => acc + v.value, 0);

    return {
      name: metric.name,
      best: { value: sorted[0].value, runIndex: sorted[0].index },
      worst: sorted.length > 1 ? { value: sorted[sorted.length - 1].value, runIndex: sorted[sorted.length - 1].index } : null,
      avg: sum / validValues.length,
    };
  });

  const bgColor = resolvedTheme === 'dark' ? 'bg-background-secondary' : 'bg-background-secondary';

  return (
    <div className={`${bgColor} border border-border p-4 sm:p-5`}>
      <p className="text-[11px] text-muted-foreground uppercase tracking-[0.1em] mb-4">
        Summary Statistics
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {stats.map((stat) => (
          <div key={stat.name} className="border border-border p-3 sm:p-4">
            <p className="text-[13px] text-muted mb-3">{formatMetricName(stat.name)}</p>
            <div className="space-y-2">
              {stat.best && (
                <div className="flex justify-between items-center">
                  <span className="text-[12px] text-muted-foreground">Best</span>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-sm"
                      style={{ backgroundColor: getRunColor(stat.best.runIndex) }}
                    />
                    <span className="text-[14px] text-foreground font-medium tabular-nums">
                      {formatValue(stat.best.value)}
                    </span>
                  </div>
                </div>
              )}
              {stat.worst && (
                <div className="flex justify-between items-center">
                  <span className="text-[12px] text-muted-foreground">Worst</span>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-sm"
                      style={{ backgroundColor: getRunColor(stat.worst.runIndex) }}
                    />
                    <span className="text-[14px] text-muted tabular-nums">
                      {formatValue(stat.worst.value)}
                    </span>
                  </div>
                </div>
              )}
              {stat.avg !== null && (
                <div className="flex justify-between items-center">
                  <span className="text-[12px] text-muted-foreground">Average</span>
                  <span className="text-[14px] text-foreground-secondary tabular-nums">
                    {formatValue(stat.avg)}
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Radar chart for overall metrics
function MetricsRadarChart({ metrics, runs }: { metrics: CompareMetric[]; runs: RunDetail[] }) {
  const { resolvedTheme } = useTheme();
  const chartRef = useRef<HTMLDivElement>(null);

  // Normalize values to 0-100 scale for radar chart
  const radarData = metrics.map((metric) => {
    const maxVal = Math.max(...metric.values.filter((v): v is number => v !== null), 0.001);
    const dataPoint: Record<string, string | number> = {
      metric: formatMetricName(metric.name),
    };
    runs.forEach((run, index) => {
      const value = metric.values[index];
      dataPoint[run.run_id] = value !== null ? (value / maxVal) * 100 : 0;
      dataPoint[`${run.run_id}_raw`] = value !== null ? value : 0;
    });
    return dataPoint;
  });

  if (metrics.length < 3) return null; // Need at least 3 metrics for radar

  const gridColor = resolvedTheme === 'dark' ? '#333' : '#ddd';
  const textColor = resolvedTheme === 'dark' ? '#888' : '#666';
  const tooltipBg = resolvedTheme === 'dark' ? '#1a1a1a' : '#fff';
  const tooltipBorder = resolvedTheme === 'dark' ? '#333' : '#ddd';

  return (
    <div className="mb-8 sm:mb-12">
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <p className="text-[11px] text-muted-foreground uppercase tracking-[0.1em]">
          Metrics Overview (Radar)
        </p>
        <ExportButton chartRef={chartRef} filename="metrics-radar" />
      </div>
      <div ref={chartRef} className="bg-background-secondary border border-border p-4 sm:p-6">
        <ResponsiveContainer width="100%" height={300} className="sm:!h-[400px]">
          <RadarChart data={radarData}>
            <PolarGrid stroke={gridColor} />
            <PolarAngleAxis
              dataKey="metric"
              tick={{ fill: textColor, fontSize: 10 }}
              className="sm:[&_text]:text-[11px]"
            />
            <PolarRadiusAxis
              angle={30}
              domain={[0, 100]}
              tick={{ fill: textColor, fontSize: 10 }}
              tickFormatter={() => ''}
            />
            {runs.map((run, index) => (
              <Radar
                key={run.run_id}
                name={truncateModel(run.model, 16)}
                dataKey={run.run_id}
                stroke={getRunColor(index)}
                fill={getRunColor(index)}
                fillOpacity={0.15}
                strokeWidth={2}
              />
            ))}
            <Tooltip
              contentStyle={{
                backgroundColor: tooltipBg,
                border: `1px solid ${tooltipBorder}`,
                borderRadius: 0,
                fontSize: 12,
              }}
              formatter={(_value, name, props) => {
                const rawKey = `${props.dataKey}_raw`;
                const rawValue = props.payload[rawKey];
                return [formatValue(rawValue as number), name];
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: 11, paddingTop: 16 }}
              iconType="square"
              iconSize={10}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// Grouped bar chart for breakdowns
function BreakdownBarChart({ breakdown, runs }: { breakdown: CompareBreakdown; runs: RunDetail[] }) {
  const { resolvedTheme } = useTheme();
  const chartRef = useRef<HTMLDivElement>(null);

  const barData = breakdown.items.map((item) => {
    const dataPoint: Record<string, string | number> = {
      category: formatMetricName(item.key),
    };
    runs.forEach((run, index) => {
      dataPoint[run.run_id] = item.values[index] ?? 0;
    });
    return dataPoint;
  });

  const gridColor = resolvedTheme === 'dark' ? '#333' : '#ddd';
  const textColor = resolvedTheme === 'dark' ? '#888' : '#666';
  const tooltipBg = resolvedTheme === 'dark' ? '#1a1a1a' : '#fff';
  const tooltipBorder = resolvedTheme === 'dark' ? '#333' : '#ddd';

  return (
    <div className="mb-6 sm:mb-8">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[12px] sm:text-[13px] text-muted-foreground uppercase tracking-[0.1em]">
          {formatMetricName(breakdown.name)}
        </p>
        <ExportButton chartRef={chartRef} filename={`breakdown-${breakdown.name}`} />
      </div>
      <div ref={chartRef} className="bg-background-secondary border border-border p-4 sm:p-6 overflow-x-auto">
        <div className="min-w-[400px]">
          <ResponsiveContainer width="100%" height={Math.max(200, breakdown.items.length * 40)}>
            <BarChart
              data={barData}
              layout="vertical"
              margin={{ top: 5, right: 30, left: 60, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
              <XAxis
                type="number"
                tick={{ fill: textColor, fontSize: 11 }}
                tickFormatter={(v) => formatValue(v)}
                domain={[0, 'auto']}
              />
              <YAxis
                type="category"
                dataKey="category"
                tick={{ fill: textColor, fontSize: 10 }}
                width={55}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: tooltipBg,
                  border: `1px solid ${tooltipBorder}`,
                  borderRadius: 0,
                  fontSize: 12,
                }}
                formatter={(value) => formatValue(value as number)}
              />
              {runs.map((run, index) => (
                <Bar
                  key={run.run_id}
                  dataKey={run.run_id}
                  name={truncateModel(run.model, 16)}
                  fill={getRunColor(index)}
                  radius={[0, 2, 2, 0]}
                />
              ))}
              <Legend
                wrapperStyle={{ fontSize: 11 }}
                iconType="square"
                iconSize={10}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// Line chart for temporal data (if runs have created_at progression)
function TemporalLineChart({ metrics, runs }: { metrics: CompareMetric[]; runs: RunDetail[] }) {
  const { resolvedTheme } = useTheme();
  const chartRef = useRef<HTMLDivElement>(null);

  // Check if runs have temporal progression (sorted by date)
  const sortedRuns = [...runs].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  // Only show if there's time variance (more than 1 hour between first and last)
  const timeDiff = new Date(sortedRuns[sortedRuns.length - 1].created_at).getTime() -
                   new Date(sortedRuns[0].created_at).getTime();
  
  if (timeDiff < 3600000 || runs.length < 2) return null; // Less than 1 hour or not enough runs

  // Use primary metric for line chart
  const primaryMetric = metrics.find((m) => 
    runs.some((r) => r.summary?.primary_metric?.name === m.name)
  );

  if (!primaryMetric) return null;

  const lineData = sortedRuns.map((run) => {
    const originalIndex = runs.findIndex((r) => r.run_id === run.run_id);
    return {
      date: new Date(run.created_at).toLocaleDateString(),
      model: truncateModel(run.model, 16),
      value: primaryMetric.values[originalIndex] ?? 0,
      color: getRunColor(originalIndex),
      runId: run.run_id,
    };
  });

  const gridColor = resolvedTheme === 'dark' ? '#333' : '#ddd';
  const textColor = resolvedTheme === 'dark' ? '#888' : '#666';
  const tooltipBg = resolvedTheme === 'dark' ? '#1a1a1a' : '#fff';
  const tooltipBorder = resolvedTheme === 'dark' ? '#333' : '#ddd';

  return (
    <div className="mb-8 sm:mb-12">
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <p className="text-[11px] text-muted-foreground uppercase tracking-[0.1em]">
          {formatMetricName(primaryMetric.name)} Over Time
        </p>
        <ExportButton chartRef={chartRef} filename="temporal-chart" />
      </div>
      <div ref={chartRef} className="bg-background-secondary border border-border p-4 sm:p-6 overflow-x-auto">
        <div className="min-w-[400px]">
          <ResponsiveContainer width="100%" height={250} className="sm:!h-[300px]">
            <LineChart data={lineData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
              <XAxis
                dataKey="date"
                tick={{ fill: textColor, fontSize: 10 }}
              />
              <YAxis
                tick={{ fill: textColor, fontSize: 11 }}
                tickFormatter={(v) => formatValue(v)}
                domain={['auto', 'auto']}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: tooltipBg,
                  border: `1px solid ${tooltipBorder}`,
                  borderRadius: 0,
                  fontSize: 12,
                }}
                formatter={(value, _name, props) => [
                  formatValue(value as number),
                  props.payload.model
                ]}
                labelFormatter={(label) => `Date: ${label}`}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke={getRunColor(0)}
                strokeWidth={2}
                dot={(props) => {
                  const { cx, cy, payload } = props;
                  const runIndex = runs.findIndex((r) => r.run_id === payload.runId);
                  return (
                    <circle
                      key={payload.runId}
                      cx={cx}
                      cy={cy}
                      r={6}
                      fill={getRunColor(runIndex)}
                      stroke="none"
                    />
                  );
                }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-wrap gap-3 mt-4 justify-center">
          {sortedRuns.map((run) => {
            const originalIndex = runs.findIndex((r) => r.run_id === run.run_id);
            return (
              <div key={run.run_id} className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: getRunColor(originalIndex) }}
                />
                <span className="text-[11px] text-muted">{truncateModel(run.model, 14)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Primary metric bar chart (enhanced)
function PrimaryMetricChart({ runs, metrics }: { runs: RunDetail[]; metrics: CompareMetric[] }) {
  const { resolvedTheme } = useTheme();
  const chartRef = useRef<HTMLDivElement>(null);

  // Find primary metric
  const primaryMetric = metrics.find((m) =>
    runs.some((r) => r.summary?.primary_metric?.name === m.name)
  );

  if (!primaryMetric) return null;

  const barData = runs.map((run, index) => ({
    model: truncateModel(run.model, 16),
    value: primaryMetric.values[index] ?? 0,
    fill: getRunColor(index),
    runId: run.run_id,
  }));

  const gridColor = resolvedTheme === 'dark' ? '#333' : '#ddd';
  const textColor = resolvedTheme === 'dark' ? '#888' : '#666';
  const tooltipBg = resolvedTheme === 'dark' ? '#1a1a1a' : '#fff';
  const tooltipBorder = resolvedTheme === 'dark' ? '#333' : '#ddd';

  return (
    <div className="mb-8 sm:mb-12">
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <p className="text-[11px] text-muted-foreground uppercase tracking-[0.1em]">
          {formatMetricName(primaryMetric.name)}
        </p>
        <ExportButton chartRef={chartRef} filename="primary-metric" />
      </div>
      <div ref={chartRef} className="bg-background-secondary border border-border p-4 sm:p-6 overflow-x-auto">
        <div className="min-w-[300px]">
          <ResponsiveContainer width="100%" height={Math.max(150, runs.length * 50)}>
            <BarChart
              data={barData}
              layout="vertical"
              margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
              <XAxis
                type="number"
                tick={{ fill: textColor, fontSize: 11 }}
                tickFormatter={(v) => formatValue(v)}
                domain={[0, 'auto']}
              />
              <YAxis
                type="category"
                dataKey="model"
                tick={{ fill: textColor, fontSize: 11 }}
                width={75}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: tooltipBg,
                  border: `1px solid ${tooltipBorder}`,
                  borderRadius: 0,
                  fontSize: 12,
                }}
                formatter={(value) => [formatValue(value as number), formatMetricName(primaryMetric.name)]}
              />
              <Bar
                dataKey="value"
                radius={[0, 4, 4, 0]}
                label={{
                  position: 'right',
                  fill: textColor,
                  fontSize: 11,
                  formatter: (v: unknown) => formatValue(v as number),
                }}
              >
                {barData.map((entry) => (
                  <rect key={entry.runId} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

export default function Compare() {
  const [searchParams] = useSearchParams();
  const [runs, setRuns] = useState<RunDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ title: string; message: string; action?: string; recoverable: boolean } | null>(null);

  const runIds = searchParams.get('ids')?.split(',').filter(Boolean) || [];

  const loadRuns = useCallback(async () => {
    if (runIds.length === 0) {
      setLoading(false);
      return;
    }

    try {
      const loadedRuns = await Promise.all(
        runIds.map((id) => api.getRun(id))
      );
      setRuns(loadedRuns);
      setError(null);
    } catch (err) {
      const parsed = parseError(err, 'comparing-runs');
      setError({
        title: parsed.title,
        message: parsed.message,
        action: parsed.action,
        recoverable: parsed.recoverable,
      });
    } finally {
      setLoading(false);
    }
  }, [runIds.join(',')]);

  useEffect(() => {
    loadRuns();
  }, [loadRuns]);

  // Check if benchmarks are different
  const benchmarks = [...new Set(runs.map((r) => r.benchmark))];
  const hasDifferentBenchmarks = benchmarks.length > 1;

  // Aggregate metrics across runs
  const aggregateMetrics = (): CompareMetric[] => {
    const metricMap = new Map<string, (number | null)[]>();

    runs.forEach((run, runIndex) => {
      const summary = run.summary;
      if (!summary) return;

      // Add primary metric
      if (summary.primary_metric) {
        const name = summary.primary_metric.name;
        if (!metricMap.has(name)) {
          metricMap.set(name, new Array(runs.length).fill(null));
        }
        metricMap.get(name)![runIndex] = summary.primary_metric.value;
      }

      // Add other metrics
      summary.metrics.forEach((metric) => {
        if (!metricMap.has(metric.name)) {
          metricMap.set(metric.name, new Array(runs.length).fill(null));
        }
        metricMap.get(metric.name)![runIndex] = metric.value;
      });
    });

    return Array.from(metricMap.entries()).map(([name, values]) => ({
      name,
      values,
    }));
  };

  // Aggregate breakdowns across runs
  const aggregateBreakdowns = (): CompareBreakdown[] => {
    const breakdownMap = new Map<string, Map<string, (number | null)[]>>();

    runs.forEach((run, runIndex) => {
      const summary = run.summary;
      if (!summary) return;

      summary.breakdowns.forEach((breakdown) => {
        if (!breakdownMap.has(breakdown.name)) {
          breakdownMap.set(breakdown.name, new Map());
        }
        const itemMap = breakdownMap.get(breakdown.name)!;

        breakdown.items.forEach((item) => {
          if (!itemMap.has(item.key)) {
            itemMap.set(item.key, new Array(runs.length).fill(null));
          }
          itemMap.get(item.key)![runIndex] = item.value;
        });
      });
    });

    return Array.from(breakdownMap.entries()).map(([name, itemMap]) => ({
      name,
      items: Array.from(itemMap.entries()).map(([key, values]) => ({
        key,
        values,
      })),
    }));
  };

  const metrics = aggregateMetrics();
  const breakdowns = aggregateBreakdowns();

  if (loading) {
    return (
      <Layout>
        <div className="space-y-6 sm:space-y-8">
          <div className="h-8 w-48 sm:w-64 bg-border rounded animate-pulse" />
          <div className="h-48 sm:h-64 bg-border rounded animate-pulse" />
        </div>
      </Layout>
    );
  }

  if (runIds.length === 0) {
    return (
      <Layout>
        <div className="text-center py-12 sm:py-16">
          <p className="text-[14px] sm:text-[15px] text-muted mb-4">
            No runs selected for comparison
          </p>
          <Link
            to="/history"
            className="text-[14px] text-foreground hover:opacity-70 transition-opacity min-h-[44px] inline-flex items-center"
          >
            ← Back to History
          </Link>
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <ErrorState
          title={error.title}
          message={error.message}
          action={error.action}
          onRetry={error.recoverable ? () => {
            setError(null);
            setLoading(true);
            loadRuns();
          } : undefined}
        >
          <Link
            to="/history"
            className="mt-4 inline-block text-[14px] text-muted-foreground hover:text-foreground transition-colors min-h-[44px] flex items-center"
          >
            ← Back to History
          </Link>
        </ErrorState>
      </Layout>
    );
  }

  return (
    <Layout>
      {/* Header */}
      <div className="mb-8 sm:mb-12">
        <Link
          to="/history"
          className="text-[13px] text-muted-foreground hover:text-foreground transition-colors mb-4 inline-flex items-center min-h-[44px]"
        >
          ← Back
        </Link>
        <h1 className="text-[22px] sm:text-[28px] text-foreground tracking-tight mb-2">
          Compare Runs
        </h1>
        <p className="text-[14px] sm:text-[15px] text-muted-foreground">
          Comparing {runs.length} runs
        </p>
      </div>

      {/* Warning for different benchmarks */}
      {hasDifferentBenchmarks && (
        <div className="mb-6 sm:mb-8 px-4 sm:px-5 py-4 bg-warning-bg border border-warning-border">
          <p className="text-[13px] sm:text-[14px] text-warning">
            ⚠ These runs use different benchmarks ({benchmarks.join(', ')}). 
            Comparison may not be meaningful.
          </p>
        </div>
      )}

      {/* Run Legend - Scrollable on mobile */}
      <div className="mb-6 sm:mb-8">
        <p className="text-[11px] text-muted-foreground uppercase tracking-[0.1em] mb-4">
          Runs
        </p>
        <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
          <div className="flex gap-3 sm:gap-4 sm:flex-wrap min-w-max sm:min-w-0">
            {runs.map((run, index) => (
              <Link
                key={run.run_id}
                to={`/runs/${run.run_id}`}
                className="flex items-center gap-3 px-3 sm:px-4 py-3 bg-background-secondary border border-border hover:border-border-secondary transition-colors min-w-[200px] sm:min-w-0 min-h-[44px]"
              >
                <div
                  className="w-3 h-3 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: getRunColor(index) }}
                />
                <div className="min-w-0">
                  <p className="text-[13px] sm:text-[14px] text-foreground truncate">{run.benchmark}</p>
                  <p className="text-[11px] sm:text-[12px] text-muted-foreground truncate">{truncateModel(run.model, 20)}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Summary Statistics */}
      {metrics.length > 0 && (
        <div className="mb-8 sm:mb-12">
          <SummaryStats metrics={metrics} runs={runs} />
        </div>
      )}

      {/* Primary Metric Bar Chart */}
      <PrimaryMetricChart runs={runs} metrics={metrics} />

      {/* Radar Chart for Overall Metrics - Hidden on very small screens */}
      <div className="hidden sm:block">
        <MetricsRadarChart metrics={metrics} runs={runs} />
      </div>

      {/* Temporal Line Chart */}
      <TemporalLineChart metrics={metrics} runs={runs} />

      {/* Breakdown Bar Charts */}
      {breakdowns.length > 0 && (
        <div className="mb-8 sm:mb-12">
          <p className="text-[11px] text-muted-foreground uppercase tracking-[0.1em] mb-4 sm:mb-6">
            Category Breakdowns
          </p>
          {breakdowns.map((breakdown) => (
            <BreakdownBarChart
              key={breakdown.name}
              breakdown={breakdown}
              runs={runs}
            />
          ))}
        </div>
      )}

      {/* Metrics Comparison Table - Horizontal scroll on mobile */}
      {metrics.length > 0 && (
        <div className="mb-8 sm:mb-12">
          <p className="text-[11px] text-muted-foreground uppercase tracking-[0.1em] mb-4 sm:mb-6">
            All Metrics (Table)
          </p>
          <div className="bg-background-secondary border border-border overflow-x-auto">
            <table className="w-full min-w-[500px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-3 sm:px-5 py-3 sm:py-4 text-[11px] sm:text-[12px] text-muted-foreground uppercase tracking-[0.1em] font-normal">
                    Metric
                  </th>
                  {runs.map((run, index) => (
                    <th
                      key={run.run_id}
                      className="text-right px-3 sm:px-5 py-3 sm:py-4 text-[11px] sm:text-[12px] text-muted-foreground uppercase tracking-[0.1em] font-normal"
                    >
                      <div className="flex items-center justify-end gap-2">
                        <div
                          className="w-2 h-2 rounded-sm"
                          style={{ backgroundColor: getRunColor(index) }}
                        />
                        <span className="truncate max-w-[80px] sm:max-w-32">
                          {truncateModel(run.model, 12)}
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {metrics.map((metric) => {
                  const values = metric.values.filter((v) => v !== null) as number[];
                  const maxVal = Math.max(...values, 0);
                  const minVal = Math.min(...values, 0);

                  return (
                    <tr key={metric.name} className="border-b border-background-tertiary">
                      <td className="px-3 sm:px-5 py-3 sm:py-4 text-[13px] sm:text-[14px] text-muted">
                        {formatMetricName(metric.name)}
                      </td>
                      {metric.values.map((value, index) => {
                        const isBest = value === maxVal && values.length > 1;
                        const isWorst = value === minVal && values.length > 1 && maxVal !== minVal;

                        return (
                          <td
                            key={index}
                            className={`px-3 sm:px-5 py-3 sm:py-4 text-right text-[14px] sm:text-[15px] tabular-nums ${
                              value === null
                                ? 'text-muted-foreground'
                                : isBest
                                ? 'text-foreground font-medium'
                                : isWorst
                                ? 'text-muted-foreground'
                                : 'text-foreground-secondary'
                            }`}
                          >
                            {value !== null ? formatValue(value) : '—'}
                            {isBest && <span className="ml-1 text-[10px] text-muted-foreground">✓</span>}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* No data state */}
      {metrics.length === 0 && breakdowns.length === 0 && (
        <div className="text-center py-8 sm:py-12 bg-background-secondary border border-border">
          <p className="text-[14px] sm:text-[15px] text-muted-foreground">
            No metrics available for comparison
          </p>
          <p className="text-[12px] sm:text-[13px] text-muted-foreground mt-2">
            Selected runs may not have completed or produced structured results
          </p>
        </div>
      )}

      {/* Configuration Comparison */}
      <div className="mb-8 sm:mb-12">
        <p className="text-[11px] text-muted-foreground uppercase tracking-[0.1em] mb-4 sm:mb-6">
          Configuration
        </p>
        <div className="bg-background-secondary border border-border overflow-x-auto">
          <table className="w-full min-w-[500px]">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-3 sm:px-5 py-3 sm:py-4 text-[11px] sm:text-[12px] text-muted-foreground uppercase tracking-[0.1em] font-normal">
                  Setting
                </th>
                {runs.map((run, index) => (
                  <th
                    key={run.run_id}
                    className="text-right px-3 sm:px-5 py-3 sm:py-4 text-[11px] sm:text-[12px] text-muted-foreground uppercase tracking-[0.1em] font-normal"
                  >
                    <div className="flex items-center justify-end gap-2">
                      <div
                        className="w-2 h-2 rounded-sm"
                        style={{ backgroundColor: getRunColor(index) }}
                      />
                      <span className="truncate max-w-[80px] sm:max-w-32">
                        {truncateModel(run.model, 12)}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {['benchmark', 'model', 'limit', 'temperature', 'epochs'].map((key) => (
                <tr key={key} className="border-b border-background-tertiary">
                  <td className="px-3 sm:px-5 py-3 sm:py-4 text-[13px] sm:text-[14px] text-muted">
                    {formatMetricName(key)}
                  </td>
                  {runs.map((run, index) => {
                    const config = run.config as Record<string, unknown> | undefined;
                    let value: unknown = key === 'benchmark' ? run.benchmark : key === 'model' ? run.model : config?.[key];

                    return (
                      <td
                        key={index}
                        className="px-3 sm:px-5 py-3 sm:py-4 text-right text-[13px] sm:text-[14px] text-foreground-secondary truncate max-w-[100px] sm:max-w-none"
                      >
                        {value !== undefined && value !== null ? String(value) : '—'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
