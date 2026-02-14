import { memo } from 'react';
import { Link } from 'react-router-dom';
import type { RunSummary } from '../api/client';

// Highlight matching text in search results
function HighlightedText({ text, highlight }: { text: string; highlight?: string }) {
  if (!highlight || !highlight.trim()) {
    return <>{text}</>;
  }
  
  const regex = new RegExp(`(${highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);
  
  return (
    <>
      {parts.map((part, i) => 
        regex.test(part) ? (
          <mark key={i} className="bg-warning-bg text-warning-foreground px-0.5 rounded-sm">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
}

// Generate a consistent color for a tag based on its content
function getTagColor(tag: string): string {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  const colors = [
    'rgba(59, 130, 246, 0.15)',   // blue
    'rgba(16, 185, 129, 0.15)',   // green
    'rgba(245, 158, 11, 0.15)',   // amber
    'rgba(239, 68, 68, 0.15)',    // red
    'rgba(139, 92, 246, 0.15)',   // purple
    'rgba(236, 72, 153, 0.15)',   // pink
    'rgba(6, 182, 212, 0.15)',    // cyan
    'rgba(249, 115, 22, 0.15)',   // orange
  ];
  
  return colors[Math.abs(hash) % colors.length];
}

interface RunTableProps {
  runs: RunSummary[];
  loading?: boolean;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  focusedIndex?: number;
  onFocusChange?: (index: number) => void;
  onSelectAll?: () => void;
  searchQuery?: string;
}

const StatusIndicator = memo(function StatusIndicator({ status }: { status: RunSummary['status'] }) {
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
});

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

// Mobile Card Component
function RunCard({ 
  run, 
  selectable, 
  isSelected, 
  isFocused, 
  onSelect, 
  onFocus,
  searchQuery = '',
}: { 
  run: RunSummary; 
  selectable: boolean; 
  isSelected: boolean; 
  isFocused: boolean;
  onSelect?: () => void;
  onFocus?: () => void;
  searchQuery?: string;
}) {
  const isCompleted = run.status === 'completed';
  const tags = run.tags || [];
  const displayTags = tags.slice(0, 3);
  const moreTags = tags.length > 3 ? tags.length - 3 : 0;

  const handleCardClick = (e: React.MouseEvent) => {
    if (selectable && onSelect) {
      e.preventDefault();
      onSelect();
    }
  };

  const baseClassName = `block p-4 border border-border transition-colors min-h-[44px] ${
    isSelected 
      ? 'bg-warning-bg border-warning-border' 
      : isFocused
      ? 'bg-background-secondary'
      : 'bg-background-secondary hover:bg-background-tertiary'
  } ${selectable ? 'cursor-pointer' : ''}`;

  const innerContent = (
    <>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          {selectable ? (
            <Link 
              to={`/runs/${run.run_id}`}
              onClick={(e) => e.stopPropagation()}
              className="text-[15px] text-foreground font-medium hover:underline block truncate"
            >
              <HighlightedText text={run.benchmark} highlight={searchQuery} />
            </Link>
          ) : (
            <span className="text-[15px] text-foreground font-medium block truncate">
              <HighlightedText text={run.benchmark} highlight={searchQuery} />
            </span>
          )}
          <span className="text-[13px] text-muted-foreground block truncate mt-0.5">
            <HighlightedText text={run.model} highlight={searchQuery} />
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {selectable && (
            <div
              onClick={(e) => {
                e.stopPropagation();
                onSelect?.();
              }}
              className={`w-5 h-5 border rounded-sm flex items-center justify-center transition-colors min-w-[44px] min-h-[44px] -m-2 ${
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
          )}
        </div>
      </div>
      
      <div className="flex flex-wrap items-center gap-3 text-[13px]">
        <StatusIndicator status={run.status} />
        
        {isCompleted && run.primary_metric !== undefined && run.primary_metric !== null && (
          <>
            <span className="text-muted-foreground">•</span>
            <span className="text-foreground tabular-nums font-medium">
              {formatMetric(run.primary_metric, run.primary_metric_name)}
            </span>
          </>
        )}
        
        <span className="text-muted-foreground">•</span>
        <span className="text-muted-foreground">
          {formatDate(run.created_at)}
        </span>
      </div>
      
      {displayTags.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap mt-3">
          {displayTags.map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 text-[11px] text-muted border border-border-secondary rounded-sm"
              style={{ backgroundColor: getTagColor(tag) }}
            >
              <HighlightedText text={tag} highlight={searchQuery} />
            </span>
          ))}
          {moreTags > 0 && (
            <span className="text-[11px] text-muted-foreground">+{moreTags}</span>
          )}
        </div>
      )}
    </>
  );

  if (selectable) {
    return (
      <div onClick={handleCardClick} onMouseEnter={onFocus} className={baseClassName}>
        {innerContent}
      </div>
    );
  }

  return (
    <Link to={`/runs/${run.run_id}`} onMouseEnter={onFocus} className={baseClassName}>
      {innerContent}
    </Link>
  );
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
  searchQuery = '',
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
      <>
        {/* Desktop Loading State */}
        <div className="hidden md:block border-t border-border">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 border-b border-border animate-pulse">
              <div className="h-full flex items-center">
                <div className="w-32 h-4 bg-border rounded" />
              </div>
            </div>
          ))}
        </div>
        
        {/* Mobile Loading State */}
        <div className="md:hidden space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-24 bg-background-secondary border border-border animate-pulse rounded" />
          ))}
        </div>
      </>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="border-t border-border py-16 text-center">
        <p className="text-[15px] text-muted-foreground mb-4">No runs yet</p>
        <Link
          to="/"
          className="text-[14px] text-foreground hover:opacity-70 transition-opacity inline-flex items-center justify-center min-h-[44px]"
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
    <>
      {/* Mobile Card View */}
      <div className="md:hidden space-y-3">
        {selectable && (
          <div className="flex items-center justify-between py-2 px-1">
            <button
              onClick={handleSelectAllClick}
              className="text-[13px] text-muted-foreground hover:text-foreground transition-colors min-h-[44px] flex items-center gap-2"
            >
              <div
                className={`w-4 h-4 border rounded-sm flex items-center justify-center transition-colors ${
                  allSelected
                    ? 'bg-foreground border-foreground'
                    : someSelected
                    ? 'bg-foreground/50 border-foreground'
                    : 'border-muted-foreground'
                }`}
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
              {allSelected ? 'Deselect all' : 'Select all'}
            </button>
          </div>
        )}
        
        {runs.map((run, index) => (
          <RunCard
            key={run.run_id}
            run={run}
            selectable={selectable}
            isSelected={selectedIds.has(run.run_id)}
            isFocused={focusedIndex === index}
            onSelect={() => {
              if (onSelectionChange) {
                const newSelection = new Set(selectedIds);
                if (newSelection.has(run.run_id)) {
                  newSelection.delete(run.run_id);
                } else {
                  newSelection.add(run.run_id);
                }
                onSelectionChange(newSelection);
              }
            }}
            onFocus={() => onFocusChange?.(index)}
            searchQuery={searchQuery}
          />
        ))}
      </div>
      
      {/* Desktop Table View */}
      <div className="hidden md:block border-t border-border">
        {/* Header */}
        <div className={`grid ${gridCols} gap-4 lg:gap-6 py-3 border-b border-border text-[11px] text-muted-foreground uppercase tracking-[0.1em]`}>
          {selectable && (
            <div className="flex items-center justify-center">
              <div
                onClick={handleSelectAllClick}
                className={`w-4 h-4 border rounded-sm flex items-center justify-center transition-colors cursor-pointer min-w-[44px] min-h-[44px] ${
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
                className={`grid ${gridCols} gap-4 lg:gap-6 py-4 border-b border-border transition-colors cursor-pointer ${
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
                    className={`w-4 h-4 border rounded-sm flex items-center justify-center transition-colors min-w-[44px] min-h-[44px] ${
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
                    <HighlightedText text={run.benchmark} highlight={searchQuery} />
                  </Link>
                </div>
                <div>
                  <span className="text-[14px] text-muted-foreground truncate block">
                    <HighlightedText text={run.model} highlight={searchQuery} />
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
                      className="px-1.5 py-0.5 text-[10px] text-muted border border-border-secondary"
                      style={{ backgroundColor: getTagColor(tag) }}
                    >
                      <HighlightedText text={tag} highlight={searchQuery} />
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
              className={`grid ${gridCols} gap-4 lg:gap-6 py-4 border-b border-border transition-colors group ${
                isFocused 
                  ? 'bg-background-secondary ring-1 ring-inset ring-border-secondary' 
                  : 'hover:bg-background-tertiary'
              }`}
            >
              <div>
                <span className="text-[15px] text-foreground">
                  <HighlightedText text={run.benchmark} highlight={searchQuery} />
                </span>
              </div>
              <div>
                <span className="text-[14px] text-muted-foreground truncate block">
                  <HighlightedText text={run.model} highlight={searchQuery} />
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
                    className="px-1.5 py-0.5 text-[10px] text-muted border border-border-secondary"
                    style={{ backgroundColor: getTagColor(tag) }}
                  >
                    <HighlightedText text={tag} highlight={searchQuery} />
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
    </>
  );
}
