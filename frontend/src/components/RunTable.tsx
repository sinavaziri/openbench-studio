import { Link } from 'react-router-dom';
import type { RunSummary } from '../api/client';

interface RunTableProps {
  runs: RunSummary[];
  loading?: boolean;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
}

function StatusIndicator({ status }: { status: RunSummary['status'] }) {
  const labels: Record<RunSummary['status'], string> = {
    queued: 'Queued',
    running: 'Running',
    completed: 'Completed',
    failed: 'Failed',
    canceled: 'Canceled',
  };

  return (
    <span className="inline-flex items-center text-[14px] text-[#888]">
      {status === 'running' && (
        <span className="w-1.5 h-1.5 rounded-full bg-white mr-2 animate-pulse" />
      )}
      {labels[status]}
    </span>
  );
}

function formatMetric(value: number | undefined, _name?: string): string {
  if (value === undefined || value === null) return '—';
  
  // Format as percentage if value is between 0-1
  if (value >= 0 && value <= 1) {
    return `${(value * 100).toFixed(1)}%`;
  }
  
  if (Number.isInteger(value)) {
    return value.toString();
  }
  return value.toFixed(2);
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString();
}

export default function RunTable({ 
  runs, 
  loading, 
  selectable = false,
  selectedIds = new Set(),
  onSelectionChange,
}: RunTableProps) {
  const handleRowClick = (runId: string, e: React.MouseEvent) => {
    if (!selectable || !onSelectionChange) return;
    
    // Only handle clicks if in selectable mode
    e.preventDefault();
    
    const newSelection = new Set(selectedIds);
    if (newSelection.has(runId)) {
      newSelection.delete(runId);
    } else {
      newSelection.add(runId);
    }
    onSelectionChange(newSelection);
  };

  const handleCheckboxClick = (runId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    if (!onSelectionChange) return;
    
    const newSelection = new Set(selectedIds);
    if (newSelection.has(runId)) {
      newSelection.delete(runId);
    } else {
      newSelection.add(runId);
    }
    onSelectionChange(newSelection);
  };

  if (loading) {
    return (
      <div className="border-t border-[#1a1a1a]">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-16 border-b border-[#1a1a1a] animate-pulse">
            <div className="h-full flex items-center">
              <div className="w-32 h-4 bg-[#1a1a1a] rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="border-t border-[#1a1a1a] py-16 text-center">
        <p className="text-[15px] text-[#666] mb-4">No runs yet</p>
        <Link
          to="/runs/new"
          className="text-[14px] text-white hover:opacity-70 transition-opacity"
        >
          Start a Run →
        </Link>
      </div>
    );
  }

  const gridCols = selectable
    ? 'grid-cols-[40px_160px_1fr_90px_100px_120px_80px]'
    : 'grid-cols-[180px_1fr_90px_100px_120px_80px]';

  return (
    <div className="border-t border-[#1a1a1a]">
      {/* Header */}
      <div className={`grid ${gridCols} gap-6 py-3 border-b border-[#1a1a1a] text-[11px] text-[#555] uppercase tracking-[0.1em]`}>
        {selectable && <div />}
        <div>Benchmark</div>
        <div>Model</div>
        <div>Result</div>
        <div>Tags</div>
        <div>Status</div>
        <div className="text-right">Time</div>
      </div>
      
      {runs.map((run) => {
        const isSelected = selectedIds.has(run.run_id);
        const isCompleted = run.status === 'completed';

        const tags = run.tags || [];
        const displayTags = tags.slice(0, 2);
        const moreTags = tags.length > 2 ? tags.length - 2 : 0;

        if (selectable) {
          return (
            <div
              key={run.run_id}
              onClick={(e) => handleRowClick(run.run_id, e)}
              className={`grid ${gridCols} gap-6 py-4 border-b border-[#1a1a1a] transition-colors cursor-pointer ${
                isSelected 
                  ? 'bg-[#1a1a18]' 
                  : 'hover:bg-[#111]'
              }`}
            >
              <div className="flex items-center justify-center">
                <div
                  onClick={(e) => handleCheckboxClick(run.run_id, e)}
                  className={`w-4 h-4 border rounded-sm flex items-center justify-center transition-colors ${
                    isSelected
                      ? 'bg-white border-white'
                      : 'border-[#444] hover:border-[#666]'
                  }`}
                >
                  {isSelected && (
                    <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              </div>
              <div>
                <Link 
                  to={`/runs/${run.run_id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-[15px] text-white hover:underline"
                >
                  {run.benchmark}
                </Link>
              </div>
              <div>
                <span className="text-[14px] text-[#666] truncate block">
                  {run.model}
                </span>
              </div>
              <div>
                {isCompleted && run.primary_metric !== undefined && run.primary_metric !== null ? (
                  <span className="text-[15px] text-white tabular-nums font-light">
                    {formatMetric(run.primary_metric, run.primary_metric_name)}
                  </span>
                ) : (
                  <span className="text-[14px] text-[#444]">—</span>
                )}
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                {displayTags.map((tag) => (
                  <span
                    key={tag}
                    className="px-1.5 py-0.5 text-[10px] text-[#888] bg-[#1a1a1a] border border-[#222]"
                  >
                    {tag}
                  </span>
                ))}
                {moreTags > 0 && (
                  <span className="text-[10px] text-[#555]">+{moreTags}</span>
                )}
              </div>
              <div>
                <StatusIndicator status={run.status} />
              </div>
              <div className="text-right">
                <span className="text-[14px] text-[#666]">
                  {formatDate(run.created_at)}
                </span>
              </div>
            </div>
          );
        }

        return (
          <Link
            key={run.run_id}
            to={`/runs/${run.run_id}`}
            className={`grid ${gridCols} gap-6 py-4 border-b border-[#1a1a1a] hover:bg-[#111] transition-colors group`}
          >
            <div>
              <span className="text-[15px] text-white">
                {run.benchmark}
              </span>
            </div>
            <div>
              <span className="text-[14px] text-[#666] truncate block">
                {run.model}
              </span>
            </div>
            <div>
              {isCompleted && run.primary_metric !== undefined && run.primary_metric !== null ? (
                <span className="text-[15px] text-white tabular-nums font-light">
                  {formatMetric(run.primary_metric, run.primary_metric_name)}
                </span>
              ) : (
                <span className="text-[14px] text-[#444]">—</span>
              )}
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              {displayTags.map((tag) => (
                <span
                  key={tag}
                  className="px-1.5 py-0.5 text-[10px] text-[#888] bg-[#1a1a1a] border border-[#222]"
                >
                  {tag}
                </span>
              ))}
              {moreTags > 0 && (
                <span className="text-[10px] text-[#555]">+{moreTags}</span>
              )}
            </div>
            <div>
              <StatusIndicator status={run.status} />
            </div>
            <div className="text-right">
              <span className="text-[14px] text-[#666]">
                {formatDate(run.created_at)}
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
