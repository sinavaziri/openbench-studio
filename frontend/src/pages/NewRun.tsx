import { useEffect, useState, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api, ApiKeyPublic, Benchmark, RunConfig, ModelProvider, BenchmarkRequirements } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Layout from '../components/Layout';
import BenchmarkCatalog from '../components/BenchmarkCatalog';
import { InlineError } from '../components/ErrorBoundary';
import { parseError } from '../utils/errorMessages';

interface IncompatibleModel {
  model_id: string;
  reason: string;
}

interface LocationState {
  prefill?: RunConfig;
}

export default function NewRun() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const formRef = useRef<HTMLDivElement>(null);
  
  // Get prefill from location state (from "Run Again")
  const prefillConfig = (location.state as LocationState)?.prefill;
  
  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKeyPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ title: string; message: string; action?: string; recoverable: boolean } | null>(null);
  
  // Form state
  const [selectedBenchmark, setSelectedBenchmark] = useState<Benchmark | undefined>(
    prefillConfig?.benchmark 
      ? undefined // will be set once benchmarks load
      : undefined
  );
  const [modelProviders, setModelProviders] = useState<ModelProvider[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [model, setModel] = useState(prefillConfig?.model || '');
  const [customModel, setCustomModel] = useState('');
  const [limit, setLimit] = useState<number | undefined>(prefillConfig?.limit ?? 10);
  
  // Compatibility state
  const [compatibleProviders, setCompatibleProviders] = useState<ModelProvider[]>([]);
  const [incompatibleModels, setIncompatibleModels] = useState<IncompatibleModel[]>([]);
  const [showIncompatible, setShowIncompatible] = useState(false);
  const [benchmarkRequirements, setBenchmarkRequirements] = useState<BenchmarkRequirements | null>(null);
  const [compatibilityLoading, setCompatibilityLoading] = useState(false);
  
  // Advanced settings
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [temperature, setTemperature] = useState<number | undefined>(prefillConfig?.temperature);
  const [topP, setTopP] = useState<number | undefined>(prefillConfig?.top_p);
  const [maxTokens, setMaxTokens] = useState<number | undefined>(prefillConfig?.max_tokens);
  const [timeout, setTimeoutValue] = useState<number | undefined>(prefillConfig?.timeout);
  const [epochs, setEpochs] = useState<number | undefined>(prefillConfig?.epochs);
  const [maxConnections, setMaxConnections] = useState<number | undefined>(prefillConfig?.max_connections);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/login');
      return;
    }
    
    if (isAuthenticated) {
      loadData();
    }
  }, [authLoading, isAuthenticated, navigate]);

  // Set prefilled benchmark once benchmarks are loaded
  useEffect(() => {
    if (prefillConfig?.benchmark && benchmarks.length > 0 && !selectedBenchmark) {
      const benchmark = benchmarks.find(b => b.name === prefillConfig.benchmark);
      if (benchmark) {
        setSelectedBenchmark(benchmark);
      }
    }
  }, [benchmarks, prefillConfig, selectedBenchmark]);

  // Listen for model updates from Settings page
  useEffect(() => {
    const handleModelsUpdated = () => {
      if (isAuthenticated) {
        loadData();
        fetchModels();
      }
    };

    window.addEventListener('modelsUpdated', handleModelsUpdated);

    return () => {
      window.removeEventListener('modelsUpdated', handleModelsUpdated);
    };
  }, [isAuthenticated]);

  // Fetch available models
  useEffect(() => {
    if (isAuthenticated) {
      fetchModels();
    }
  }, [apiKeys, isAuthenticated]);

  // Show advanced settings if any are prefilled
  useEffect(() => {
    if (prefillConfig && (
      prefillConfig.temperature !== undefined ||
      prefillConfig.top_p !== undefined ||
      prefillConfig.max_tokens !== undefined ||
      prefillConfig.timeout !== undefined ||
      prefillConfig.epochs !== undefined ||
      prefillConfig.max_connections !== undefined
    )) {
      setShowAdvanced(true);
    }
  }, [prefillConfig]);

  // Fetch compatible models when benchmark changes
  useEffect(() => {
    if (selectedBenchmark && isAuthenticated) {
      fetchCompatibleModels(selectedBenchmark.name);
    } else {
      // No benchmark selected - show all models
      setCompatibleProviders(modelProviders);
      setIncompatibleModels([]);
      setBenchmarkRequirements(null);
    }
  }, [selectedBenchmark, modelProviders, isAuthenticated]);

  const loadData = async () => {
    try {
      const [benchmarksData, keysData] = await Promise.all([
        api.listBenchmarks(),
        api.listApiKeys(),
      ]);
      setBenchmarks(benchmarksData);
      setApiKeys(keysData);
      setError(null);
    } catch (err) {
      const parsed = parseError(err, 'loading-benchmarks');
      setError({
        title: parsed.title,
        message: parsed.message,
        action: parsed.action,
        recoverable: parsed.recoverable,
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchModels = async () => {
    setModelsLoading(true);
    setModelsError(null);
    
    try {
      const response = await api.getAvailableModels(false, true); // Include capabilities
      setModelProviders(response.providers);
    } catch (err) {
      console.error('Failed to fetch available models:', err);
      const parsed = parseError(err, 'loading-models');
      setModelsError(parsed.message);
      setModelProviders([]);
    } finally {
      setModelsLoading(false);
    }
  };

  const fetchCompatibleModels = async (benchmarkName: string) => {
    setCompatibilityLoading(true);
    try {
      const response = await api.getCompatibleModels(benchmarkName);
      setCompatibleProviders(response.providers);
      setIncompatibleModels(response.incompatible);
      setBenchmarkRequirements(response.requirements);
      
      // Clear model selection if current model is incompatible
      if (model && model !== 'custom') {
        const isCompatible = response.providers.some(p => 
          p.models.some(m => m.id === model)
        );
        if (!isCompatible) {
          setModel('');
        }
      }
    } catch (err) {
      console.error('Failed to fetch compatible models:', err);
      // Fallback to all models on error
      setCompatibleProviders(modelProviders);
      setIncompatibleModels([]);
      setBenchmarkRequirements(null);
    } finally {
      setCompatibilityLoading(false);
    }
  };

  const handleBenchmarkSelect = (benchmark: Benchmark) => {
    setSelectedBenchmark(benchmark);
    // Scroll to form
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const finalModel = model === 'custom' ? customModel : model;
    
    if (!selectedBenchmark || !finalModel) return;

    setSubmitting(true);
    setError(null);

    const config: RunConfig = {
      benchmark: selectedBenchmark.name,
      model: finalModel,
      limit,
    };
    
    // Only include advanced settings if they have values
    if (temperature !== undefined) config.temperature = temperature;
    if (topP !== undefined) config.top_p = topP;
    if (maxTokens !== undefined) config.max_tokens = maxTokens;
    if (timeout !== undefined) config.timeout = timeout;
    if (epochs !== undefined) config.epochs = epochs;
    if (maxConnections !== undefined) config.max_connections = maxConnections;

    try {
      const result = await api.createRun(config);
      toast.success(`Run started: ${selectedBenchmark.name}`, {
        icon: '🚀',
      });
      navigate(`/runs/${result.run_id}`);
    } catch (err) {
      const parsed = parseError(err, 'creating-run');
      setError({
        title: parsed.title,
        message: parsed.message,
        action: parsed.action,
        recoverable: parsed.recoverable,
      });
      toast.error(parsed.title);
      setSubmitting(false);
    }
  };

  const handleNumberInput = (
    value: string, 
    setter: (v: number | undefined) => void,
    isFloat: boolean = false
  ) => {
    if (value === '') {
      setter(undefined);
    } else {
      setter(isFloat ? parseFloat(value) : parseInt(value));
    }
  };

  const hasApiKeys = apiKeys.length > 0;

  return (
    <Layout>
      {/* About Section */}
      <div className="mb-8 sm:mb-12">
        <p className="text-[11px] text-muted-foreground uppercase tracking-[0.1em] mb-3 sm:mb-4">
          About
        </p>
        <p className="text-[14px] sm:text-[15px] text-foreground leading-relaxed max-w-2xl">
          OpenBench is a benchmarking platform for evaluating AI models. 
          Monitor runs, compare results, and track performance across different evaluations.
        </p>
      </div>

      {/* API Keys Warning */}
      {!loading && !hasApiKeys && (
        <div className="mb-6 sm:mb-8 py-4 px-4 sm:px-5 bg-warning-bg border border-warning-border">
          <p className="text-[14px] text-warning mb-2">
            ⚠ No API keys configured
          </p>
          <p className="text-[13px] text-warning/70">
            You need to add at least one API key to run benchmarks.{' '}
            <Link to="/settings" className="text-warning hover:underline">
              Go to Settings →
            </Link>
          </p>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mb-6 sm:mb-8">
          <InlineError
            title={error.title}
            message={error.message}
            action={error.action}
            onRetry={error.recoverable ? () => {
              setError(null);
              loadData();
            } : undefined}
            onDismiss={() => setError(null)}
          />
        </div>
      )}

      {/* Benchmark Catalog */}
      {loading || authLoading ? (
        <div className="mb-8 sm:mb-12">
          <div className="h-6 w-48 bg-border animate-pulse mb-4 sm:mb-6" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-32 sm:h-40 bg-border animate-pulse" />
            ))}
          </div>
        </div>
      ) : (
        <BenchmarkCatalog
          benchmarks={benchmarks}
          onBenchmarkSelect={handleBenchmarkSelect}
          selectedBenchmark={selectedBenchmark}
        />
      )}

      {/* Configuration Form - Always visible */}
      <div ref={formRef} className="max-w-2xl mt-8 sm:mt-12 pt-8 sm:pt-12 border-t border-border">
        <h2 className="text-[18px] sm:text-[20px] text-foreground tracking-tight mb-6 sm:mb-8">
          Configure Run
        </h2>

        <form onSubmit={handleSubmit} className="space-y-8 sm:space-y-12">
          {/* Selected Benchmark Info */}
          {selectedBenchmark && (
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-[0.1em] mb-4">
                Selected Benchmark
              </p>
              <div className="p-4 sm:p-5 border border-border bg-background-secondary">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0 mb-3">
                  <h3 className="text-[16px] sm:text-[17px] text-foreground font-medium">
                    {selectedBenchmark.name}
                  </h3>
                  <span className="px-2.5 py-1 text-[11px] text-muted border border-border-secondary uppercase tracking-wide w-fit">
                    {selectedBenchmark.category}
                  </span>
                </div>
                <p className="text-[13px] sm:text-[14px] text-muted leading-relaxed">
                  {selectedBenchmark.description || selectedBenchmark.description_short}
                </p>
                {selectedBenchmark.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-border">
                    {selectedBenchmark.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-1 text-[11px] text-muted-foreground bg-background-tertiary border border-border"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelectedBenchmark(undefined)}
                className="mt-3 text-[13px] text-muted hover:text-foreground transition-colors min-h-[44px] flex items-center"
              >
                ← Change benchmark
              </button>
            </div>
          )}

          {/* Model Selection */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-[11px] text-muted-foreground uppercase tracking-[0.1em]">
                Model
              </p>
              {selectedBenchmark && incompatibleModels.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowIncompatible(!showIncompatible)}
                  className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showIncompatible ? 'Hide' : 'Show'} {incompatibleModels.length} incompatible
                </button>
              )}
            </div>
            
            {/* Benchmark Requirements Badges */}
            {benchmarkRequirements && (benchmarkRequirements.vision || benchmarkRequirements.function_calling || benchmarkRequirements.code_execution || benchmarkRequirements.min_context_length) && (
              <div className="mb-3 flex flex-wrap gap-2">
                {benchmarkRequirements.vision && (
                  <span className="px-2 py-1 text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded">
                    📷 Requires Vision
                  </span>
                )}
                {benchmarkRequirements.function_calling && (
                  <span className="px-2 py-1 text-[10px] bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded">
                    🔧 Requires Function Calling
                  </span>
                )}
                {benchmarkRequirements.code_execution && (
                  <span className="px-2 py-1 text-[10px] bg-green-500/10 text-green-400 border border-green-500/20 rounded">
                    💻 Requires Code Execution
                  </span>
                )}
                {benchmarkRequirements.min_context_length && (
                  <span className="px-2 py-1 text-[10px] bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 rounded">
                    📏 {(benchmarkRequirements.min_context_length / 1000).toFixed(0)}K+ Context
                  </span>
                )}
              </div>
            )}
            
            {(modelsLoading || compatibilityLoading) && (
              <div className="text-[13px] text-muted-foreground mb-3">
                {compatibilityLoading ? 'Filtering compatible models...' : 'Loading available models...'}
              </div>
            )}
            
            {modelsError && (
              <div className="text-[13px] text-error mb-3">
                Error loading models: {modelsError}. You can still enter a custom model below.
              </div>
            )}
            
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={modelsLoading || compatibilityLoading}
              className="w-full px-4 py-3 bg-background border border-border-secondary text-foreground text-[14px] sm:text-[15px] focus:border-foreground transition-colors appearance-none cursor-pointer hover:border-muted-foreground disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px]"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%23666' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 1rem center',
                backgroundSize: '12px 8px',
              }}
            >
              <option value="" disabled>
                {selectedBenchmark 
                  ? `Select a compatible model (${compatibleProviders.reduce((a, p) => a + p.models.length, 0)} available)...`
                  : 'Select a model...'
                }
              </option>
              {compatibleProviders.length === 0 && !modelsLoading && !compatibilityLoading ? (
                <option value="" disabled>
                  {selectedBenchmark 
                    ? 'No compatible models available for this benchmark'
                    : 'No models available - please add API keys in Settings'
                  }
                </option>
              ) : (
                compatibleProviders.map((provider) => (
                  <optgroup key={provider.provider_key} label={provider.name}>
                    {provider.models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                        {m.capabilities?.vision ? ' 📷' : ''}
                        {m.capabilities?.function_calling ? ' 🔧' : ''}
                        {m.capabilities?.code_execution ? ' 💻' : ''}
                        {m.context_length ? ` (${(m.context_length / 1000).toFixed(0)}K)` : ''}
                      </option>
                    ))}
                  </optgroup>
                ))
              )}
              <option value="custom">Custom model...</option>
            </select>
            
            {/* Incompatible models warning */}
            {showIncompatible && incompatibleModels.length > 0 && (
              <div className="mt-3 p-3 bg-orange-500/5 border border-orange-500/20 rounded">
                <p className="text-[12px] text-orange-400 mb-2">
                  Incompatible models for {selectedBenchmark?.name}:
                </p>
                <ul className="text-[11px] text-muted-foreground space-y-1">
                  {incompatibleModels.slice(0, 5).map((m) => (
                    <li key={m.model_id}>
                      <span className="text-muted">{m.model_id}</span>
                      <span className="text-orange-400/70 ml-2">— {m.reason}</span>
                    </li>
                  ))}
                  {incompatibleModels.length > 5 && (
                    <li className="text-muted">... and {incompatibleModels.length - 5} more</li>
                  )}
                </ul>
              </div>
            )}
            
            {model === 'custom' && (
              <div className="mt-3">
                <input
                  type="text"
                  value={customModel}
                  onChange={(e) => setCustomModel(e.target.value)}
                  placeholder="provider/model-name"
                  className="w-full px-4 py-3 bg-transparent border border-border-secondary text-foreground placeholder-muted-foreground text-[14px] sm:text-[15px] focus:border-foreground transition-colors min-h-[48px]"
                />
                <p className="text-[12px] sm:text-[13px] text-muted-foreground mt-2">
                  Enter the model identifier in the format: provider/model-name
                </p>
              </div>
            )}
            
            {model && model !== 'custom' && (
              <p className="text-[12px] sm:text-[13px] text-muted-foreground mt-2 break-all">
                Selected: {model}
              </p>
            )}
          </div>

          {/* Sample Limit */}
          <div>
            <p className="text-[11px] text-muted-foreground uppercase tracking-[0.1em] mb-4">
              Sample Limit
              <span className="ml-2 text-muted-foreground normal-case tracking-normal">(optional)</span>
            </p>
            <input
              type="number"
              value={limit ?? ''}
              onChange={(e) => handleNumberInput(e.target.value, setLimit)}
              placeholder="10"
              min={1}
              max={10000}
              className="w-full sm:w-32 px-4 py-3 bg-transparent border border-border-secondary text-foreground placeholder-muted-foreground text-[14px] sm:text-[15px] focus:border-foreground transition-colors min-h-[48px]"
            />
            <p className="text-[12px] sm:text-[13px] text-muted-foreground mt-2">
              Limit the number of samples to run. Leave empty for full benchmark.
            </p>
          </div>

          {/* Advanced Settings Toggle */}
          <div className="border-t border-border pt-6 sm:pt-8">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-3 text-[13px] text-muted hover:text-foreground transition-colors group min-h-[44px]"
            >
              <span className={`transition-transform ${showAdvanced ? 'rotate-90' : ''}`}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M4 2L8 6L4 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </span>
              <span className="uppercase tracking-[0.1em]">Advanced Settings</span>
              {!showAdvanced && (temperature !== undefined || topP !== undefined || maxTokens !== undefined || timeout !== undefined || epochs !== undefined || maxConnections !== undefined) && (
                <span className="text-[11px] text-muted-foreground normal-case tracking-normal">
                  (configured)
                </span>
              )}
            </button>

            {showAdvanced && (
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                {/* Temperature */}
                <div>
                  <label className="block text-[11px] text-muted-foreground uppercase tracking-[0.1em] mb-2">
                    Temperature
                  </label>
                  <input
                    type="number"
                    value={temperature ?? ''}
                    onChange={(e) => handleNumberInput(e.target.value, setTemperature, true)}
                    placeholder="0.0"
                    step="0.1"
                    min={0}
                    max={2}
                    className="w-full px-3 py-3 sm:py-2 bg-transparent border border-border-secondary text-foreground placeholder-muted-foreground text-[14px] focus:border-foreground transition-colors min-h-[48px] sm:min-h-[44px]"
                  />
                  <p className="text-[11px] sm:text-[12px] text-muted-foreground mt-1.5">
                    Controls randomness (0.0 - 2.0)
                  </p>
                </div>

                {/* Top P */}
                <div>
                  <label className="block text-[11px] text-muted-foreground uppercase tracking-[0.1em] mb-2">
                    Top P
                  </label>
                  <input
                    type="number"
                    value={topP ?? ''}
                    onChange={(e) => handleNumberInput(e.target.value, setTopP, true)}
                    placeholder="1.0"
                    step="0.05"
                    min={0}
                    max={1}
                    className="w-full px-3 py-3 sm:py-2 bg-transparent border border-border-secondary text-foreground placeholder-muted-foreground text-[14px] focus:border-foreground transition-colors min-h-[48px] sm:min-h-[44px]"
                  />
                  <p className="text-[11px] sm:text-[12px] text-muted-foreground mt-1.5">
                    Nucleus sampling (0.0 - 1.0)
                  </p>
                </div>

                {/* Max Tokens */}
                <div>
                  <label className="block text-[11px] text-muted-foreground uppercase tracking-[0.1em] mb-2">
                    Max Tokens
                  </label>
                  <input
                    type="number"
                    value={maxTokens ?? ''}
                    onChange={(e) => handleNumberInput(e.target.value, setMaxTokens)}
                    placeholder="1024"
                    min={1}
                    max={128000}
                    className="w-full px-3 py-3 sm:py-2 bg-transparent border border-border-secondary text-foreground placeholder-muted-foreground text-[14px] focus:border-foreground transition-colors min-h-[48px] sm:min-h-[44px]"
                  />
                  <p className="text-[11px] sm:text-[12px] text-muted-foreground mt-1.5">
                    Maximum tokens per response
                  </p>
                </div>

                {/* Timeout */}
                <div>
                  <label className="block text-[11px] text-muted-foreground uppercase tracking-[0.1em] mb-2">
                    Timeout (seconds)
                  </label>
                  <input
                    type="number"
                    value={timeout ?? ''}
                    onChange={(e) => handleNumberInput(e.target.value, setTimeoutValue)}
                    placeholder="120"
                    min={1}
                    max={3600}
                    className="w-full px-3 py-3 sm:py-2 bg-transparent border border-border-secondary text-foreground placeholder-muted-foreground text-[14px] focus:border-foreground transition-colors min-h-[48px] sm:min-h-[44px]"
                  />
                  <p className="text-[11px] sm:text-[12px] text-muted-foreground mt-1.5">
                    Request timeout per sample
                  </p>
                </div>

                {/* Epochs */}
                <div>
                  <label className="block text-[11px] text-muted-foreground uppercase tracking-[0.1em] mb-2">
                    Epochs
                  </label>
                  <input
                    type="number"
                    value={epochs ?? ''}
                    onChange={(e) => handleNumberInput(e.target.value, setEpochs)}
                    placeholder="1"
                    min={1}
                    max={100}
                    className="w-full px-3 py-3 sm:py-2 bg-transparent border border-border-secondary text-foreground placeholder-muted-foreground text-[14px] focus:border-foreground transition-colors min-h-[48px] sm:min-h-[44px]"
                  />
                  <p className="text-[11px] sm:text-[12px] text-muted-foreground mt-1.5">
                    Number of evaluation passes
                  </p>
                </div>

                {/* Max Connections */}
                <div>
                  <label className="block text-[11px] text-muted-foreground uppercase tracking-[0.1em] mb-2">
                    Max Connections
                  </label>
                  <input
                    type="number"
                    value={maxConnections ?? ''}
                    onChange={(e) => handleNumberInput(e.target.value, setMaxConnections)}
                    placeholder="10"
                    min={1}
                    max={100}
                    className="w-full px-3 py-3 sm:py-2 bg-transparent border border-border-secondary text-foreground placeholder-muted-foreground text-[14px] focus:border-foreground transition-colors min-h-[48px] sm:min-h-[44px]"
                  />
                  <p className="text-[11px] sm:text-[12px] text-muted-foreground mt-1.5">
                    Concurrent API connections
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={!selectedBenchmark || !model || (model === 'custom' && !customModel) || submitting || modelsLoading || compatibilityLoading}
            className="w-full sm:w-auto px-8 py-3 bg-accent text-accent-foreground text-[14px] tracking-wide disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-90 transition-opacity min-h-[48px]"
          >
            {submitting ? 'Starting...' : (modelsLoading || compatibilityLoading) ? 'Loading...' : 'Start Run'}
          </button>
        </form>
      </div>
    </Layout>
  );
}
