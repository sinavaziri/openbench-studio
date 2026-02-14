import { useCallback, useEffect, useState, useMemo } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import {
  api,
  SummaryStats,
  HistoryResponse,
  ModelsResponse,
  BenchmarksResponse,
} from '../api/client';
import Layout from '../components/Layout';
import { useTheme } from '../context/ThemeContext';
import { parseError } from '../utils/errorMessages';

// Date range presets
const DATE_RANGES = [
  { value: 7, label: 'Last 7 days' },
  { value: 14, label: 'Last 14 days' },
  { value: 30, label: 'Last 30 days' },
  { value: 60, label: 'Last 60 days' },
  { value: 90, label: 'Last 90 days' },
  { value: 180, label: 'Last 6 months' },
  { value: 365, label: 'Last year' },
];

// Color palette for charts
const CHART_COLORS = {
  light: {
    primary: '#1a1a1a',
    secondary: '#666666',
    tertiary: '#999999',
    completed: '#22c55e',
    failed: '#ef4444',
    grid: '#e5e5e5',
    text: '#1a1a1a',
    muted: '#666666',
    background: '#ffffff',
    tooltip: '#ffffff',
    tooltipBorder: '#e5e5e5',
  },
  dark: {
    primary: '#ffffff',
    secondary: '#a1a1aa',
    tertiary: '#71717a',
    completed: '#4ade80',
    failed: '#f87171',
    grid: '#27272a',
    text: '#ffffff',
    muted: '#a1a1aa',
    background: '#18181b',
    tooltip: '#27272a',
    tooltipBorder: '#3f3f46',
  },
};

// Generate colors for pie chart
function getPieColors(count: number, isDark: boolean): string[] {
  const baseColors = isDark
    ? ['#ffffff', '#d4d4d8', '#a1a1aa', '#71717a', '#52525b', '#3f3f46']
    : ['#1a1a1a', '#404040', '#666666', '#808080', '#999999', '#b3b3b3'];
  
  const colors: string[] = [];
  for (let i = 0; i < count; i++) {
    colors.push(baseColors[i % baseColors.length]);
  }
  return colors;
}

// Format percentage
function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

// Format score (0-1 range)
function formatScore(value: number | null): string {
  if (value === null) return '—';
  if (value >= 0 && value <= 1) {
    return `${(value * 100).toFixed(1)}%`;
  }
  return value.toFixed(2);
}

// Custom tooltip component
interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
  colors: typeof CHART_COLORS.light;
}

function CustomTooltip({ active, payload, label, colors }: CustomTooltipProps) {
  if (!active || !payload) return null;

  return (
    <div
      className="px-3 py-2 text-[13px] border shadow-lg"
      style={{
        backgroundColor: colors.tooltip,
        borderColor: colors.tooltipBorder,
        color: colors.text,
      }}
    >
      <p className="mb-1 font-medium">{label}</p>
      {payload.map((entry, index) => (
        <p key={index} style={{ color: entry.color }}>
          {entry.name}: {entry.value}
        </p>
      ))}
    </div>
  );
}

// Stat card component
interface StatCardProps {
  label: string;
  value: string | number;
  subValue?: string;
}

function StatCard({ label, value, subValue }: StatCardProps) {
  return (
    <div className="bg-background-secondary border border-border p-6">
      <p className="text-[11px] text-muted-foreground uppercase tracking-[0.1em] mb-3">
        {label}
      </p>
      <p className="text-[28px] text-foreground tabular-nums">{value}</p>
      {subValue && (
        <p className="text-[12px] text-muted-foreground mt-1">{subValue}</p>
      )}
    </div>
  );
}

