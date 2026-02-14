/**
 * Data Export Utilities for OpenBench Studio
 * Supports CSV and JSON export with proper formatting
 */

import { RunSummary, RunDetail } from '../api/client';

// =============================================================================
// Types
// =============================================================================

export interface ExportOptions {
  filename?: string;
  includeTimestamp?: boolean;
}

// =============================================================================
// Filename Helpers
// =============================================================================

function getTimestamp(): string {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);
}

function generateFilename(prefix: string, extension: 'csv' | 'json', options?: ExportOptions): string {
  const parts = [prefix];
  
  if (options?.includeTimestamp !== false) {
    parts.push(getTimestamp());
  }
  
  if (options?.filename) {
    parts.push(sanitizeFilename(options.filename));
  }
  
  return `${parts.join('_')}.${extension}`;
}

// =============================================================================
// CSV Utilities
// =============================================================================

function escapeCSV(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  
  const str = String(value);
  
  // Check if we need to quote the value
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    // Escape quotes by doubling them
    return `"${str.replace(/"/g, '""')}"`;
  }
  
  return str;
}

function arrayToCSV(headers: string[], rows: unknown[][]): string {
  const headerLine = headers.map(escapeCSV).join(',');
  const dataLines = rows.map(row => row.map(escapeCSV).join(','));
  return [headerLine, ...dataLines].join('\n');
}

// =============================================================================
// Download Helpers
// =============================================================================

function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  // Clean up the URL object
  URL.revokeObjectURL(url);
}

function downloadJSON(data: unknown, filename: string): void {
  const content = JSON.stringify(data, null, 2);
  downloadFile(content, filename, 'application/json');
}

function downloadCSV(content: string, filename: string): void {
  downloadFile(content, filename, 'text/csv');
}

// =============================================================================
// Run History Export
// =============================================================================

export function exportRunsToCSV(runs: RunSummary[], options?: ExportOptions): void {
  const headers = [
    'Run ID',
    'Benchmark',
    'Model',
    'Status',
    'Created At',
    'Finished At',
    'Primary Metric',
    'Primary Metric Name',
    'Tags',
  ];
  
  const rows = runs.map(run => [
    run.run_id,
    run.benchmark,
    run.model,
    run.status,
    run.created_at,
    run.finished_at || '',
    run.primary_metric?.toString() || '',
    run.primary_metric_name || '',
    run.tags.join('; '),
  ]);
  
  const csv = arrayToCSV(headers, rows);
  const filename = generateFilename('openbench_runs', 'csv', options);
  downloadCSV(csv, filename);
}

export function exportRunsToJSON(runs: RunSummary[], options?: ExportOptions): void {
  const exportData = {
    exported_at: new Date().toISOString(),
    total_runs: runs.length,
    runs: runs,
  };
  
  const filename = generateFilename('openbench_runs', 'json', options);
  downloadJSON(exportData, filename);
}

// =============================================================================
// Single Run Export
// =============================================================================

export function exportRunDetailToCSV(run: RunDetail, options?: ExportOptions): void {
  // For a single run, we create a detailed CSV with sections
  const lines: string[] = [];
  
  // Header section
  lines.push('# Run Details');
  lines.push(`Run ID,${escapeCSV(run.run_id)}`);
  lines.push(`Benchmark,${escapeCSV(run.benchmark)}`);
  lines.push(`Model,${escapeCSV(run.model)}`);
  lines.push(`Status,${escapeCSV(run.status)}`);
  lines.push(`Created At,${escapeCSV(run.created_at)}`);
  if (run.started_at) lines.push(`Started At,${escapeCSV(run.started_at)}`);
  if (run.finished_at) lines.push(`Finished At,${escapeCSV(run.finished_at)}`);
  if (run.exit_code !== undefined) lines.push(`Exit Code,${run.exit_code}`);
  if (run.tags.length > 0) lines.push(`Tags,${escapeCSV(run.tags.join('; '))}`);
  lines.push('');
  
  // Configuration section
  if (run.config) {
    lines.push('# Configuration');
    Object.entries(run.config).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        lines.push(`${escapeCSV(key)},${escapeCSV(value)}`);
      }
    });
    lines.push('');
  }
  
  // Results section
  if (run.summary) {
    lines.push('# Results');
    
    // Primary metric
    if (run.summary.primary_metric) {
      const pm = run.summary.primary_metric;
      const unit = pm.unit ? ` (${pm.unit})` : '';
      lines.push(`Primary Metric: ${escapeCSV(pm.name)}${unit},${pm.value}`);
    }
    
    // Other metrics
    if (run.summary.metrics.length > 0) {
      lines.push('');
      lines.push('Metric,Value,Unit');
      run.summary.metrics.forEach(metric => {
        lines.push(`${escapeCSV(metric.name)},${metric.value},${escapeCSV(metric.unit || '')}`);
      });
    }
    
    // Breakdowns
    if (run.summary.breakdowns.length > 0) {
      run.summary.breakdowns.forEach(breakdown => {
        lines.push('');
        lines.push(`# Breakdown: ${escapeCSV(breakdown.name)}`);
        lines.push('Category,Value,Unit');
        breakdown.items.forEach(item => {
          lines.push(`${escapeCSV(item.key)},${item.value},${escapeCSV(item.unit || '')}`);
        });
      });
    }
  }
  
  const filename = generateFilename(
    `openbench_run_${run.benchmark}_${run.model.split('/').pop() || run.model}`,
    'csv',
    options
  );
  downloadCSV(lines.join('\n'), filename);
}

