import type { MetricValue } from '../api/client';

interface MetricCardsProps {
  primaryMetric: MetricValue | null;
  metrics: MetricValue[];
}

function formatValue(value: number, unit?: string | null): string {
  // Format as percentage if value is between 0-1 and no unit specified
  if (unit === null || unit === undefined) {
    if (value >= 0 && value <= 1) {
      return `${(value * 100).toFixed(1)}%`;
    }
  }
  
  // Format with appropriate decimal places
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

export default function MetricCards({ primaryMetric, metrics }: MetricCardsProps) {
  // Filter out the primary metric from additional metrics to avoid duplication
  const additionalMetrics = metrics.filter(
    (m) => m.name !== primaryMetric?.name
  );

  return (
    <div className="space-y-8">
      {/* Primary Metric - Large Card */}
      {primaryMetric && (
        <div className="relative">
          <div className="absolute -inset-px bg-gradient-to-r from-[#2a2a2a] to-transparent opacity-50 rounded-sm" />
          <div className="relative bg-[#0a0a0a] border border-[#1a1a1a] px-8 py-6">
            <p className="text-[11px] text-[#555] uppercase tracking-[0.15em] mb-3">
              Primary Metric
            </p>
            <div className="flex items-baseline gap-3">
              <span className="text-[48px] text-white font-light tracking-tight tabular-nums">
                {formatValue(primaryMetric.value, primaryMetric.unit)}
              </span>
              <span className="text-[15px] text-[#666]">
                {formatMetricName(primaryMetric.name)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Additional Metrics Grid */}
      {additionalMetrics.length > 0 && (
        <div>
          <p className="text-[11px] text-[#555] uppercase tracking-[0.15em] mb-4">
            Additional Metrics
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {additionalMetrics.map((metric) => (
              <div
                key={metric.name}
                className="bg-[#0a0a0a] border border-[#1a1a1a] px-5 py-4"
              >
                <p className="text-[11px] text-[#555] uppercase tracking-[0.1em] mb-2 truncate">
                  {formatMetricName(metric.name)}
                </p>
                <p className="text-[24px] text-white font-light tabular-nums">
                  {formatValue(metric.value, metric.unit)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No metrics state */}
      {!primaryMetric && metrics.length === 0 && (
        <div className="text-center py-8">
          <p className="text-[14px] text-[#555]">
            No structured metrics available
          </p>
        </div>
      )}
    </div>
  );
}



