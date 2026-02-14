import { useCallback, useEffect, useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api, RunFilters, RunSummary } from '../api/client';
import Layout from '../components/Layout';
import RunTable from '../components/RunTable';
import { useHotkeys } from '../hooks/useHotkeys';
import { useKeyboardShortcuts } from '../context/KeyboardShortcutsContext';

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'queued', label: 'Queued' },
  { value: 'running', label: 'Running' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'canceled', label: 'Canceled' },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [allBenchmarks, setAllBenchmarks] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [benchmarkFilter, setBenchmarkFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  
  // Selection mode state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Keyboard navigation state
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { isHelpOpen } = useKeyboardShortcuts();

  const loadRuns = useCallback(async () => {
    try {
      const filters: RunFilters = { limit: 100 };
      if (searchQuery.trim()) filters.search = searchQuery.trim();
      if (statusFilter) filters.status = statusFilter;
      if (tagFilter) filters.tag = tagFilter;
      if (benchmarkFilter) filters.benchmark = benchmarkFilter;
      
      const data = await api.listRuns(filters);
      setRuns(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load runs');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, statusFilter, tagFilter, benchmarkFilter]);

  const loadTags = useCallback(async () => {
    try {
      const tags = await api.listAllTags();
      setAllTags(tags);
    } catch {
      // Ignore tag loading errors
    }
  }, []);

  const loadBenchmarks = useCallback(async () => {
    try {
      const benchmarks = await api.listBenchmarks();
      const benchmarkNames = benchmarks.map(b => b.name);
      setAllBenchmarks(benchmarkNames);
    } catch {
      // Ignore benchmark loading errors
    }
  }, []);

  useEffect(() => {
    loadRuns();
    loadTags();
    loadBenchmarks();
    
    // Poll for updates every 3 seconds
    const interval = setInterval(loadRuns, 3000);
    return () => clearInterval(interval);
  }, [loadRuns, loadTags, loadBenchmarks]);

  const handleToggleSelectionMode = () => {
    if (selectionMode) {
      // Exit selection mode
      setSelectionMode(false);
      setSelectedIds(new Set());
    } else {
      // Enter selection mode
      setSelectionMode(true);
    }
  };

  const handleCompare = () => {
    if (selectedIds.size >= 2) {
      const idsParam = Array.from(selectedIds).join(',');
      navigate(`/compare?ids=${idsParam}`);
    }
  };

  const handleDelete = async () => {
    if (selectedIds.size === 0 || isDeleting) return;
    
    const confirmMessage = selectedIds.size === 1 
      ? 'Are you sure you want to delete this run?'
      : `Are you sure you want to delete ${selectedIds.size} runs?`;
    
    if (!confirm(confirmMessage)) return;
    
    setIsDeleting(true);
    try {
      const result = await api.bulkDeleteRuns(Array.from(selectedIds));
      
      // Show appropriate toast based on results
      if (result.summary.deleted > 0) {
        toast.success(`Deleted ${result.summary.deleted} run${result.summary.deleted > 1 ? 's' : ''}`);
      }
      
      if (result.summary.running > 0) {
        toast.error(`${result.summary.running} run${result.summary.running > 1 ? 's are' : ' is'} still running`);
      }
      
      if (result.summary.failed > 0 || result.summary.not_found > 0) {
        const failCount = result.summary.failed + result.summary.not_found;
        toast.error(`Failed to delete ${failCount} run${failCount > 1 ? 's' : ''}`);
      }
      
      // Clear selection and reload
      setSelectedIds(new Set());
      await loadRuns();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Failed to delete runs: ${errorMsg}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const stats = {
    total: runs.length,
    running: runs.filter((r) => r.status === 'running').length,
    completed: runs.filter((r) => r.status === 'completed').length,
    failed: runs.filter((r) => r.status === 'failed').length,
  };

  // Keyboard shortcuts
  
  // J - Move down in list
  useHotkeys('j', () => {
    if (isHelpOpen || runs.length === 0) return;
    setFocusedIndex(prev => {
      const newIndex = prev < runs.length - 1 ? prev + 1 : prev;
      return newIndex;
    });
  });

  // K - Move up in list
  useHotkeys('k', () => {
    if (isHelpOpen || runs.length === 0) return;
    setFocusedIndex(prev => {
      const newIndex = prev > 0 ? prev - 1 : 0;
      return newIndex;
    });
  });

  // Enter - Open focused run
  useHotkeys('enter', () => {
    if (isHelpOpen || focusedIndex < 0 || focusedIndex >= runs.length) return;
    const focusedRun = runs[focusedIndex];
    if (focusedRun) {
      navigate(`/runs/${focusedRun.run_id}`);
    }
  });

  // D - Delete focused run (with confirmation)
  useHotkeys('d', () => {
    if (isHelpOpen || focusedIndex < 0 || focusedIndex >= runs.length || isDeleting) return;
    const focusedRun = runs[focusedIndex];
    if (focusedRun) {
      const confirmMessage = `Are you sure you want to delete "${focusedRun.benchmark}" run?`;
      if (confirm(confirmMessage)) {
        api.bulkDeleteRuns([focusedRun.run_id])
          .then((result) => {
            if (result.summary.deleted > 0) {
              toast.success('Run deleted');
              loadRuns();
              // Adjust focus if needed
              setFocusedIndex(prev => Math.min(prev, runs.length - 2));
            } else if (result.summary.running > 0) {
              toast.error('Cannot delete a running run');
            } else {
              toast.error('Failed to delete run');
            }
          })
          .catch(() => {
            toast.error('Failed to delete run');
          });
      }
    }
  });

  // R - Refresh
  useHotkeys('r', () => {
    if (isHelpOpen) return;
    loadRuns();
    toast.success('Refreshed');
  });

  // / - Focus search
  useHotkeys('/', () => {
    if (isHelpOpen) return;
    searchInputRef.current?.focus();
  });

  // Escape - Clear focus/selection
  useHotkeys('escape', () => {
    if (isHelpOpen) return;
    if (document.activeElement === searchInputRef.current) {
      searchInputRef.current?.blur();
      return;
    }
    if (focusedIndex >= 0) {
      setFocusedIndex(-1);
    } else if (selectionMode) {
      setSelectionMode(false);
      setSelectedIds(new Set());
    }
  }, { enableOnInputs: true });

  return (
    <Layout>
      {/* Header Section */}
      <div className="mb-16">
        <div className="grid grid-cols-4 gap-8">
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-[0.1em] mb-4">
                Total
              </p>
              <p className="text-[32px] text-foreground tabular-nums">{stats.total}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-[0.1em] mb-4">
                Running
              </p>
              <p className="text-[32px] text-foreground tabular-nums">
                {stats.running > 0 && <span className="inline-block w-2 h-2 rounded-full bg-foreground mr-3 animate-pulse" />}
                {stats.running}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-[0.1em] mb-4">
                Completed
              </p>
              <p className="text-[32px] text-foreground tabular-nums">{stats.completed}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-[0.1em] mb-4">
                Failed
              </p>
              <p className="text-[32px] text-foreground tabular-nums">{stats.failed}</p>
            </div>
          </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-8 py-3 px-4 border border-border-secondary text-[14px] text-muted">
          {error}
        </div>
      )}

      {/* Runs Section */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-6">
            <p className="text-[11px] text-muted-foreground uppercase tracking-[0.1em]">
              Runs
            </p>
            
            {/* Selection Mode Toggle */}
            <button
              onClick={handleToggleSelectionMode}
              className={`text-[13px] transition-colors ${
                selectionMode 
                  ? 'text-foreground' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {selectionMode ? '✕ Cancel' : 'Select'}
            </button>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Action Buttons (when in selection mode) */}
            {selectionMode && (
              <>
                <button
                  onClick={handleDelete}
                  disabled={selectedIds.size === 0 || isDeleting}
                  className={`text-[13px] px-4 py-2 transition-all ${
                    selectedIds.size > 0 && !isDeleting
                      ? 'text-foreground bg-error-bg hover:bg-error/10 border border-error-border'
                      : 'text-muted-foreground bg-background-tertiary cursor-not-allowed border border-border'
                  }`}
                >
                  {isDeleting ? 'Deleting...' : `Delete ${selectedIds.size > 0 ? `(${selectedIds.size})` : ''}`}
                </button>
                <button
                  onClick={handleCompare}
                  disabled={selectedIds.size < 2}
                  className={`text-[13px] px-4 py-2 transition-all ${
                    selectedIds.size >= 2
                      ? 'text-accent-foreground bg-accent hover:opacity-90'
                      : 'text-muted-foreground bg-background-tertiary cursor-not-allowed'
                  }`}
                >
                  Compare {selectedIds.size > 0 && `(${selectedIds.size})`}
                </button>
              </>
            )}
            
            <Link
              to="/"
              className="text-[13px] text-foreground hover:opacity-70 transition-opacity"
            >
              New Run →
            </Link>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="mb-6 space-y-4">
          <div className="flex items-center gap-4">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search benchmarks and models..."
                className="w-full px-4 py-2.5 pl-10 pr-8 bg-background-secondary border border-border text-foreground text-[14px] placeholder-muted-foreground focus:border-border-secondary focus:outline-none transition-colors"
              />
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              {/* Keyboard hint */}
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground/50 pointer-events-none font-mono">
                /
              </span>
            </div>

            {/* Filter Toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`px-4 py-2.5 text-[13px] border transition-colors ${
                showFilters || statusFilter || tagFilter || benchmarkFilter
                  ? 'border-border-secondary text-foreground bg-background-tertiary'
                  : 'border-border text-muted-foreground hover:text-foreground hover:border-border-secondary'
              }`}
            >
              Filters
              {(statusFilter || tagFilter || benchmarkFilter) && (
                <span className="ml-2 px-1.5 py-0.5 text-[10px] bg-accent text-accent-foreground rounded-sm">
                  {[statusFilter, tagFilter, benchmarkFilter].filter(Boolean).length}
                </span>
              )}
            </button>
          </div>

          {/* Filter Dropdowns */}
          {showFilters && (
            <div className="flex items-center gap-4 pt-2">
              {/* Benchmark Filter */}
              {allBenchmarks.length > 0 && (
                <select
                  value={benchmarkFilter}
                  onChange={(e) => setBenchmarkFilter(e.target.value)}
                  className="px-3 py-2 bg-background-secondary border border-border text-foreground text-[13px] focus:border-border-secondary focus:outline-none transition-colors cursor-pointer appearance-none pr-8"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23666'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 8px center',
                    backgroundSize: '16px',
                  }}
                >
                  <option value="">All Benchmarks</option>
                  {allBenchmarks.map((benchmark) => (
                    <option key={benchmark} value={benchmark}>
                      {benchmark}
                    </option>
                  ))}
                </select>
              )}

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 bg-background-secondary border border-border text-foreground text-[13px] focus:border-border-secondary focus:outline-none transition-colors cursor-pointer appearance-none pr-8"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23666'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 8px center',
                  backgroundSize: '16px',
                }}
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>

              {/* Tag Filter */}
              {allTags.length > 0 && (
                <select
                  value={tagFilter}
                  onChange={(e) => setTagFilter(e.target.value)}
                  className="px-3 py-2 bg-background-secondary border border-border text-foreground text-[13px] focus:border-border-secondary focus:outline-none transition-colors cursor-pointer appearance-none pr-8"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23666'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 8px center',
                    backgroundSize: '16px',
                  }}
                >
                  <option value="">All Tags</option>
                  {allTags.map((tag) => (
                    <option key={tag} value={tag}>
                      {tag}
                    </option>
                  ))}
                </select>
              )}

              {/* Clear Filters */}
              {(statusFilter || tagFilter || benchmarkFilter || searchQuery) && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('');
                    setTagFilter('');
                    setBenchmarkFilter('');
                  }}
                  className="px-3 py-2 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  Clear all
                </button>
              )}
            </div>
          )}
        </div>
        
        {/* Selection Info */}
        {selectionMode && (
          <div className="mb-4 py-3 px-4 bg-background-tertiary border border-border text-[13px] text-muted">
            {selectedIds.size === 0 
              ? 'Click runs to select them for comparison or deletion'
              : selectedIds.size === 1
              ? '1 run selected'
              : `${selectedIds.size} runs selected`
            }
          </div>
        )}
        
        <RunTable 
          runs={runs} 
          loading={loading}
          selectable={selectionMode}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          focusedIndex={focusedIndex}
          onFocusChange={setFocusedIndex}
        />
      </div>
    </Layout>
  );
}
