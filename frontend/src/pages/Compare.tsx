import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api, RunDetail } from '../api/client';
import Layout from '../components/Layout';
import ExportDropdown from '../components/ExportDropdown';
import { exportComparisonToCSV, exportComparisonToJSON, ComparisonData } from '../utils/export';

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
function getRunColor(index: number): string {
  const colors = [
    '#c9a227',   // gold
    '#8b9dc3',   // light blue-gray
    '#b4a7d6',   // lavender
    '#a8a8a8',   // silver
    '#6b6b6b',   // gray
    '#e07c7c',   // coral
  ];
  return colors[index % colors.length];
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

export default function Compare() {
  const [searchParams] = useSearchParams();
  const [runs, setRuns] = useState<RunDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const runIds = searchParams.get('ids')?.split(',').filter(Boolean) || [];

  useEffect(() => {
    if (runIds.length === 0) {
      setLoading(false);
      return;
    }

    const loadRuns = async () => {
      try {
        const loadedRuns = await Promise.all(
          runIds.map((id) => api.getRun(id))
        );
        setRuns(loadedRuns);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load runs');
      } finally {
        setLoading(false);
      }
    };

    loadRuns();
  }, [searchParams]);

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

  // Get primary metric for bar chart
  const getPrimaryMetricData = (): { labels: string[]; values: number[]; name: string } | null => {
    const primaryMetrics = runs.map((run) => run.summary?.primary_metric);
    const validMetrics = primaryMetrics.filter((m) => m !== null && m !== undefined);
    
    if (validMetrics.length === 0) return null;

    // Use first non-null primary metric name
    const metricName = validMetrics[0]!.name;

    return {
      name: metricName,
      labels: runs.map((r) => truncateModel(r.model)),
      values: runs.map((r) => r.summary?.primary_metric?.value ?? 0),
    };
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
  const primaryMetricData = getPrimaryMetricData();
  const breakdowns = aggregateBreakdowns();

  // Export handlers
  const getComparisonData = (): ComparisonData => ({
    runs,
    metrics,
    breakdowns,
  });

  const handleExportCSV = () => {
    exportComparisonToCSV(getComparisonData());
    toast.success('Exported comparison to CSV');
  };

  const handleExportJSON = () => {
    exportComparisonToJSON(getComparisonData());
    toast.success('Exported comparison to JSON');
  };

  if (loading) {
    return (
      <Layout>
        <div className="space-y-8">
          <div className="h-8 w-64 bg-[#1a1a1a] rounded animate-pulse" />
          <div className="h-64 bg-[#1a1a1a] rounded animate-pulse" />
        </div>
      </Layout>
    );
  }

  if (runIds.length === 0) {
    return (
      <Layout>
        <div className="text-center py-16">
          <p className="text-[15px] text-[#888] mb-4">
            No runs selected for comparison
          </p>
          <Link
            to="/history"
            className="text-[14px] text-white hover:opacity-70 transition-opacity"
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
        <div className="text-center py-16">
          <p className="text-[15px] text-[#888] mb-4">{error}</p>
          <Link
            to="/history"
            className="text-[14px] text-white hover:opacity-70 transition-opacity"
          >
            ← Back to History
          </Link>
        </div>
      </Layout>
    );
  }

  const maxPrimaryValue = primaryMetricData
    ? Math.max(...primaryMetricData.values.filter((v) => v > 0), 0.01)
    : 1;

  return (
    <Layout>
      {/* Header */}
      <div className="mb-12">
        <Link
          to="/history"
          className="text-[13px] text-[#666] hover:text-white transition-colors mb-4 inline-block"
        >
          ← Back
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-[28px] text-white tracking-tight mb-2">
              Compare Runs
            </h1>
            <p className="text-[15px] text-[#666]">
              Comparing {runs.length} runs
            </p>
          </div>
          {runs.length > 0 && (
            <ExportDropdown
              label="Export Comparison"
              options={[
                { label: 'Comparison', format: 'csv', onClick: handleExportCSV },
                { label: 'Comparison', format: 'json', onClick: handleExportJSON },
              ]}
            />
          )}
        </div>
      </div>

      {/* Warning for different benchmarks */}
      {hasDifferentBenchmarks && (
        <div className="mb-8 px-5 py-4 bg-[#1a1500] border border-[#3a3000]">
          <p className="text-[14px] text-[#c9a227]">
            ⚠ These runs use different benchmarks ({benchmarks.join(', ')}). 
            Comparison may not be meaningful.
          </p>
        </div>
      )}

      {/* Run Legend */}
      <div className="mb-8">
        <p className="text-[11px] text-[#666] uppercase tracking-[0.1em] mb-4">
          Runs
        </p>
        <div className="flex flex-wrap gap-4">
          {runs.map((run, index) => (
            <Link
              key={run.run_id}
              to={`/runs/${run.run_id}`}
              className="flex items-center gap-3 px-4 py-3 bg-[#0a0a0a] border border-[#1a1a1a] hover:border-[#333] transition-colors"
            >
              <div
                className="w-3 h-3 rounded-sm"
                style={{ backgroundColor: getRunColor(index) }}
              />
              <div>
                <p className="text-[14px] text-white">{run.benchmark}</p>
                <p className="text-[12px] text-[#666]">{truncateModel(run.model)}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Primary Metric Bar Chart */}
      {primaryMetricData && (
        <div className="mb-12">
          <p className="text-[11px] text-[#666] uppercase tracking-[0.1em] mb-6">
            {formatMetricName(primaryMetricData.name)}
          </p>
          <div className="space-y-3">
            {runs.map((run, index) => {
              const value = primaryMetricData.values[index];
              const percentage = (value / maxPrimaryValue) * 100;

              return (
                <div key={run.run_id} className="group">
                  <div className="flex items-center gap-4">
                    <div className="w-48 truncate">
                      <span className="text-[13px] text-[#888]">
                        {truncateModel(run.model)}
                      </span>
                    </div>
                    <div className="flex-1 h-8 bg-[#111] rounded-sm overflow-hidden relative">
                      <div
                        className="h-full transition-all duration-500 ease-out"
                        style={{
                          width: `${Math.max(percentage, 2)}%`,
                          backgroundColor: getRunColor(index),
                        }}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[14px] text-white font-light tabular-nums">
                        {formatValue(value)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Metrics Comparison Table */}
      {metrics.length > 0 && (
        <div className="mb-12">
          <p className="text-[11px] text-[#666] uppercase tracking-[0.1em] mb-6">
            All Metrics
          </p>
          <div className="bg-[#0a0a0a] border border-[#1a1a1a] overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#1a1a1a]">
                  <th className="text-left px-5 py-4 text-[12px] text-[#555] uppercase tracking-[0.1em] font-normal">
                    Metric
                  </th>
                  {runs.map((run, index) => (
                    <th
                      key={run.run_id}
                      className="text-right px-5 py-4 text-[12px] text-[#555] uppercase tracking-[0.1em] font-normal"
                    >
                      <div className="flex items-center justify-end gap-2">
                        <div
                          className="w-2 h-2 rounded-sm"
                          style={{ backgroundColor: getRunColor(index) }}
                        />
                        <span className="truncate max-w-32">
                          {truncateModel(run.model, 16)}
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
                    <tr key={metric.name} className="border-b border-[#111]">
                      <td className="px-5 py-4 text-[14px] text-[#888]">
                        {formatMetricName(metric.name)}
                      </td>
                      {metric.values.map((value, index) => {
                        const isBest = value === maxVal && values.length > 1;
                        const isWorst = value === minVal && values.length > 1 && maxVal !== minVal;

                        return (
                          <td
                            key={index}
                            className={`px-5 py-4 text-right text-[15px] tabular-nums ${
                              value === null
                                ? 'text-[#444]'
                                : isBest
                                ? 'text-white font-medium'
                                : isWorst
                                ? 'text-[#666]'
                                : 'text-[#aaa]'
                            }`}
                          >
                            {value !== null ? formatValue(value) : '—'}
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

      {/* Breakdown Comparison */}
      {breakdowns.length > 0 && (
        <div className="mb-12">
          <p className="text-[11px] text-[#666] uppercase tracking-[0.1em] mb-6">
            Breakdowns
          </p>
          <div className="space-y-8">
            {breakdowns.map((breakdown) => (
              <div
                key={breakdown.name}
                className="bg-[#0a0a0a] border border-[#1a1a1a] overflow-x-auto"
              >
                <div className="px-5 py-3 border-b border-[#1a1a1a]">
                  <p className="text-[13px] text-[#666] uppercase tracking-[0.1em]">
                    {formatMetricName(breakdown.name)}
                  </p>
                </div>
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#1a1a1a]">
                      <th className="text-left px-5 py-3 text-[12px] text-[#555] uppercase tracking-[0.1em] font-normal">
                        Category
                      </th>
                      {runs.map((run, index) => (
                        <th
                          key={run.run_id}
                          className="text-right px-5 py-3 text-[12px] text-[#555] font-normal"
                        >
                          <div className="flex items-center justify-end gap-2">
                            <div
                              className="w-2 h-2 rounded-sm"
                              style={{ backgroundColor: getRunColor(index) }}
                            />
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {breakdown.items.map((item) => {
                      const values = item.values.filter((v) => v !== null) as number[];
                      const maxVal = Math.max(...values, 0);

                      return (
                        <tr key={item.key} className="border-b border-[#111]">
                          <td className="px-5 py-3 text-[13px] text-[#888]">
                            {formatMetricName(item.key)}
                          </td>
                          {item.values.map((value, index) => {
                            const isBest = value === maxVal && values.length > 1;

                            return (
                              <td
                                key={index}
                                className={`px-5 py-3 text-right text-[14px] tabular-nums ${
                                  value === null
                                    ? 'text-[#444]'
                                    : isBest
                                    ? 'text-white'
                                    : 'text-[#888]'
                                }`}
                              >
                                {value !== null ? formatValue(value) : '—'}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No data state */}
      {metrics.length === 0 && breakdowns.length === 0 && (
        <div className="text-center py-12 bg-[#0a0a0a] border border-[#1a1a1a]">
          <p className="text-[15px] text-[#555]">
            No metrics available for comparison
          </p>
          <p className="text-[13px] text-[#444] mt-2">
            Selected runs may not have completed or produced structured results
          </p>
        </div>
      )}

      {/* Configuration Comparison */}
      <div className="mb-12">
        <p className="text-[11px] text-[#666] uppercase tracking-[0.1em] mb-6">
          Configuration
        </p>
        <div className="bg-[#0a0a0a] border border-[#1a1a1a] overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#1a1a1a]">
                <th className="text-left px-5 py-4 text-[12px] text-[#555] uppercase tracking-[0.1em] font-normal">
                  Setting
                </th>
                {runs.map((run, index) => (
                  <th
                    key={run.run_id}
                    className="text-right px-5 py-4 text-[12px] text-[#555] uppercase tracking-[0.1em] font-normal"
                  >
                    <div className="flex items-center justify-end gap-2">
                      <div
                        className="w-2 h-2 rounded-sm"
                        style={{ backgroundColor: getRunColor(index) }}
                      />
                      <span className="truncate max-w-32">
                        {truncateModel(run.model, 16)}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {['benchmark', 'model', 'limit', 'temperature', 'epochs'].map((key) => (
                <tr key={key} className="border-b border-[#111]">
                  <td className="px-5 py-4 text-[14px] text-[#888]">
                    {formatMetricName(key)}
                  </td>
                  {runs.map((run, index) => {
                    const config = run.config as Record<string, unknown> | undefined;
                    let value: unknown = key === 'benchmark' ? run.benchmark : key === 'model' ? run.model : config?.[key];

                    return (
                      <td
                        key={index}
                        className="px-5 py-4 text-right text-[14px] text-[#aaa]"
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



