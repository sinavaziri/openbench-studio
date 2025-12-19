import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, RunFilters, RunSummary } from '../api/client';
import Layout from '../components/Layout';
import RunTable from '../components/RunTable';

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
  
  // Compare mode state
  const [compareMode, setCompareMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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

  const handleToggleCompareMode = () => {
    if (compareMode) {
      // Exit compare mode
      setCompareMode(false);
      setSelectedIds(new Set());
    } else {
      // Enter compare mode
      setCompareMode(true);
    }
  };

  const handleCompare = () => {
    if (selectedIds.size >= 2) {
      const idsParam = Array.from(selectedIds).join(',');
      navigate(`/compare?ids=${idsParam}`);
    }
  };

  const stats = {
    total: runs.length,
    running: runs.filter((r) => r.status === 'running').length,
    completed: runs.filter((r) => r.status === 'completed').length,
    failed: runs.filter((r) => r.status === 'failed').length,
  };

  return (
    <Layout>
      {/* Header Section */}
      <div className="mb-16">
        <div className="grid grid-cols-4 gap-8">
            <div>
              <p className="text-[11px] text-[#666] uppercase tracking-[0.1em] mb-4">
                Total
              </p>
              <p className="text-[32px] text-white tabular-nums">{stats.total}</p>
            </div>
            <div>
              <p className="text-[11px] text-[#666] uppercase tracking-[0.1em] mb-4">
                Running
              </p>
              <p className="text-[32px] text-white tabular-nums">
                {stats.running > 0 && <span className="inline-block w-2 h-2 rounded-full bg-white mr-3 animate-pulse" />}
                {stats.running}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-[#666] uppercase tracking-[0.1em] mb-4">
                Completed
              </p>
              <p className="text-[32px] text-white tabular-nums">{stats.completed}</p>
            </div>
            <div>
              <p className="text-[11px] text-[#666] uppercase tracking-[0.1em] mb-4">
                Failed
              </p>
              <p className="text-[32px] text-white tabular-nums">{stats.failed}</p>
            </div>
          </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-8 py-3 px-4 border border-[#333] text-[14px] text-[#888]">
          {error}
        </div>
      )}

      {/* Runs Section */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-6">
            <p className="text-[11px] text-[#666] uppercase tracking-[0.1em]">
              Runs
            </p>
            
            {/* Compare Mode Toggle */}
            <button
              onClick={handleToggleCompareMode}
              className={`text-[13px] transition-colors ${
                compareMode 
                  ? 'text-white' 
                  : 'text-[#555] hover:text-white'
              }`}
            >
              {compareMode ? '✕ Cancel' : 'Compare'}
            </button>
          </div>
          
          <div className="flex items-center gap-6">
            {/* Compare Button (when in compare mode) */}
            {compareMode && (
              <button
                onClick={handleCompare}
                disabled={selectedIds.size < 2}
                className={`text-[13px] px-4 py-2 transition-all ${
                  selectedIds.size >= 2
                    ? 'text-black bg-white hover:bg-[#e0e0e0]'
                    : 'text-[#555] bg-[#222] cursor-not-allowed'
                }`}
              >
                Compare {selectedIds.size > 0 && `(${selectedIds.size})`}
              </button>
            )}
            
            <Link
              to="/"
              className="text-[13px] text-white hover:opacity-70 transition-opacity"
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
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search benchmarks and models..."
                className="w-full px-4 py-2.5 pl-10 bg-[#0a0a0a] border border-[#1a1a1a] text-white text-[14px] placeholder-[#444] focus:border-[#333] focus:outline-none transition-colors"
              />
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#444]"
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
            </div>

            {/* Filter Toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`px-4 py-2.5 text-[13px] border transition-colors ${
                showFilters || statusFilter || tagFilter || benchmarkFilter
                  ? 'border-[#333] text-white bg-[#111]'
                  : 'border-[#1a1a1a] text-[#666] hover:text-white hover:border-[#333]'
              }`}
            >
              Filters
              {(statusFilter || tagFilter || benchmarkFilter) && (
                <span className="ml-2 px-1.5 py-0.5 text-[10px] bg-white text-black rounded-sm">
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
                  className="px-3 py-2 bg-[#0a0a0a] border border-[#1a1a1a] text-white text-[13px] focus:border-[#333] focus:outline-none transition-colors cursor-pointer appearance-none pr-8"
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
                className="px-3 py-2 bg-[#0a0a0a] border border-[#1a1a1a] text-white text-[13px] focus:border-[#333] focus:outline-none transition-colors cursor-pointer appearance-none pr-8"
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
                  className="px-3 py-2 bg-[#0a0a0a] border border-[#1a1a1a] text-white text-[13px] focus:border-[#333] focus:outline-none transition-colors cursor-pointer appearance-none pr-8"
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
                  className="px-3 py-2 text-[12px] text-[#666] hover:text-white transition-colors"
                >
                  Clear all
                </button>
              )}
            </div>
          )}
        </div>
        
        {/* Selection Info */}
        {compareMode && (
          <div className="mb-4 py-3 px-4 bg-[#111] border border-[#1a1a1a] text-[13px] text-[#888]">
            {selectedIds.size === 0 
              ? 'Select at least 2 runs to compare'
              : selectedIds.size === 1
              ? 'Select 1 more run to compare'
              : `${selectedIds.size} runs selected`
            }
          </div>
        )}
        
        <RunTable 
          runs={runs} 
          loading={loading}
          selectable={compareMode}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
        />
      </div>
    </Layout>
  );
}
