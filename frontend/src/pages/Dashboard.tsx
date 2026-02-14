import { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api, RunFilters, RunSummary, RunDuplicateOverrides, RunConfig } from '../api/client';
import Layout from '../components/Layout';
import RunTable from '../components/RunTable';
import DuplicateRunModal from '../components/DuplicateRunModal';
import { InlineError } from '../components/ErrorBoundary';
import { useHotkeys } from '../hooks/useHotkeys';
import { useKeyboardShortcuts } from '../context/KeyboardShortcutsContext';
import { parseError } from '../utils/errorMessages';
import { exportSelectedRunsToCSV, exportSelectedRunsToJSON } from '../utils/export';
import { useDashboardWebSocket, DashboardRunEvent } from '../hooks/useWebSocket';
import ConnectionStatus from '../components/ConnectionStatus';

// Debounce hook for search input - reduces API calls
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);
  
  return debouncedValue;
}

const RUNS_PER_PAGE = 50;

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'queued', label: 'Queued' },
  { value: 'running', label: 'Running' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'canceled', label: 'Canceled' },
];

const SORT_OPTIONS = [
  { value: 'created_at:desc', label: 'Newest First' },
  { value: 'created_at:asc', label: 'Oldest First' },
  { value: 'benchmark:asc', label: 'Benchmark (A-Z)' },
  { value: 'benchmark:desc', label: 'Benchmark (Z-A)' },
  { value: 'model:asc', label: 'Model (A-Z)' },
  { value: 'model:desc', label: 'Model (Z-A)' },
];

const STORAGE_KEY = 'openbench_dashboard_filters';

interface SavedFilters {
  searchQuery: string;
  statusFilter: string;
  tagFilter: string;
  benchmarkFilter: string;
  sortOption: string;
  startDate: string;
  endDate: string;
}

function loadSavedFilters(): SavedFilters {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch {
    // Ignore parse errors
  }
  return {
    searchQuery: '',
    statusFilter: '',
    tagFilter: '',
    benchmarkFilter: '',
    sortOption: 'created_at:desc',
    startDate: '',
    endDate: '',
  };
}