export function exportRunDetailToJSON(run: RunDetail, options?: ExportOptions): void {
  const exportData = {
    exported_at: new Date().toISOString(),
    run: run,
  };
  
  const filename = generateFilename(
    `openbench_run_${run.benchmark}_${run.model.split('/').pop() || run.model}`,
    'json',
    options
  );
  downloadJSON(exportData, filename);
}

// =============================================================================
// Comparison Export
// =============================================================================

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

export interface ComparisonData {
  runs: RunDetail[];
  metrics: CompareMetric[];
  breakdowns: CompareBreakdown[];
}

export function exportComparisonToCSV(data: ComparisonData, options?: ExportOptions): void {
  const { runs, metrics, breakdowns } = data;
  const lines: string[] = [];
  
  // Header with run info
  const modelHeaders = runs.map(r => escapeCSV(r.model));
  const benchmarkHeaders = runs.map(r => escapeCSV(r.benchmark));
  
  lines.push('# Comparison Export');
  lines.push(`Exported At,${new Date().toISOString()}`);
  lines.push(`Runs Compared,${runs.length}`);
  lines.push('');
  
  // Run details row
  lines.push('# Run Information');
  lines.push(['Run ID', ...runs.map(r => r.run_id)].join(','));
  lines.push(['Benchmark', ...benchmarkHeaders].join(','));
  lines.push(['Model', ...modelHeaders].join(','));
  lines.push(['Status', ...runs.map(r => r.status)].join(','));
  lines.push(['Created At', ...runs.map(r => r.created_at)].join(','));
  lines.push('');
  
  // Metrics section
  if (metrics.length > 0) {
    lines.push('# Metrics');
    lines.push(['Metric', ...modelHeaders].join(','));
    metrics.forEach(metric => {
      const values = metric.values.map(v => v?.toString() ?? '');
      lines.push([escapeCSV(metric.name), ...values].join(','));
    });
    lines.push('');
  }
  
  // Breakdowns section
  breakdowns.forEach(breakdown => {
    lines.push(`# Breakdown: ${escapeCSV(breakdown.name)}`);
    lines.push(['Category', ...modelHeaders].join(','));
    breakdown.items.forEach(item => {
      const values = item.values.map(v => v?.toString() ?? '');
      lines.push([escapeCSV(item.key), ...values].join(','));
    });
    lines.push('');
  });
  
  const benchmarkName = [...new Set(runs.map(r => r.benchmark))].join('_');
  const filename = generateFilename(
    `openbench_comparison_${benchmarkName}`,
    'csv',
    options
  );
  downloadCSV(lines.join('\n'), filename);
}

