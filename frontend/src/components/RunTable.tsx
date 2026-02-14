import { Link } from 'react-router-dom';
import type { RunSummary } from '../api/client';

interface RunTableProps {
  runs: RunSummary[];
  loading?: boolean;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  focusedIndex?: number;
  onFocusChange?: (index: number) => void;
  onSelectAll?: () => void;
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
    <span className="inline-flex items-center text-[14px] text-muted">
      {status === 'running' && (
        <span className="w-1.5 h-1.5 rounded-full bg-foreground mr-2 animate-pulse" />
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
  focusedIndex = -1,
  onFocusChange,
  onSelectAll,
}: RunTableProps) {
  const allSelected = runs.length > 0 && runs.every(run => selectedIds.has(run.run_id));
  const someSelected = runs.some(run => selectedIds.has(run.run_id)) && !allSelected;

  const handleSelectAllClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!onSelectionChange) return;
    
    if (allSelected) {
      // Deselect all
      onSelectionChange(new Set());
    } else {
      // Select all
      const allIds = new Set(runs.map(run => run.run_id));
      onSelectionChange(allIds);
    }
    onSelectAll?.();
  };
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
      <div className="border-t border-border">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-16 border-b border-border animate-pulse">
            <div className="h-full flex items-center">
              <div className="w-32 h-4 bg-border rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="border-t border-border py-16 text-center">
        <p className="text-[15px] text-muted-foreground mb-4">No runs yet</p>
        <Link
          to="/"
          className="text-[14px] text-foreground hover:opacity-70 transition-opacity"
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
    <div className="border-t border-border">
      {/* Header */}
      <div className={`grid ${gridCols} gap-6 py-3 border-b border-border text-[11px] text-muted-foreground uppercase tracking-[0.1em]`}>
        {selectable && (
          <div className="flex items-center justify-center">
            <div
              onClick={handleSelectAllClick}
              className={`w-4 h-4 border rounded-sm flex items-center justify-center transition-colors cursor-pointer ${
                allSelected
                  ? 'bg-foreground border-foreground'
                  : someSelected
                  ? 'bg-foreground/50 border-foreground'
                  : 'border-muted-foreground hover:border-muted'
              }`}
              title={allSelected ? 'Deselect all' : 'Select all'}
            >
              {allSelected && (
                <svg className="w-3 h-3 text-background" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              )}
              {someSelected && !allSelected && (
                <svg className="w-3 h-3 text-background" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 12h14" />
                </svg>
              )}
            </div>
          </div>
        )}
        <div>Benchmark</div>
        <div>Model</div>
        <div>Result</div>
        <div>Tags</div>
        <div>Status</div>
        <div className="text-right">Time</div>
      </div>
      
      {runs.map((run, index) => {
        const isSelected = selectedIds.has(run.run_id);
        const isCompleted = run.status === 'completed';
        const isFocused = focusedIndex === index;

        const tags = run.tags || [];
        const displayTags = tags.slice(0, 2);
        const moreTags = tags.length > 2 ? tags.length - 2 : 0;

        if (selectable) {
          return (
            <div
              key={run.run_id}
              onClick={(e) => handleRowClick(run.run_id, e)}
              onMouseEnter={() => onFocusChange?.(index)}
              className={`grid ${gridCols} gap-6 py-4 border-b border-border transition-colors cursor-pointer ${
                isSelected 
                  ? 'bg-warning-bg' 
                  : isFocused
                  ? 'bg-background-secondary'
                  : 'hover:bg-background-tertiary'
              }`}
            >
              <div className="flex items-center justify-center">
                <div
                  onClick={(e) => handleCheckboxClick(run.run_id, e)}
                  className={`w-4 h-4 border rounded-sm flex items-center justify-center transition-colors ${
                    isSelected
                      ? 'bg-foreground border-foreground'
                      : 'border-muted-foreground hover:border-muted'
                  }`}
                >
                  {isSelected && (
                    <svg className="w-3 h-3 text-background" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              </div>
              <div>
                <Link 
                  to={`/runs/${run.run_id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-[15px] text-foreground hover:underline"
                >
                  {run.benchmark}
                </Link>
              </div>
              <div>
                <span className="text-[14px] text-muted-foreground truncate block">
                  {run.model}
                </span>
              </div>
              <div>
                {isCompleted && run.primary_metric !== undefined && run.primary_metric !== null ? (
                  <span className="text-[15px] text-foreground tabular-nums font-light">
                    {formatMetric(run.primary_metric, run.primary_metric_name)}
                  </span>
                ) : (
                  <span className="text-[14px] text-muted-foreground">—</span>
                )}
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                {displayTags.map((tag) => (
                  <span
                    key={tag}
                    className="px-1.5 py-0.5 text-[10px] text-muted bg-background-tertiary border border-border-secondary"
                  >
                    {tag}
                  </span>
                ))}
                {moreTags > 0 && (
                  <span className="text-[10px] text-muted-foreground">+{moreTags}</span>
                )}
              </div>
              <div>
                <StatusIndicator status={run.status} />
              </div>
              <div className="text-right">
                <span className="text-[14px] text-muted-foreground">
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
            onMouseEnter={() => onFocusChange?.(index)}
            className={`grid ${gridCols} gap-6 py-4 border-b border-border transition-colors group ${
              isFocused 
                ? 'bg-background-secondary ring-1 ring-inset ring-border-secondary' 
                : 'hover:bg-background-tertiary'
            }`}
          >
            <div>
              <span className="text-[15px] text-foreground">
                {run.benchmark}
              </span>
            </div>
            <div>
              <span className="text-[14px] text-muted-foreground truncate block">
                {run.model}
              </span>
            </div>
            <div>
              {isCompleted && run.primary_metric !== undefined && run.primary_metric !== null ? (
                <span className="text-[15px] text-foreground tabular-nums font-light">
                  {formatMetric(run.primary_metric, run.primary_metric_name)}
                </span>
              ) : (
                <span className="text-[14px] text-muted-foreground">—</span>
              )}
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              {displayTags.map((tag) => (
                <span
                  key={tag}
                  className="px-1.5 py-0.5 text-[10px] text-muted bg-background-tertiary border border-border-secondary"
                >
                  {tag}
                </span>
              ))}
              {moreTags > 0 && (
                <span className="text-[10px] text-muted-foreground">+{moreTags}</span>
              )}
            </div>
            <div>
              <StatusIndicator status={run.status} />
            </div>
            <div className="text-right">
              <span className="text-[14px] text-muted-foreground">
                {formatDate(run.created_at)}
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