function saveFilters(filters: SavedFilters): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  } catch {
    // Ignore storage errors
  }
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [scheduledRuns, setScheduledRuns] = useState<RunSummary[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [allBenchmarks, setAllBenchmarks] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingScheduled, setLoadingScheduled] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [totalRuns, setTotalRuns] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [activeTab, setActiveTab] = useState<'runs' | 'scheduled'>('runs');
  const [error, setError] = useState<{ title: string; message: string; action?: string; recoverable: boolean } | null>(null);
  
  // Load saved filters from localStorage
  const savedFilters = useMemo(() => loadSavedFilters(), []);
  
  // Filter state with debounced search (300ms delay)
  const [searchQuery, setSearchQuery] = useState(savedFilters.searchQuery);
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const [statusFilter, setStatusFilter] = useState(savedFilters.statusFilter);
  const [tagFilter, setTagFilter] = useState(savedFilters.tagFilter);
  const [benchmarkFilter, setBenchmarkFilter] = useState(savedFilters.benchmarkFilter);
  const [sortOption, setSortOption] = useState(savedFilters.sortOption);
  const [startDate, setStartDate] = useState(savedFilters.startDate);
  const [endDate, setEndDate] = useState(savedFilters.endDate);
  const [showFilters, setShowFilters] = useState(false);
  
  // Selection mode state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const exportDropdownRef = useRef<HTMLDivElement>(null);
  
  // Keyboard navigation state
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { isHelpOpen } = useKeyboardShortcuts();

  // Duplicate modal state
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateRunId, setDuplicateRunId] = useState<string | null>(null);
  const [isDuplicating, setIsDuplicating] = useState(false);

  // Calculate active filter count
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (searchQuery.trim()) count++;
    if (statusFilter) count++;
    if (tagFilter) count++;
    if (benchmarkFilter) count++;
    if (startDate) count++;
    if (endDate) count++;
    if (sortOption !== 'created_at:desc') count++;
    return count;
  }, [searchQuery, statusFilter, tagFilter, benchmarkFilter, startDate, endDate, sortOption]);

  // Persist filters to localStorage
  useEffect(() => {
    saveFilters({
      searchQuery,
      statusFilter,
      tagFilter,
      benchmarkFilter,
      sortOption,
      startDate,
      endDate,
    });
  }, [searchQuery, statusFilter, tagFilter, benchmarkFilter, sortOption, startDate, endDate]);

  // WebSocket for live updates
  const handleRunStatus = useCallback((event: DashboardRunEvent) => {
    setRuns((prevRuns) => 
      prevRuns.map((run) =>
        run.run_id === event.run_id
          ? { ...run, status: event.status as RunSummary['status'] }
          : run
      )
    );
  }, []);

  // Defined later, but declared here for useCallback dependency
  const loadRunsRef = useRef<() => void>(() => {});
  
  const handleRunCreated = useCallback((_event: DashboardRunEvent) => {
    // Reload runs to get the new run with full data
    loadRunsRef.current();
  }, []);

  const handleRunDeleted = useCallback((event: DashboardRunEvent) => {
    setRuns((prevRuns) => prevRuns.filter((run) => run.run_id !== event.run_id));
  }, []);

  const { status: wsStatus, reconnectAttempts } = useDashboardWebSocket({
    autoConnect: true,
    onRunStatus: handleRunStatus,
    onRunCreated: handleRunCreated,
    onRunDeleted: handleRunDeleted,
  });

  const loadRuns = useCallback(async () => {
    try {
      const [sortBy, sortOrder] = sortOption.split(':') as [RunFilters['sort_by'], RunFilters['sort_order']];
      
      const filters: RunFilters = { per_page: 100 };
      if (searchQuery.trim()) filters.search = searchQuery.trim();
      if (statusFilter) filters.status = statusFilter;
      if (tagFilter) filters.tag = tagFilter;
      if (benchmarkFilter) filters.benchmark = benchmarkFilter;
      if (startDate) filters.started_after = startDate;
      if (endDate) filters.started_before = endDate + 'T23:59:59'; // Include full day
      if (sortBy) filters.sort_by = sortBy;
      if (sortOrder) filters.sort_order = sortOrder;
      
      const response = await api.listRuns(filters);
      setRuns(response.runs);
      setError(null);
    } catch (err) {
      const parsed = parseError(err, 'loading-runs');
      setError({
        title: parsed.title,
        message: parsed.message,
        action: parsed.action,
        recoverable: parsed.recoverable,
      });
    } finally {
      setLoading(false);
    }
  }, [searchQuery, statusFilter, tagFilter, benchmarkFilter, sortOption, startDate, endDate]);

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

  const loadScheduledRuns = useCallback(async () => {
    try {
      setLoadingScheduled(true);
      const scheduled = await api.listScheduledRuns();
      setScheduledRuns(scheduled);
    } catch {
      // Ignore scheduled runs loading errors
    } finally {
      setLoadingScheduled(false);
    }
  }, []);

  // Update the ref when loadRuns changes
  useEffect(() => {
    loadRunsRef.current = loadRuns;
  }, [loadRuns]);

  useEffect(() => {
    loadRuns();
    loadTags();
    loadBenchmarks();
  }, [loadRuns, loadTags, loadBenchmarks]);

  // Fallback polling when WebSocket is not connected
  useEffect(() => {
    if (wsStatus === 'connected') {
      // WebSocket is connected, no need to poll
      return;
    }
    
    // Poll for updates every 5 seconds when WebSocket is disconnected
    const interval = setInterval(loadRuns, 5000);
    return () => clearInterval(interval);
  }, [wsStatus, loadRuns]);

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

  const handleSelectAll = useCallback(() => {
    if (runs.length === 0) return;
    
    // Enable selection mode if not already
    if (!selectionMode) {
      setSelectionMode(true);
    }
    
    // If all are selected, deselect all; otherwise select all
    const allSelected = runs.every(run => selectedIds.has(run.run_id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(runs.map(run => run.run_id)));
    }
  }, [runs, selectionMode, selectedIds]);

  const handleBulkExportCSV = useCallback(() => {
    if (selectedIds.size === 0) return;
    exportSelectedRunsToCSV(runs, selectedIds);
    toast.success(`Exported ${selectedIds.size} run${selectedIds.size > 1 ? 's' : ''} to CSV`);
    setShowExportDropdown(false);
  }, [runs, selectedIds]);

  const handleBulkExportJSON = useCallback(() => {
    if (selectedIds.size === 0) return;
    exportSelectedRunsToJSON(runs, selectedIds);
    toast.success(`Exported ${selectedIds.size} run${selectedIds.size > 1 ? 's' : ''} to JSON`);
    setShowExportDropdown(false);
  }, [runs, selectedIds]);

  const handleCompare = () => {
    if (selectedIds.size >= 2) {
      const idsParam = Array.from(selectedIds).join(',');
      navigate(`/compare?ids=${idsParam}`);
    }
  };

  const handleOpenDuplicateModal = () => {
    if (selectedIds.size !== 1) return;
    const runId = Array.from(selectedIds)[0];
    setDuplicateRunId(runId);
    setShowDuplicateModal(true);
  };

  const handleDuplicate = async (overrides: RunDuplicateOverrides) => {
    if (!duplicateRunId) return;
    setIsDuplicating(true);
    try {
      const result = await api.duplicateRun(duplicateRunId, overrides);
      toast.success('Duplicate run started', { icon: '🔄' });
      setShowDuplicateModal(false);
      setDuplicateRunId(null);
      setSelectedIds(new Set());
      navigate(`/runs/${result.run_id}`);
    } catch (err) {
      const parsed = parseError(err, 'duplicating-run');
      toast.error(parsed.message);
    } finally {
      setIsDuplicating(false);
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
      const parsed = parseError(err, 'deleting-run');
      toast.error(parsed.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleClearAllFilters = () => {
    setSearchQuery('');
    setStatusFilter('');
    setTagFilter('');
    setBenchmarkFilter('');
    setSortOption('created_at:desc');
    setStartDate('');
    setEndDate('');
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
    if (showExportDropdown) {
      setShowExportDropdown(false);
      return;
    }
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

  // Ctrl+A / Cmd+A - Select all runs
  useHotkeys('ctrl+a', (e) => {
    if (isHelpOpen) return;
    e.preventDefault();
    handleSelectAll();
  });
  useHotkeys('meta+a', (e) => {
    if (isHelpOpen) return;
    e.preventDefault();
    handleSelectAll();
  });

  // Delete / Backspace - Bulk delete selected runs
  useHotkeys('delete', () => {
    if (isHelpOpen || !selectionMode || selectedIds.size === 0 || isDeleting) return;
    handleDelete();
  });
  useHotkeys('backspace', () => {
    if (isHelpOpen || !selectionMode || selectedIds.size === 0 || isDeleting) return;
    // Only trigger if not in an input
    if (document.activeElement?.tagName === 'INPUT') return;
    handleDelete();
  });

  // Close export dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(e.target as Node)) {
        setShowExportDropdown(false);
      }
    };
    
    if (showExportDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showExportDropdown]);

  return (
    <Layout>
      {/* Header Section */}
      <div className="mb-16">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-[11px] text-muted-foreground uppercase tracking-[0.1em]">
            Overview
          </h1>
          <ConnectionStatus 
            status={wsStatus} 
            reconnectAttempts={reconnectAttempts}
          />
        </div>
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
        <div className="mb-8">
          <InlineError
            title={error.title}
            message={error.message}
            action={error.action}
            onRetry={error.recoverable ? () => {
              setError(null);
              loadRuns();
            } : undefined}
            onDismiss={() => setError(null)}
          />
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
                
                {/* Export Dropdown */}
                <div className="relative" ref={exportDropdownRef}>
                  <button
                    onClick={() => setShowExportDropdown(!showExportDropdown)}
                    disabled={selectedIds.size === 0}
                    className={`text-[13px] px-4 py-2 transition-all flex items-center gap-1 ${
                      selectedIds.size > 0
                        ? 'text-foreground bg-background-secondary hover:bg-background-tertiary border border-border'
                        : 'text-muted-foreground bg-background-tertiary cursor-not-allowed border border-border'
                    }`}
                  >
                    Export {selectedIds.size > 0 && `(${selectedIds.size})`}
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  
                  {showExportDropdown && selectedIds.size > 0 && (
                    <div className="absolute right-0 top-full mt-1 w-32 bg-background-secondary border border-border shadow-lg z-10">
                      <button
                        onClick={handleBulkExportCSV}
                        className="w-full px-4 py-2 text-[13px] text-foreground hover:bg-background-tertiary text-left transition-colors"
                      >
                        CSV
                      </button>
                      <button
                        onClick={handleBulkExportJSON}
                        className="w-full px-4 py-2 text-[13px] text-foreground hover:bg-background-tertiary text-left transition-colors"
                      >
                        JSON
                      </button>
                    </div>
                  )}
                </div>
                
                <button
                  onClick={handleOpenDuplicateModal}
                  disabled={selectedIds.size !== 1 || isDuplicating}
                  className={`text-[13px] px-4 py-2 transition-all ${
                    selectedIds.size === 1 && !isDuplicating
                      ? 'text-foreground bg-background-secondary hover:bg-background-tertiary border border-border'
                      : 'text-muted-foreground bg-background-tertiary cursor-not-allowed border border-border'
                  }`}
                  title={selectedIds.size !== 1 ? 'Select exactly one run to duplicate' : 'Duplicate this run'}
                >
                  {isDuplicating ? 'Duplicating...' : 'Duplicate'}
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

        {/* Search and Filters - only show on runs tab */}
        {activeTab === 'runs' && (
        <div className="mb-6 space-y-4">
          <div className="flex items-center gap-4">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search benchmarks, models, notes, tags..."
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

            {/* Sort Dropdown */}
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value)}
              className="px-3 py-2.5 bg-background-secondary border border-border text-foreground text-[13px] focus:border-border-secondary focus:outline-none transition-colors cursor-pointer appearance-none pr-8"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23666'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 8px center',
                backgroundSize: '16px',
              }}
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            {/* Filter Toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`px-4 py-2.5 text-[13px] border transition-colors flex items-center gap-2 ${
                showFilters || activeFilterCount > 0
                  ? 'border-border-secondary text-foreground bg-background-tertiary'
                  : 'border-border text-muted-foreground hover:text-foreground hover:border-border-secondary'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              Filters
              {activeFilterCount > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] bg-accent text-accent-foreground rounded-sm font-medium">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>

          {/* Filter Dropdowns */}
          {showFilters && (
            <div className="flex items-center gap-4 pt-2 flex-wrap">
              {/* Date Range */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground uppercase tracking-[0.1em]">From</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="px-3 py-2 bg-background-secondary border border-border text-foreground text-[13px] focus:border-border-secondary focus:outline-none transition-colors"
                />
                <span className="text-[11px] text-muted-foreground uppercase tracking-[0.1em]">To</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="px-3 py-2 bg-background-secondary border border-border text-foreground text-[13px] focus:border-border-secondary focus:outline-none transition-colors"
                />
              </div>

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

              {/* Clear All Filters */}
              {activeFilterCount > 0 && (
                <button
                  onClick={handleClearAllFilters}
                  className="px-3 py-2 text-[12px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Clear all filters
                </button>
              )}
            </div>
          )}
        </div>
        )}
        
        {/* Selection Info - only show on runs tab */}
        {activeTab === 'runs' && selectionMode && (
          <div className="mb-4 py-3 px-4 bg-background-tertiary border border-border text-[13px] text-muted flex items-center justify-between">
            <span>
              {selectedIds.size === 0 
                ? 'Click runs to select them for comparison, deletion, or export'
                : selectedIds.size === 1
                ? '1 run selected'
                : `${selectedIds.size} runs selected`
              }
            </span>
            <span className="text-muted-foreground text-[11px]">
              <kbd className="px-1.5 py-0.5 bg-background border border-border rounded text-[10px] font-mono">⌘A</kbd>
              {' '}select all
              {selectedIds.size > 0 && (
                <>
                  {' · '}
                  <kbd className="px-1.5 py-0.5 bg-background border border-border rounded text-[10px] font-mono">⌫</kbd>
                  {' '}delete
                </>
              )}
            </span>
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
          onSelectAll={handleSelectAll}
          searchQuery={searchQuery}
        />
      </div>

      {/* Duplicate Run Modal */}
      {duplicateRunId && (() => {
        const selectedRun = runs.find(r => r.run_id === duplicateRunId);
        if (!selectedRun) return null;
        
        // Build a minimal config from the run summary
        const config: RunConfig = {
          benchmark: selectedRun.benchmark,
          model: selectedRun.model,
        };
        
        return (
          <DuplicateRunModal
            isOpen={showDuplicateModal}
            onClose={() => {
              setShowDuplicateModal(false);
              setDuplicateRunId(null);
            }}
            onDuplicate={handleDuplicate}
            originalConfig={config}
            originalModel={selectedRun.model}
            benchmark={selectedRun.benchmark}
            isSubmitting={isDuplicating}
          />
        );
      })()}
    </Layout>
  );
}