export function exportComparisonToJSON(data: ComparisonData, options?: ExportOptions): void {
  const exportData = {
    exported_at: new Date().toISOString(),
    runs_compared: data.runs.length,
    runs: data.runs.map(run => ({
      run_id: run.run_id,
      benchmark: run.benchmark,
      model: run.model,
      status: run.status,
      created_at: run.created_at,
      finished_at: run.finished_at,
      config: run.config,
      summary: run.summary,
      tags: run.tags,
    })),
    comparison: {
      metrics: data.metrics,
      breakdowns: data.breakdowns,
    },
  };
  
  const benchmarkName = [...new Set(data.runs.map(r => r.benchmark))].join('_');
  const filename = generateFilename(
    `openbench_comparison_${benchmarkName}`,
    'json',
    options
  );
  downloadJSON(exportData, filename);
}

// =============================================================================
// Filtered Export (for Dashboard with filters)
// =============================================================================

export interface FilteredExportOptions extends ExportOptions {
  filters?: {
    status?: string;
    benchmark?: string;
    tag?: string;
    search?: string;
  };
}

export function exportFilteredRunsToCSV(
  runs: RunSummary[],
  options?: FilteredExportOptions
): void {
  const headers = [
    'Run ID',
    'Benchmark',
    'Model',
    'Status',
    'Created At',
    'Finished At',
    'Primary Metric',
    'Primary Metric Name',
    'Tags',
  ];
  
  const rows = runs.map(run => [
    run.run_id,
    run.benchmark,
    run.model,
    run.status,
    run.created_at,
    run.finished_at || '',
    run.primary_metric?.toString() || '',
    run.primary_metric_name || '',
    run.tags.join('; '),
  ]);
  
  const csv = arrayToCSV(headers, rows);
  
  // Build filename based on filters
  const filterParts: string[] = ['openbench_runs'];
  if (options?.filters?.benchmark) {
    filterParts.push(sanitizeFilename(options.filters.benchmark));
  }
  if (options?.filters?.status) {
    filterParts.push(options.filters.status);
  }
  if (options?.filters?.tag) {
    filterParts.push(sanitizeFilename(options.filters.tag));
  }
  
  const filename = generateFilename(filterParts.join('_'), 'csv', options);
  downloadCSV(csv, filename);
}

export function exportFilteredRunsToJSON(
  runs: RunSummary[],
  options?: FilteredExportOptions
): void {
  const exportData = {
    exported_at: new Date().toISOString(),
    total_runs: runs.length,
    filters_applied: options?.filters || {},
    runs: runs,
  };
  
  // Build filename based on filters
  const filterParts: string[] = ['openbench_runs'];
  if (options?.filters?.benchmark) {
    filterParts.push(sanitizeFilename(options.filters.benchmark));
  }
  if (options?.filters?.status) {
    filterParts.push(options.filters.status);
  }
  if (options?.filters?.tag) {
    filterParts.push(sanitizeFilename(options.filters.tag));
  }
  
  const filename = generateFilename(filterParts.join('_'), 'json', options);
  downloadJSON(exportData, filename);
}

// =============================================================================
// Batch/Chunked Export (for large datasets)
// =============================================================================

const CHUNK_SIZE = 1000;

export async function exportLargeDatasetToJSON(
  fetchData: (offset: number, limit: number) => Promise<RunSummary[]>,
  options?: ExportOptions
): Promise<void> {
  const allRuns: RunSummary[] = [];
  let offset = 0;
  let hasMore = true;
  
  // Fetch data in chunks
  while (hasMore) {
    const chunk = await fetchData(offset, CHUNK_SIZE);
    allRuns.push(...chunk);
    
    if (chunk.length < CHUNK_SIZE) {
      hasMore = false;
    } else {
      offset += CHUNK_SIZE;
    }
  }
  
  // Export all collected data
  exportRunsToJSON(allRuns, options);
}

// =============================================================================
// Selected Runs Export (for selection mode)
// =============================================================================

export function exportSelectedRunsToCSV(
  runs: RunSummary[],
  selectedIds: Set<string>,
  options?: ExportOptions
): void {
  const selectedRuns = runs.filter(run => selectedIds.has(run.run_id));
  exportRunsToCSV(selectedRuns, { ...options, filename: `selected_${selectedIds.size}` });
}

export function exportSelectedRunsToJSON(
  runs: RunSummary[],
  selectedIds: Set<string>,
  options?: ExportOptions
): void {
  const selectedRuns = runs.filter(run => selectedIds.has(run.run_id));
  exportRunsToJSON(selectedRuns, { ...options, filename: `selected_${selectedIds.size}` });
}
