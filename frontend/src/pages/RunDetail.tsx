import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api, RunDetail as RunDetailType, RunDuplicateOverrides, RunConfig } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Layout from '../components/Layout';
import LogTail from '../components/LogTail';
import MetricCards from '../components/MetricCards';
import BreakdownChart from '../components/BreakdownChart';
import ArtifactViewer from '../components/ArtifactViewer';
import DuplicateRunModal from '../components/DuplicateRunModal';
import { ErrorState } from '../components/ErrorBoundary';
import { parseError } from '../utils/errorMessages';
import { 
  useRunWebSocket, 
  RunProgressEvent, 
  RunStatusEvent, 
  RunLogLineEvent,
  RunCompletedEvent,
  RunFailedEvent,
  RunCanceledEvent 
} from '../hooks/useWebSocket';
import ConnectionStatus from '../components/ConnectionStatus';

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

export default function RunDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [run, setRun] = useState<RunDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ title: string; message: string; action?: string; recoverable: boolean } | null>(null);
  
  // Live log lines (appended via WebSocket)
  const [stdoutLines, setStdoutLines] = useState<string[]>([]);
  const [stderrLines, setStderrLines] = useState<string[]>([]);
  const [progress, setProgress] = useState<RunProgressEvent | null>(null);
  
  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  
  // Tags
  const [editingTags, setEditingTags] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [savingTags, setSavingTags] = useState(false);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [showTagSuggestions, setShowTagSuggestions] = useState(false);
  
  // Notes
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  
  // Artifact preview
  const [previewArtifact, setPreviewArtifact] = useState<string | null>(null);
  
  // Duplicate modal
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  
  // Track WebSocket connection for controlling log initialization
  const wsConnectedRef = useRef(false);

  // Load initial run data
  const loadRun = useCallback(async () => {
    if (!id) return;
    try {
      const data = await api.getRun(id);
      setRun(data);
      setError(null);
      
      // Initialize log lines from tail if not using WebSocket yet
      if (!wsConnectedRef.current && data.stdout_tail) {
        setStdoutLines(data.stdout_tail.split('\n'));
      }
      if (!wsConnectedRef.current && data.stderr_tail) {
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
  }, [id]);

  // WebSocket event handlers
  const handleWsStatus = useCallback((event: RunStatusEvent) => {
    setRun((prev) => prev ? { ...prev, status: event.status as RunDetailType['status'] } : null);
  }, []);

  const handleWsLogLine = useCallback((event: RunLogLineEvent) => {
    if (event.stream === 'stdout') {
      setStdoutLines((prev) => [...prev, event.line]);
    } else {
      setStderrLines((prev) => [...prev, event.line]);
    }
  }, []);

  const handleWsProgress = useCallback((event: RunProgressEvent) => {
    setProgress(event);
  }, []);

  const handleWsCompleted = useCallback((event: RunCompletedEvent) => {
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
  }, []);

  const handleWsFailed = useCallback((event: RunFailedEvent) => {
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
  }, []);

  const handleWsCanceled = useCallback((event: RunCanceledEvent) => {
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
  }, []);

  // WebSocket connection for live updates (only for active runs)
  const isActiveRun = run?.status === 'running' || run?.status === 'queued';
  const { status: wsStatus, reconnectAttempts, isConnected } = useRunWebSocket({
    runId: id || '',
    autoConnect: isActiveRun && !!id,
    onStatus: handleWsStatus,
    onLogLine: handleWsLogLine,
    onProgress: handleWsProgress,
    onCompleted: handleWsCompleted,
    onFailed: handleWsFailed,
    onCanceled: handleWsCanceled,
    onError: () => {
      // WebSocket failed, will fall back to polling
    },
  });

  // Track WebSocket connection state
  useEffect(() => {
    wsConnectedRef.current = isConnected;
  }, [isConnected]);

  // Initial load
  useEffect(() => {
    loadRun();
  }, [loadRun]);

  // Load all tags for autocomplete
  useEffect(() => {
    const loadTags = async () => {
      try {
        const tags = await api.listAllTags();
        setAllTags(tags);
      } catch {
        // Ignore errors loading tags
      }
    };
    loadTags();
  }, []);

  // Initialize notes value when run loads
  useEffect(() => {
    if (run) {
      setNotesValue(run.notes || '');
    }
  }, [run?.notes]);

  // Polling fallback when WebSocket is not connected
  useEffect(() => {
    if (!id || isConnected) return;
    
    if (run?.status === 'running' || run?.status === 'queued' || !run) {
      const interval = setInterval(() => {
        loadRun();
      }, 3000);
      
      return () => clearInterval(interval);
    }
  }, [id, run?.status, isConnected, loadRun]);

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

  const handleDuplicate = async (overrides: RunDuplicateOverrides) => {
    if (!id) return;
    setDuplicating(true);
    try {
      const result = await api.duplicateRun(id, overrides);
      toast.success(`Duplicate run started`, {
        icon: '🔄',
      });
      setShowDuplicateModal(false);
      navigate(`/runs/${result.run_id}`);
    } catch (err) {
      const parsed = parseError(err, 'duplicating-run');
      toast.error(parsed.message);
    } finally {
      setDuplicating(false);
    }
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

  const handleSaveNotes = async () => {
    if (!id || !run) return;
    setSavingNotes(true);
    try {
      const notes = notesValue.trim() || null;
      await api.updateRunNotes(id, notes);
      setRun({ ...run, notes: notes || undefined });
      setEditingNotes(false);
      toast.success('Notes saved');
    } catch (err) {
      const parsed = parseError(err);
      toast.error(parsed.message);
    } finally {
      setSavingNotes(false);
    }
  };

  const handleCancelNotesEdit = () => {
    setNotesValue(run?.notes || '');
    setEditingNotes(false);
  };

  // Filter tags for autocomplete
  const filteredTagSuggestions = allTags.filter(
    (tag) => 
      tag.toLowerCase().includes(newTag.toLowerCase()) &&
      !(run?.tags || []).includes(tag)
  ).slice(0, 5);

  if (loading) {
    return (
      <Layout>
        <div className="space-y-6 sm:space-y-8">
          <div className="h-8 w-48 sm:w-64 bg-border rounded animate-pulse" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-8">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-16 sm:h-20 bg-border rounded animate-pulse" />
            ))}
          </div>
          <div className="h-48 sm:h-64 bg-border rounded animate-pulse" />
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
            className="mt-4 inline-block text-[14px] text-muted-foreground hover:text-foreground transition-colors min-h-[44px] flex items-center"
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

  // Combine initial logs with WebSocket updates
  const displayStdout = stdoutLines.join('\n') || run.stdout_tail || '';
  const displayStderr = stderrLines.join('\n') || run.stderr_tail || '';

  return (
    <Layout>
      {/* Header */}
      <div className="mb-8 sm:mb-12">
        <Link 
          to="/history"
          className="text-[13px] text-muted-foreground hover:text-foreground transition-colors mb-4 inline-flex items-center min-h-[44px]"
        >
          ← Back
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mb-2">
          <h1 className="text-[22px] sm:text-[28px] text-foreground tracking-tight">
            {run.benchmark}
          </h1>
          <div className="flex items-center gap-3">
            <span className="text-[13px] text-muted flex items-center">
              {run.status === 'running' && (
                <span className="w-1.5 h-1.5 rounded-full bg-foreground mr-2 animate-pulse" />
              )}
              {statusLabels[run.status]}
            </span>
            {isActiveRun && (
              <ConnectionStatus 
                status={wsStatus} 
                reconnectAttempts={reconnectAttempts}
              />
            )}
          </div>
        </div>
        <p className="text-[14px] sm:text-[15px] text-muted-foreground break-all">
          {run.model}
        </p>
        {run.template_name && (
          <p className="text-[12px] text-muted-foreground mt-1 flex items-center gap-1.5">
            <span>📋</span>
            <span>From template: {run.template_name}</span>
          </p>
        )}
      </div>

      {/* Progress Bar */}
      {progress && isActive && (
        <div className="mb-6 sm:mb-8">
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

      {/* Info Grid - Responsive: stacked on mobile, side-by-side on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-8 lg:gap-16 mb-8 sm:mb-12">
        {/* Left Column - Details */}
        <div>
          <p className="text-[11px] text-muted-foreground uppercase tracking-[0.1em] mb-4">
            Details
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-1 gap-4">
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
            {run.total_tokens !== null && run.total_tokens !== undefined && run.total_tokens > 0 && (
              <div>
                <p className="text-[12px] text-muted-foreground mb-1">Tokens Used</p>
                <p className="text-[14px] text-foreground tabular-nums">
                  {run.total_tokens.toLocaleString()}
                  {run.input_tokens && run.output_tokens && (
                    <span className="text-[11px] text-muted-foreground ml-1">
                      ({run.input_tokens.toLocaleString()} in / {run.output_tokens.toLocaleString()} out)
                    </span>
                  )}
                </p>
              </div>
            )}
            {run.estimated_cost !== null && run.estimated_cost !== undefined && run.estimated_cost > 0 && (
              <div>
                <p className="text-[12px] text-muted-foreground mb-1">Estimated Cost</p>
                <p className="text-[14px] text-foreground tabular-nums">
                  ${run.estimated_cost < 0.01 ? run.estimated_cost.toFixed(4) : run.estimated_cost.toFixed(2)}
                </p>
              </div>
            )}
          </div>
          
          {/* Action Buttons */}
          <div className="mt-6 sm:mt-8 flex flex-col sm:flex-row lg:flex-col gap-3">
            {isActive && (
              <button
                onClick={handleCancel}
                className="w-full sm:flex-1 lg:w-full px-4 py-3 sm:py-2 text-[13px] text-muted border border-border-secondary hover:border-muted-foreground hover:text-foreground transition-colors min-h-[44px]"
              >
                Cancel Run
              </button>
            )}
            
            {run.config && !isActive && (
              <>
                <button
                  onClick={() => setShowDuplicateModal(true)}
                  disabled={duplicating}
                  className="w-full sm:flex-1 lg:w-full px-4 py-3 sm:py-2 text-[13px] text-accent-foreground bg-accent hover:opacity-90 disabled:opacity-50 transition-all min-h-[44px]"
                >
                  {duplicating ? 'Starting...' : 'Duplicate →'}
                </button>
                <button
                  onClick={handleRunAgain}
                  className="w-full sm:flex-1 lg:w-full px-4 py-3 sm:py-2 text-[13px] text-muted border border-border-secondary hover:border-muted-foreground hover:text-foreground transition-colors min-h-[44px]"
                >
                  Edit & Run →
                </button>
              </>
            )}
            
            {isAuthenticated && !isActive && (
              <>
                {!showDeleteConfirm ? (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="w-full sm:flex-1 lg:w-full px-4 py-3 sm:py-2 text-[13px] text-muted-foreground border border-border hover:border-error hover:text-error transition-colors min-h-[44px]"
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
                        className="flex-1 px-3 py-2 text-[12px] text-accent-foreground bg-error hover:opacity-90 disabled:opacity-50 transition-colors min-h-[44px]"
                      >
                        {deleting ? 'Deleting...' : 'Delete'}
                      </button>
                      <button
                        onClick={() => setShowDeleteConfirm(false)}
                        className="flex-1 px-3 py-2 text-[12px] text-muted border border-border-secondary hover:text-foreground transition-colors min-h-[44px]"
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
        
        {/* Right Column - Configuration, Tags, Notes */}
        <div>
          {/* Configuration */}
          {run.config && Object.keys(run.config).length > 0 && (
            <div className="mb-6 sm:mb-8">
              <p className="text-[11px] text-muted-foreground uppercase tracking-[0.1em] mb-4">
                Configuration
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {Object.entries(run.config)
                  .filter(([key]) => key !== 'schema_version')
                  .map(([key, value]) => (
                  value !== null && value !== undefined && (
                    <div key={key}>
                      <p className="text-[12px] text-muted-foreground mb-1">
                        {key.replace(/_/g, ' ')}
                      </p>
                      <p className="text-[14px] text-foreground break-all">{String(value)}</p>
                    </div>
                  )
                ))}
              </div>
            </div>
          )}

          {/* Command - for reproducibility */}
          {run.command && (
            <div className="mb-6 sm:mb-8">
              <p className="text-[11px] text-muted-foreground uppercase tracking-[0.1em] mb-4">
                Command
                <span className="ml-2 text-muted-foreground normal-case tracking-normal hidden sm:inline">
                  (for reproducibility)
                </span>
              </p>
              <div className="relative group">
                <pre className="px-3 sm:px-4 py-3 bg-background-secondary border border-border text-[12px] sm:text-[13px] text-muted font-mono overflow-x-auto">
                  {run.command}
                </pre>
                <button
                  onClick={() => navigator.clipboard.writeText(run.command!)}
                  className="absolute top-2 right-2 px-2 py-1.5 text-[11px] text-muted-foreground border border-border-secondary bg-background-tertiary opacity-100 sm:opacity-0 sm:group-hover:opacity-100 hover:text-foreground hover:border-muted-foreground transition-all min-h-[36px] min-w-[44px]"
                >
                  Copy
                </button>
              </div>
            </div>
          )}

          {/* Error Message */}
          {run.error && (
            <div className="mb-6 sm:mb-8">
              <p className="text-[11px] text-muted-foreground uppercase tracking-[0.1em] mb-4">
                Error
              </p>
              <pre className="text-[13px] text-muted font-mono whitespace-pre-wrap break-words">
                {run.error}
              </pre>
            </div>
          )}

          {/* Tags */}
          <div className="mb-6 sm:mb-8">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[11px] text-muted-foreground uppercase tracking-[0.1em]">
                Tags
              </p>
              {isAuthenticated && !editingTags && (
                <button
                  onClick={() => setEditingTags(true)}
                  className="text-[11px] text-muted-foreground hover:text-foreground transition-colors min-h-[44px] flex items-center px-2"
                >
                  Edit
                </button>
              )}
            </div>
            
            <div className="flex flex-wrap gap-2">
              {(run.tags || []).map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] text-muted border border-border-secondary"
                  style={{ backgroundColor: getTagColor(tag) }}
                >
                  {tag}
                  {editingTags && (
                    <button
                      onClick={() => handleRemoveTag(tag)}
                      disabled={savingTags}
                      className="text-muted-foreground hover:text-error transition-colors disabled:opacity-50 min-w-[24px] min-h-[24px] flex items-center justify-center"
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
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0">
                  <div className="relative flex-1 sm:flex-none">
                    <input
                      type="text"
                      value={newTag}
                      onChange={(e) => {
                        setNewTag(e.target.value);
                        setShowTagSuggestions(e.target.value.length > 0);
                      }}
                      onFocus={() => setShowTagSuggestions(newTag.length > 0 || filteredTagSuggestions.length > 0)}
                      onBlur={() => {
                        // Delay hiding to allow click on suggestion
                        setTimeout(() => setShowTagSuggestions(false), 150);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddTag();
                        }
                        if (e.key === 'Escape') {
                          setShowTagSuggestions(false);
                        }
                      }}
                      placeholder="Add tag..."
                      className="px-3 py-2 w-full sm:w-32 text-[12px] bg-background-secondary border border-border-secondary text-foreground placeholder-muted-foreground focus:border-muted-foreground focus:outline-none min-h-[44px]"
                    />
                    {/* Tag suggestions dropdown */}
                    {showTagSuggestions && filteredTagSuggestions.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-background-secondary border border-border-secondary shadow-lg z-10">
                        {filteredTagSuggestions.map((tag) => (
                          <button
                            key={tag}
                            onClick={() => {
                              setNewTag(tag);
                              handleAddTag();
                              setShowTagSuggestions(false);
                            }}
                            className="w-full px-3 py-2.5 text-left text-[12px] text-muted hover:bg-background-tertiary hover:text-foreground transition-colors min-h-[44px]"
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleAddTag}
                      disabled={!newTag.trim() || savingTags}
                      className="flex-1 sm:flex-none px-3 py-2 text-[11px] text-foreground bg-border-secondary hover:bg-muted-foreground disabled:opacity-50 transition-colors min-h-[44px] min-w-[44px]"
                    >
                      Add
                    </button>
                    <button
                      onClick={() => {
                        setEditingTags(false);
                        setNewTag('');
                        setShowTagSuggestions(false);
                      }}
                      className="flex-1 sm:flex-none px-3 py-2 text-[11px] text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px]"
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Notes */}
          <div className="mb-6 sm:mb-8">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[11px] text-muted-foreground uppercase tracking-[0.1em]">
                Notes
              </p>
              {isAuthenticated && !editingNotes && (
                <button
                  onClick={() => setEditingNotes(true)}
                  className="text-[11px] text-muted-foreground hover:text-foreground transition-colors min-h-[44px] flex items-center px-2"
                >
                  {run.notes ? 'Edit' : 'Add'}
                </button>
              )}
            </div>
            
            {editingNotes ? (
              <div className="space-y-2">
                <textarea
                  value={notesValue}
                  onChange={(e) => setNotesValue(e.target.value)}
                  placeholder="Add notes about this run..."
                  rows={4}
                  className="w-full px-3 py-3 text-[13px] bg-background-secondary border border-border-secondary text-foreground placeholder-muted-foreground focus:border-muted-foreground focus:outline-none resize-none"
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSaveNotes}
                    disabled={savingNotes}
                    className="px-4 py-2 text-[12px] text-foreground bg-border-secondary hover:bg-muted-foreground disabled:opacity-50 transition-colors min-h-[44px]"
                  >
                    {savingNotes ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={handleCancelNotesEdit}
                    className="px-4 py-2 text-[12px] text-muted-foreground hover:text-foreground transition-colors min-h-[44px]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div>
                {run.notes ? (
                  <p className="text-[13px] text-muted whitespace-pre-wrap">{run.notes}</p>
                ) : (
                  <p className="text-[13px] text-muted-foreground italic">No notes</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Results Section */}
      {run.status === 'completed' && (
        <div className="mb-8 sm:mb-12">
          <p className="text-[11px] text-muted-foreground uppercase tracking-[0.1em] mb-4 sm:mb-6">
            Results
          </p>
          
          {run.summary && (run.summary.primary_metric || run.summary.metrics.length > 0) ? (
            <div className="space-y-6 sm:space-y-8">
              {/* Scrollable metrics container on mobile */}
              <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
                <div className="min-w-fit">
                  <MetricCards
                    primaryMetric={run.summary.primary_metric}
                    metrics={run.summary.metrics}
                  />
                </div>
              </div>
              
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
            <div className="bg-background-secondary border border-border px-4 sm:px-6 py-6 sm:py-8 text-center">
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
      <div className="space-y-6 sm:space-y-8">
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
        <div className="mt-8 sm:mt-12">
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
                className="px-3 py-2 text-[11px] text-muted border border-border-secondary hover:border-muted-foreground hover:text-foreground transition-colors flex items-center gap-2 min-h-[44px]"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span className="hidden sm:inline">Download All</span>
                <span className="sm:hidden">All</span>
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
                        className="flex items-center justify-between gap-3 px-3 sm:px-4 py-3 sm:py-2.5 bg-background-secondary border border-border hover:border-border-secondary hover:bg-background-tertiary transition-all group"
                      >
                        <button
                          onClick={() => setPreviewArtifact(artifact)}
                          className="flex items-center gap-3 flex-1 min-w-0 text-left min-h-[44px]"
                        >
                          <svg className="w-4 h-4 text-muted-foreground group-hover:text-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          <span className="text-[13px] sm:text-[14px] text-muted group-hover:text-foreground font-mono transition-colors truncate">
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
                            className="p-2 text-muted-foreground hover:text-muted transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
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
                              className="flex items-center gap-3 px-3 sm:px-4 py-3 sm:py-2 bg-background-secondary border border-border hover:border-border-secondary transition-colors group min-h-[44px]"
                            >
                              <svg className="w-4 h-4 text-muted-foreground group-hover:text-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                              <span className="text-[13px] sm:text-[14px] text-muted group-hover:text-foreground font-mono transition-colors flex-1 truncate">
                                {artifact.replace('logs/', '')}
                              </span>
                              <span className="text-[11px] text-muted-foreground group-hover:text-muted hidden sm:inline">
                                View Results →
                              </span>
                            </Link>
                          );
                        }
                        
                        return (
                          <div
                            key={artifact}
                            className="flex items-center justify-between gap-3 px-3 sm:px-4 py-3 sm:py-2.5 bg-background-secondary border border-border hover:border-border-secondary hover:bg-background-tertiary transition-all group"
                          >
                            <button
                              onClick={() => setPreviewArtifact(artifact)}
                              className="flex items-center gap-3 flex-1 min-w-0 text-left min-h-[44px]"
                            >
                              <svg className="w-4 h-4 text-muted-foreground group-hover:text-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              <span className="text-[13px] sm:text-[14px] text-muted group-hover:text-foreground font-mono transition-colors truncate">
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
                                className="p-2 text-muted-foreground hover:text-muted transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
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
                      💡 Tip: <span className="hidden sm:inline">Click .eval files to view detailed results in the browser</span>
                      <span className="sm:hidden">Tap .eval files to view results</span>
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

      {/* Duplicate Run Modal */}
      {run.config && (
        <DuplicateRunModal
          isOpen={showDuplicateModal}
          onClose={() => setShowDuplicateModal(false)}
          onDuplicate={handleDuplicate}
          originalConfig={run.config as RunConfig}
          originalModel={run.model}
          benchmark={run.benchmark}
          isSubmitting={duplicating}
        />
      )}
    </Layout>
  );
}