// =============================================================================
// Scheduled Runs Table Component
// =============================================================================

function ScheduledRunsTable({ 
  runs, 
  loading, 
  onCancel,
  onUpdate,
}: { 
  runs: RunSummary[];
  loading: boolean;
  onCancel: (runId: string) => void;
  onUpdate: (runId: string, scheduledFor: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  
  if (loading) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        Loading scheduled runs...
      </div>
    );
  }
  
  if (runs.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-[14px] text-muted-foreground mb-4">
          No scheduled runs
        </p>
        <p className="text-[13px] text-muted-foreground">
          Schedule a run from the New Run page to see it here.
        </p>
      </div>
    );
  }
  
  const startEdit = (run: RunSummary) => {
    if (run.scheduled_for) {
      const date = new Date(run.scheduled_for);
      setEditDate(date.toISOString().split('T')[0]);
      setEditTime(date.toTimeString().slice(0, 5));
    }
    setEditingId(run.run_id);
  };
  
  const saveEdit = (runId: string) => {
    if (editDate && editTime) {
      const scheduledFor = new Date(`${editDate}T${editTime}`).toISOString();
      onUpdate(runId, scheduledFor);
    }
    setEditingId(null);
  };
  
  const formatCountdown = (scheduledFor: string) => {
    const now = new Date();
    const scheduled = new Date(scheduledFor);
    const diff = scheduled.getTime() - now.getTime();
    
    if (diff < 0) return 'Starting soon...';
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `in ${days} day${days > 1 ? 's' : ''}`;
    } else if (hours > 0) {
      return `in ${hours}h ${minutes}m`;
    } else {
      return `in ${minutes}m`;
    }
  };
  
  return (
    <div className="space-y-3">
      {runs.map((run) => (
        <div 
          key={run.run_id}
          className="p-4 border border-border bg-background-secondary hover:bg-background-tertiary transition-colors"
        >
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-[15px] text-foreground font-medium">
                  {run.benchmark}
                </span>
                <span className="text-[13px] text-muted-foreground">
                  {run.model}
                </span>
              </div>
              
              {editingId === run.run_id ? (
                <div className="flex items-center gap-2 mt-3">
                  <input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="px-2 py-1 bg-background border border-border text-foreground text-[13px]"
                  />
                  <input
                    type="time"
                    value={editTime}
                    onChange={(e) => setEditTime(e.target.value)}
                    className="px-2 py-1 bg-background border border-border text-foreground text-[13px]"
                  />
                  <button
                    onClick={() => saveEdit(run.run_id)}
                    className="px-3 py-1 text-[12px] text-accent-foreground bg-accent hover:opacity-90"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="px-3 py-1 text-[12px] text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-4 text-[13px]">
                  <span className="text-muted-foreground">
                    📅 {run.scheduled_for && new Date(run.scheduled_for).toLocaleString()}
                  </span>
                  <span className="text-accent font-medium">
                    {run.scheduled_for && formatCountdown(run.scheduled_for)}
                  </span>
                </div>
              )}
            </div>
            
            {editingId !== run.run_id && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => startEdit(run)}
                  className="px-3 py-1.5 text-[12px] text-muted-foreground hover:text-foreground border border-border hover:border-border-secondary transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => onCancel(run.run_id)}
                  className="px-3 py-1.5 text-[12px] text-error-foreground bg-error-bg border border-error-border hover:bg-error/10 transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