export default function Analytics() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const colors = isDark ? CHART_COLORS.dark : CHART_COLORS.light;

  // State
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Data
  const [summary, setSummary] = useState<SummaryStats | null>(null);
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [models, setModels] = useState<ModelsResponse | null>(null);
  const [benchmarks, setBenchmarks] = useState<BenchmarksResponse | null>(null);

  // Load all data
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [summaryData, historyData, modelsData, benchmarksData] = await Promise.all([
        api.getSummaryStats(days),
        api.getRunHistory(days, days > 60 ? 'week' : 'day'),
        api.getModelStats(days, 10),
        api.getBenchmarkStats(days, 10),
      ]);

      setSummary(summaryData);
      setHistory(historyData);
      setModels(modelsData);
      setBenchmarks(benchmarksData);
    } catch (err) {
      const parsed = parseError(err, 'loading-analytics');
      setError(parsed.message);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Prepare chart data
  const historyChartData = useMemo(() => {
    if (!history) return [];
    return history.data.map((d) => ({
      date: new Date(d.date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      }),
      total: d.total,
      completed: d.completed,
      failed: d.failed,
      avgScore: d.avg_score !== null ? Math.round(d.avg_score * 100) : null,
    }));
  }, [history]);

  const modelChartData = useMemo(() => {
    if (!models) return [];
    return models.models.slice(0, 8).map((m) => ({
      name: m.model.split('/').pop() || m.model,
      fullName: m.model,
      runs: m.run_count,
      avgScore: m.avg_score !== null ? Math.round(m.avg_score * 100) : 0,
      successRate: m.success_rate,
    }));
  }, [models]);

  const benchmarkChartData = useMemo(() => {
    if (!benchmarks) return [];
    return benchmarks.benchmarks.slice(0, 8).map((b) => ({
      name: b.benchmark,
      value: b.run_count,
    }));
  }, [benchmarks]);

  const pieColors = useMemo(
    () => getPieColors(benchmarkChartData.length, isDark),
    [benchmarkChartData.length, isDark]
  );

  if (loading && !summary) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="flex flex-col items-center gap-4">
            <div className="w-8 h-8 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
            <p className="text-[13px] text-muted-foreground">Loading analytics...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-[11px] text-muted-foreground uppercase tracking-[0.1em]">
          Analytics
        </h1>

        {/* Date Range Selector */}
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="px-3 py-2 bg-background-secondary border border-border text-foreground text-[13px] focus:border-border-secondary focus:outline-none transition-colors cursor-pointer appearance-none pr-8"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23666'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 8px center',
            backgroundSize: '16px',
          }}
        >
          {DATE_RANGES.map((range) => (
            <option key={range.value} value={range.value}>
              {range.label}
            </option>
          ))}
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-8 p-4 bg-error-bg border border-error-border text-[13px]">
          <p className="text-foreground">{error}</p>
          <button
            onClick={loadData}
            className="mt-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            Try again →
          </button>
        </div>
      )}

      {/* Summary Stats */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          <StatCard
            label="Total Runs"
            value={summary.total_runs}
            subValue={`${summary.unique_models} models, ${summary.unique_benchmarks} benchmarks`}
          />
          <StatCard
            label="Success Rate"
            value={formatPercent(summary.success_rate)}
            subValue={`${summary.completed_runs} completed, ${summary.failed_runs} failed`}
          />
          <StatCard
            label="Avg Score"
            value={formatScore(summary.avg_score)}
            subValue="Across completed runs"
          />
          <StatCard
            label="Running"
            value={summary.running_runs}
            subValue="In progress"
          />
        </div>
      )}

      {/* Charts Grid */}
      <div className="space-y-12">
        {/* Run History Chart */}
        <div>
          <p className="text-[11px] text-muted-foreground uppercase tracking-[0.1em] mb-6">
            Run History
          </p>
          <div className="bg-background-secondary border border-border p-6">
            <div className="h-[300px]">
              {historyChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={historyChartData}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke={colors.grid}
                      vertical={false}
                    />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: colors.muted, fontSize: 11 }}
                      axisLine={{ stroke: colors.grid }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: colors.muted, fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      content={<CustomTooltip colors={colors} />}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 12 }}
                      iconType="plainline"
                    />
                    <Line
                      type="monotone"
                      dataKey="total"
                      name="Total"
                      stroke={colors.primary}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, fill: colors.primary }}
                    />
                    <Line
                      type="monotone"
                      dataKey="completed"
                      name="Completed"
                      stroke={colors.completed}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, fill: colors.completed }}
                    />
                    <Line
                      type="monotone"
                      dataKey="failed"
                      name="Failed"
                      stroke={colors.failed}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, fill: colors.failed }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-[13px] text-muted-foreground">
                  No run data available for this period
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Model Performance & Benchmark Distribution */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Model Performance Chart */}
          <div>
            <p className="text-[11px] text-muted-foreground uppercase tracking-[0.1em] mb-6">
              Model Performance
            </p>
            <div className="bg-background-secondary border border-border p-6">
              <div className="h-[300px]">
                {modelChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={modelChartData}
                      layout="vertical"
                      margin={{ left: 0, right: 20 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={colors.grid}
                        horizontal={false}
                      />
                      <XAxis
                        type="number"
                        tick={{ fill: colors.muted, fontSize: 11 }}
                        axisLine={{ stroke: colors.grid }}
                        tickLine={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        tick={{ fill: colors.muted, fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        width={100}
                      />
                      <Tooltip
                        content={<CustomTooltip colors={colors} />}
                        cursor={{ fill: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}
                      />
                      <Bar
                        dataKey="runs"
                        name="Runs"
                        fill={colors.primary}
                        radius={[0, 2, 2, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-[13px] text-muted-foreground">
                    No model data available
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Benchmark Distribution Chart */}
          <div>
            <p className="text-[11px] text-muted-foreground uppercase tracking-[0.1em] mb-6">
              Benchmark Distribution
            </p>
            <div className="bg-background-secondary border border-border p-6">
              <div className="h-[300px]">
                {benchmarkChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={benchmarkChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey="value"
                        label={({ name, percent }) =>
                          `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`
                        }
                        labelLine={{ stroke: colors.muted, strokeWidth: 1 }}
                      >
                        {benchmarkChartData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={pieColors[index]} />
                        ))}
                      </Pie>
                      <Tooltip
                        content={<CustomTooltip colors={colors} />}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-[13px] text-muted-foreground">
                    No benchmark data available
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Model Stats Table */}
        {models && models.models.length > 0 && (
          <div>
            <p className="text-[11px] text-muted-foreground uppercase tracking-[0.1em] mb-6">
              Model Details
            </p>
            <div className="bg-background-secondary border border-border overflow-hidden">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-4 py-3 text-left text-[11px] text-muted-foreground uppercase tracking-[0.1em] font-normal">
                      Model
                    </th>
                    <th className="px-4 py-3 text-right text-[11px] text-muted-foreground uppercase tracking-[0.1em] font-normal">
                      Runs
                    </th>
                    <th className="px-4 py-3 text-right text-[11px] text-muted-foreground uppercase tracking-[0.1em] font-normal">
                      Success Rate
                    </th>
                    <th className="px-4 py-3 text-right text-[11px] text-muted-foreground uppercase tracking-[0.1em] font-normal">
                      Avg Score
                    </th>
                    <th className="px-4 py-3 text-right text-[11px] text-muted-foreground uppercase tracking-[0.1em] font-normal">
                      Range
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {models.models.map((model, index) => (
                    <tr
                      key={model.model}
                      className={index < models.models.length - 1 ? 'border-b border-border' : ''}
                    >
                      <td className="px-4 py-3 text-foreground">
                        <span className="font-mono text-[12px]">{model.model}</span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {model.run_count}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <span
                          className={
                            model.success_rate >= 80
                              ? 'text-success'
                              : model.success_rate >= 50
                              ? 'text-warning'
                              : 'text-error'
                          }
                        >
                          {formatPercent(model.success_rate)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatScore(model.avg_score)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {model.min_score !== null && model.max_score !== null
                          ? `${formatScore(model.min_score)} – ${formatScore(model.max_score)}`
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Benchmark Stats Table */}
        {benchmarks && benchmarks.benchmarks.length > 0 && (
          <div>
            <p className="text-[11px] text-muted-foreground uppercase tracking-[0.1em] mb-6">
              Benchmark Details
            </p>
            <div className="bg-background-secondary border border-border overflow-hidden">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-4 py-3 text-left text-[11px] text-muted-foreground uppercase tracking-[0.1em] font-normal">
                      Benchmark
                    </th>
                    <th className="px-4 py-3 text-right text-[11px] text-muted-foreground uppercase tracking-[0.1em] font-normal">
                      Runs
                    </th>
                    <th className="px-4 py-3 text-right text-[11px] text-muted-foreground uppercase tracking-[0.1em] font-normal">
                      Completed
                    </th>
                    <th className="px-4 py-3 text-right text-[11px] text-muted-foreground uppercase tracking-[0.1em] font-normal">
                      Avg Score
                    </th>
                    <th className="px-4 py-3 text-right text-[11px] text-muted-foreground uppercase tracking-[0.1em] font-normal">
                      Last Run
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {benchmarks.benchmarks.map((benchmark, index) => (
                    <tr
                      key={benchmark.benchmark}
                      className={index < benchmarks.benchmarks.length - 1 ? 'border-b border-border' : ''}
                    >
                      <td className="px-4 py-3 text-foreground">
                        <span className="font-mono text-[12px]">{benchmark.benchmark}</span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {benchmark.run_count}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {benchmark.completed_count}
                        <span className="text-muted-foreground ml-1">
                          ({Math.round((benchmark.completed_count / benchmark.run_count) * 100)}%)
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatScore(benchmark.avg_score)}
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">
                        {benchmark.last_run
                          ? new Date(benchmark.last_run).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
