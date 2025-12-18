import type { Breakdown } from '../api/client';

interface BreakdownChartProps {
  breakdowns: Breakdown[];
}

function formatValue(value: number): string {
  if (value >= 0 && value <= 1) {
    return `${(value * 100).toFixed(1)}%`;
  }
  if (Number.isInteger(value)) {
    return value.toString();
  }
  return value.toFixed(2);
}

function formatKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Generate a subtle color based on index
function getBarColor(index: number, total: number): string {
  // Use subtle grayscale with slight variation
  const baseGray = 255;
  const minGray = 180;
  const step = (baseGray - minGray) / Math.max(total, 1);
  const gray = Math.round(baseGray - (index * step));
  return `rgb(${gray}, ${gray}, ${gray})`;
}

interface BreakdownSectionProps {
  breakdown: Breakdown;
}

function BreakdownSection({ breakdown }: BreakdownSectionProps) {
  // Find max value for scaling
  const maxValue = Math.max(...breakdown.items.map((item) => item.value), 0.01);
  const sortedItems = [...breakdown.items].sort((a, b) => b.value - a.value);

  return (
    <div className="space-y-3">
      <p className="text-[12px] text-[#666] uppercase tracking-[0.1em]">
        {formatKey(breakdown.name)}
      </p>
      
      <div className="space-y-2">
        {sortedItems.map((item, index) => {
          const percentage = (item.value / maxValue) * 100;
          
          return (
            <div key={item.key} className="group">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[13px] text-[#888] truncate max-w-[60%]">
                  {formatKey(item.key)}
                </span>
                <span className="text-[13px] text-white tabular-nums ml-2">
                  {formatValue(item.value)}
                </span>
              </div>
              <div className="h-2 bg-[#111] rounded-sm overflow-hidden">
                <div
                  className="h-full transition-all duration-500 ease-out"
                  style={{
                    width: `${percentage}%`,
                    backgroundColor: getBarColor(index, sortedItems.length),
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function BreakdownChart({ breakdowns }: BreakdownChartProps) {
  if (breakdowns.length === 0) {
    return null;
  }

  return (
    <div className="space-y-8">
      <p className="text-[11px] text-[#555] uppercase tracking-[0.15em]">
        Breakdown
      </p>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {breakdowns.map((breakdown) => (
          <div
            key={breakdown.name}
            className="bg-[#0a0a0a] border border-[#1a1a1a] p-6"
          >
            <BreakdownSection breakdown={breakdown} />
          </div>
        ))}
      </div>
    </div>
  );
}



