import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api, RunDetail as RunDetailType, SSEProgressEvent } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Layout from '../components/Layout';
import LogTail from '../components/LogTail';
import MetricCards from '../components/MetricCards';
import BreakdownChart from '../components/BreakdownChart';
import ArtifactViewer from '../components/ArtifactViewer';
import { ErrorState } from '../components/ErrorBoundary';
import { parseError } from '../utils/errorMessages';

export default function RunDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [run, setRun] = useState<RunDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ title: string; message: string; action?: string; recoverable: boolean } | null>(null);
  
  // Live log lines (appended via SSE)
  const [stdoutLines, setStdoutLines] = useState<string[]>([]);
  const [stderrLines, setStderrLines] = useState<string[]>([]);
  const [progress, setProgress] = useState<SSEProgressEvent | null>(null);
  const [isSSEConnected, setIsSSEConnected] = useState(false);
  
  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  
  // Tags
  const [editingTags, setEditingTags] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [savingTags, setSavingTags] = useState(false);
  
  // Artifact preview
  const [previewArtifact, setPreviewArtifact] = useState<string | null>(null);
  
  // Refs to track SSE subscription
  const sseCleanup = useRef<(() => void) | null>(null);
  const hasInitializedSSE = useRef(false);

  // Load initial run data
  const loadRun = useCallback(async () => {
    if (!id) return;
    try {
      const data = await api.getRun(id);
      setRun(data);
      setError(null);
      
      // Initialize log lines from tail if not using SSE yet
      if (!isSSEConnected && data.stdout_tail) {
        setStdoutLines(data.stdout_tail.split('\n'));
      }
      if (!isSSEConnected && data.stderr_tail) {
        setStderrLines(data.stderr_tail.split('\n'));
      }
    } catch (err) {
      const parsed = parseError(err, 'loading-run');
      setError({
        title: parsed.title,
        message: parsed.message,
        action: parsed.action,
        recoverable: parsed.recoverable,
      });
    } finally {
      setLoading(false);
    }
  }, [id, isSSEConnected]);

  // Subscribe to SSE events
  const subscribeToEvents = useCallback(() => {
    if (!id || hasInitializedSSE.current) return;
    
    hasInitializedSSE.current = true;
    
    const cleanup = api.subscribeToRunEvents(id, {
      onStatus: (event) => {
        setRun((prev) => prev ? { ...prev, status: event.status as RunDetailType['status'] } : null);
      },
      onLogLine: (event) => {
        if (event.stream === 'stdout') {
          setStdoutLines((prev) => [...prev, event.line]);
        } else {
          setStderrLines((prev) => [...prev, event.line]);
        }
      },
      onProgress: (event) => {
        setProgress(event);
      },
      onCompleted: (event) => {
        setRun((prev) => {
          if (prev) {
            toast.success(`Run completed: ${prev.benchmark}`, {
              icon: '✅',
              duration: 5000,
            });
          }
          return prev ? {
            ...prev,
            status: 'completed',
            exit_code: event.exit_code,
            finished_at: event.finished_at || undefined,
          } : null;
        });
        setIsSSEConnected(false);
      },
      onFailed: (event) => {
        setRun((prev) => {
          if (prev) {
            toast.error(`Run failed: ${event.error || 'Unknown error'}`, {
              duration: 6000,
            });
          }
          return prev ? {
            ...prev,
            status: 'failed',
            exit_code: event.exit_code,
            error: event.error || undefined,
            finished_at: event.finished_at || undefined,
          } : null;
        });
        setIsSSEConnected(false);
      },
      onCanceled: (event) => {
        setRun((prev) => {
          if (prev) {
            toast('Run canceled', {
              icon: '⏹️',
              duration: 4000,
            });
          }
          return prev ? {
            ...prev,
            status: 'canceled',
            finished_at: event.finished_at || undefined,
          } : null;
        });
        setIsSSEConnected(false);
      },
      onError: () => {
        // SSE failed, fall back to polling
        setIsSSEConnected(false);
        hasInitializedSSE.current = false;
      },
    });
    
    sseCleanup.current = cleanup;
    setIsSSEConnected(true);
  }, [id]);

  // Initial load
  useEffect(() => {
    loadRun();
  }, [loadRun]);

  // Start SSE when run is active
  useEffect(() => {
    if (run && (run.status === 'running' || run.status === 'queued')) {
      subscribeToEvents();
    }
    
    return () => {
      if (sseCleanup.current) {
        sseCleanup.current();
        sseCleanup.current = null;
      }
    };
  }, [run?.status, subscribeToEvents]);

  // Polling fallback when SSE is not connected
  useEffect(() => {
    if (!id || isSSEConnected) return;
    
    if (run?.status === 'running' || run?.status === 'queued' || !run) {
      const interval = setInterval(() => {
        loadRun();
      }, 2000);
      
      return () => clearInterval(interval);
    }
  }, [id, run?.status, isSSEConnected, loadRun]);

  const handleCancel = async () => {
    if (!id) return;
    try {
      await api.cancelRun(id);
      toast('Canceling run...', { icon: '⏳' });
      loadRun();
    } catch (err) {
      const parsed = parseError(err, 'canceling-run');
      toast.error(parsed.message);
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    setDeleting(true);
    try {
      await api.deleteRun(id);
      toast.success('Run deleted');
      navigate('/');
    } catch (err) {
      const parsed = parseError(err, 'deleting-run');
      toast.error(parsed.message);
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleRunAgain = () => {
    if (!run?.config) return;
    // Navigate to new run page with config as state
    navigate('/', { state: { prefill: run.config } });
  };

  const handleAddTag = async () => {
    if (!id || !run || !newTag.trim()) return;
    setSavingTags(true);
    try {
      const currentTags = run.tags || [];
      const updatedTags = [...currentTags, newTag.trim()];
      await api.updateRunTags(id, updatedTags);
      setRun({ ...run, tags: updatedTags });
      setNewTag('');
      toast.success(`Tag added: ${newTag.trim()}`);
    } catch (err) {
      const parsed = parseError(err);
      toast.error(parsed.message);
    } finally {
      setSavingTags(false);
    }
  };

  const handleRemoveTag = async (tagToRemove: string) => {
    if (!id || !run) return;
    setSavingTags(true);
    try {
      const currentTags = run.tags || [];
      const updatedTags = currentTags.filter((t) => t !== tagToRemove);
      await api.updateRunTags(id, updatedTags);
      setRun({ ...run, tags: updatedTags });
      toast.success(`Tag removed: ${tagToRemove}`);
    } catch (err) {
      const parsed = parseError(err);
      toast.error(parsed.message);
    } finally {
      setSavingTags(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="space-y-8">
          <div className="h-8 w-64 bg-border rounded animate-pulse" />
          <div className="grid grid-cols-4 gap-8">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-20 bg-border rounded animate-pulse" />
            ))}
          </div>
          <div className="h-64 bg-border rounded animate-pulse" />
        </div>
      </Layout>
    );
  }

  if (error || !run) {
    const errorInfo = error || {
      title: 'Run Not Found',
      message: 'The requested benchmark run could not be found.',
      action: 'It may have been deleted or the link may be incorrect.',
      recoverable: true,
    };
    
    return (
      <Layout>
        <ErrorState
          title={errorInfo.title}
          message={errorInfo.message}
          action={errorInfo.action}
          onRetry={errorInfo.recoverable ? () => {
            setError(null);
            setLoading(true);
            loadRun();
          } : undefined}
        >
          <Link 
            to="/history" 
            className="mt-4 inline-block text-[14px] text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Back to History
          </Link>
        </ErrorState>
      </Layout>
    );
  }

  const statusLabels: Record<RunDetailType['status'], string> = {
    queued: 'Queued',
    running: 'Running',
    completed: 'Completed',
    failed: 'Failed',
    canceled: 'Canceled',
  };

  const isActive = run.status === 'running' || run.status === 'queued';

  // Combine initial logs with SSE updates
  const displayStdout = stdoutLines.join('\n') || run.stdout_tail || '';
  const displayStderr = stderrLines.join('\n') || run.stderr_tail || '';

  return (
    <Layout>
      {/* Header */}
      <div className="mb-12">
        <Link 
          to="/history"
          className="text-[13px] text-muted-foreground hover:text-foreground transition-colors mb-4 inline-block"
        >
          ← Back
        </Link>
        <div className="flex items-center gap-4 mb-2">
          <h1 className="text-[28px] text-foreground tracking-tight">
            {run.benchmark}
          </h1>
          <span className="text-[13px] text-muted flex items-center">
            {run.status === 'running' && (
              <span className="w-1.5 h-1.5 rounded-full bg-foreground mr-2 animate-pulse" />
            )}
            {statusLabels[run.status]}
          </span>
          {isSSEConnected && (
            <span className="text-[11px] text-success flex items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-success" />
              Live
            </span>
          )}
        </div>
        <p className="text-[15px] text-muted-foreground">
          {run.model}
        </p>
      </div>

      {/* Progress Bar */}
      {progress && isActive && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] text-muted-foreground">Progress</span>
            <span className="text-[12px] text-muted">
              {progress.current} / {progress.total} ({progress.percentage}%)
            </span>
          </div>
          <div className="h-1 bg-border rounded-full overflow-hidden">
            <div 
              className="h-full bg-foreground transition-all duration-300"
              style={{ width: `${progress.percentage}%` }}
            />
          </div>
          {progress.message && (
            <p className="text-[12px] text-muted-foreground mt-2 truncate">
              {progress.message}
            </p>
          )}
        </div>
      )}

      {/* Info Grid */}
      <div className="grid grid-cols-[280px_1fr] gap-16 mb-12">
        <div>
          <p className="text-[11px] text-muted-foreground uppercase tracking-[0.1em] mb-4">
            Details
          </p>
          <div className="space-y-4">
            <div>
              <p className="text-[12px] text-muted-foreground mb-1">Run ID</p>
              <p className="text-[14px] text-foreground font-mono">{run.run_id.slice(0, 8)}</p>
            </div>
            <div>
              <p className="text-[12px] text-muted-foreground mb-1">Created</p>
              <p className="text-[14px] text-foreground">{new Date(run.created_at).toLocaleString()}</p>
            </div>
            {run.started_at && (
              <div>
                <p className="text-[12px] text-muted-foreground mb-1">Started</p>
                <p className="text-[14px] text-foreground">{new Date(run.started_at).toLocaleString()}</p>
              </div>
            )}
            {run.finished_at && (
              <div>
                <p className="text-[12px] text-muted-foreground mb-1">Finished</p>
                <p className="text-[14px] text-foreground">{new Date(run.finished_at).toLocaleString()}</p>
              </div>
            )}
            {run.exit_code !== null && run.exit_code !== undefined && (
              <div>
                <p className="text-[12px] text-muted-foreground mb-1">Exit Code</p>
                <p className={`text-[14px] font-mono ${run.exit_code === 0 ? 'text-foreground' : 'text-muted'}`}>
                  {run.exit_code}
                </p>
              </div>
            )}
          </div>
          
          {/* Action Buttons */}
          <div className="mt-8 space-y-3">
            {isActive && (
              <button
                onClick={handleCancel}
                className="w-full px-4 py-2 text-[13px] text-muted border border-border-secondary hover:border-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel Run
              </button>
            )}
            
            {run.config && !isActive && (
              <button
                onClick={handleRunAgain}
                className="w-full px-4 py-2 text-[13px] text-foreground bg-background-tertiary border border-border-secondary hover:bg-border transition-colors"
              >
                Run Again →
              </button>
            )}
            
            {isAuthenticated && !isActive && (
              <>
                {!showDeleteConfirm ? (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="w-full px-4 py-2 text-[13px] text-muted-foreground border border-border hover:border-error hover:text-error transition-colors"
                  >
                    Delete Run
                  </button>
                ) : (
                  <div className="p-3 bg-error-bg border border-error-border">
                    <p className="text-[12px] text-error mb-3">
                      Delete this run and all artifacts?
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={handleDelete}
                        disabled={deleting}
                        className="flex-1 px-3 py-1.5 text-[12px] text-accent-foreground bg-error hover:opacity-90 disabled:opacity-50 transition-colors"
                      >
                        {deleting ? 'Deleting...' : 'Delete'}
                      </button>
                      <button
                        onClick={() => setShowDeleteConfirm(false)}
                        className="flex-1 px-3 py-1.5 text-[12px] text-muted border border-border-secondary hover:text-foreground transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        
        <div>
          {/* Configuration */}
          {run.config && Object.keys(run.config).length > 0 && (
            <div className="mb-8">
              <p className="text-[11px] text-muted-foreground uppercase tracking-[0.1em] mb-4">
                Configuration
              </p>
              <div className="grid grid-cols-3 gap-4">
                {Object.entries(run.config)
                  .filter(([key]) => key !== 'schema_version')
                  .map(([key, value]) => (
                  value !== null && value !== undefined && (
                    <div key={key}>
                      <p className="text-[12px] text-muted-foreground mb-1">
                        {key.replace(/_/g, ' ')}
                      </p>
                      <p className="text-[14px] text-foreground">{String(value)}</p>
                    </div>
                  )
                ))}
              </div>
            </div>
          )}

          {/* Command - for reproducibility */}
          {run.command && (
            <div className="mb-8">
              <p className="text-[11px] text-muted-foreground uppercase tracking-[0.1em] mb-4">
                Command
                <span className="ml-2 text-muted-foreground normal-case tracking-normal">
                  (for reproducibility)
                </span>
              </p>
              <div className="relative group">
                <pre className="px-4 py-3 bg-background-secondary border border-border text-[13px] text-muted font-mono overflow-x-auto">
                  {run.command}
                </pre>
                <button
                  onClick={() => navigator.clipboard.writeText(run.command!)}
                  className="absolute top-2 right-2 px-2 py-1 text-[11px] text-muted-foreground border border-border-secondary bg-background-tertiary opacity-0 group-hover:opacity-100 hover:text-foreground hover:border-muted-foreground transition-all"
                >
                  Copy
                </button>
              </div>
            </div>
          )}

          {/* Error Message */}
          {run.error && (
            <div className="mb-8">
              <p className="text-[11px] text-muted-foreground uppercase tracking-[0.1em] mb-4">
                Error
              </p>
              <pre className="text-[13px] text-muted font-mono whitespace-pre-wrap break-words">
                {run.error}
              </pre>
            </div>
          )}

          {/* Tags */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[11px] text-muted-foreground uppercase tracking-[0.1em]">
                Tags
              </p>
              {isAuthenticated && !editingTags && (
                <button
                  onClick={() => setEditingTags(true)}
                  className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  Edit
                </button>
              )}
            </div>
            
            <div className="flex flex-wrap gap-2">
              {(run.tags || []).map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[12px] text-muted bg-background-tertiary border border-border-secondary"
                >
                  {tag}
                  {editingTags && (
                    <button
                      onClick={() => handleRemoveTag(tag)}
                      disabled={savingTags}
                      className="text-muted-foreground hover:text-error transition-colors disabled:opacity-50"
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
              
              {(run.tags || []).length === 0 && !editingTags && (
                <span className="text-[13px] text-muted-foreground">No tags</span>
              )}
              
              {editingTags && (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddTag();
                      }
                    }}
                    placeholder="Add tag..."
                    className="px-2 py-1 w-24 text-[12px] bg-background-secondary border border-border-secondary text-foreground placeholder-muted-foreground focus:border-muted-foreground focus:outline-none"
                  />
                  <button
                    onClick={handleAddTag}
                    disabled={!newTag.trim() || savingTags}
                    className="px-2 py-1 text-[11px] text-foreground bg-border-secondary hover:bg-muted-foreground disabled:opacity-50 transition-colors"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => {
                      setEditingTags(false);
                      setNewTag('');
                    }}
                    className="px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Done
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Results Section */}
      {run.status === 'completed' && (
        <div className="mb-12">
          <p className="text-[11px] text-muted-foreground uppercase tracking-[0.1em] mb-6">
            Results
          </p>
          
          {run.summary && (run.summary.primary_metric || run.summary.metrics.length > 0) ? (
            <div className="space-y-8">
              <MetricCards
                primaryMetric={run.summary.primary_metric}
                metrics={run.summary.metrics}
              />
              
              {run.summary.breakdowns.length > 0 && (
                <BreakdownChart breakdowns={run.summary.breakdowns} />
              )}
              
              {run.summary.notes.length > 0 && (
                <div className="mt-6">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-[0.1em] mb-3">
                    Notes
                  </p>
                  <ul className="space-y-1">
                    {run.summary.notes.map((note, i) => (
                      <li key={i} className="text-[13px] text-muted-foreground">
                        {note}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-background-secondary border border-border px-6 py-8 text-center">
              <p className="text-[14px] text-muted-foreground">
                No structured summary available
              </p>
              <p className="text-[12px] text-muted-foreground mt-2">
                Check the logs below for raw output
              </p>
            </div>
          )}
        </div>
      )}

      {/* Logs */}
      <div className="space-y-8">
        <div>
          <p className="text-[11px] text-muted-foreground uppercase tracking-[0.1em] mb-4">
            Output
          </p>
          <LogTail
            title="stdout.log"
            content={displayStdout}
            autoScroll={isActive}
            showAutoScrollToggle={true}
          />
        </div>

        {displayStderr && (
          <div>
            <LogTail
              title="stderr.log"
              content={displayStderr}
              autoScroll={isActive}
              showAutoScrollToggle={true}
            />
          </div>
        )}
      </div>

      {/* Artifacts */}
      {run.artifacts && run.artifacts.length > 0 && (
        <div className="mt-12">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[11px] text-muted-foreground uppercase tracking-[0.1em]">
              Artifacts ({run.artifacts.length})
            </p>
            {run.artifacts.length > 1 && (
              <button
                onClick={() => {
                  // Download all artifacts by opening each in a new tab
                  run.artifacts.forEach((artifact) => {
                    const link = document.createElement('a');
                    link.href = `/api/runs/${id}/artifacts/${artifact}`;
                    link.download = artifact;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                  });
                }}
                className="px-3 py-1.5 text-[11px] text-muted border border-border-secondary hover:border-muted-foreground hover:text-foreground transition-colors flex items-center gap-2"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download All
              </button>
            )}
          </div>
          
          {/* Separate regular artifacts from detailed logs */}
          {(() => {
            const regularArtifacts = run.artifacts.filter(a => !a.startsWith('logs/'));
            const detailedLogs = run.artifacts.filter(a => a.startsWith('logs/'));
            
            return (
              <>
                {/* Regular artifacts */}
                {regularArtifacts.length > 0 && (
                  <div className="space-y-2 mb-6">
                    {regularArtifacts.map((artifact) => (
                      <div
                        key={artifact}
                        className="flex items-center justify-between gap-3 px-4 py-2.5 bg-background-secondary border border-border hover:border-border-secondary hover:bg-background-tertiary transition-all group"
                      >
                        <button
                          onClick={() => setPreviewArtifact(artifact)}
                          className="flex items-center gap-3 flex-1 min-w-0 text-left"
                        >
                          <svg className="w-4 h-4 text-muted-foreground group-hover:text-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          <span className="text-[14px] text-muted group-hover:text-foreground font-mono transition-colors truncate">
                            {artifact}
                          </span>
                        </button>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const link = document.createElement('a');
                              link.href = `/api/runs/${id}/artifacts/${artifact}`;
                              link.download = artifact;
                              document.body.appendChild(link);
                              link.click();
                              document.body.removeChild(link);
                            }}
                            className="p-1.5 text-muted-foreground hover:text-muted transition-colors"
                            title="Download"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                {/* Detailed evaluation logs */}
                {detailedLogs.length > 0 && (
                  <div className="mt-6">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-[0.1em] mb-3">
                      Detailed Logs
                    </p>
                    <div className="space-y-2">
                      {detailedLogs.map((artifact) => {
                        const isEvalFile = artifact.endsWith('.eval');
                        
                        if (isEvalFile) {
                          return (
                            <Link
                              key={artifact}
                              to={`/runs/${id}/eval/${artifact}`}
                              className="flex items-center gap-3 px-4 py-2 bg-background-secondary border border-border hover:border-border-secondary transition-colors group"
                            >
                              <svg className="w-4 h-4 text-muted-foreground group-hover:text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                              <span className="text-[14px] text-muted group-hover:text-foreground font-mono transition-colors flex-1">
                                {artifact.replace('logs/', '')}
                              </span>
                              <span className="text-[11px] text-muted-foreground group-hover:text-muted">
                                View Results →
                              </span>
                            </Link>
                          );
                        }
                        
                        return (
                          <div
                            key={artifact}
                            className="flex items-center justify-between gap-3 px-4 py-2.5 bg-background-secondary border border-border hover:border-border-secondary hover:bg-background-tertiary transition-all group"
                          >
                            <button
                              onClick={() => setPreviewArtifact(artifact)}
                              className="flex items-center gap-3 flex-1 min-w-0 text-left"
                            >
                              <svg className="w-4 h-4 text-muted-foreground group-hover:text-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              <span className="text-[14px] text-muted group-hover:text-foreground font-mono transition-colors truncate">
                                {artifact.replace('logs/', '')}
                              </span>
                            </button>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const link = document.createElement('a');
                                  link.href = `/api/runs/${id}/artifacts/${artifact}`;
                                  link.download = artifact.replace('logs/', '');
                                  document.body.appendChild(link);
                                  link.click();
                                  document.body.removeChild(link);
                                }}
                                className="p-1.5 text-muted-foreground hover:text-muted transition-colors"
                                title="Download"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-[12px] text-muted-foreground mt-3">
                      💡 Tip: Click .eval files to view detailed results in the browser
                    </p>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* Artifact Preview Modal */}
      {previewArtifact && id && (
        <ArtifactViewer
          runId={id}
          artifact={previewArtifact}
          onClose={() => setPreviewArtifact(null)}
        />
      )}
    </Layout>
  );
}
