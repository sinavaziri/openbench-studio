import { useEffect, useState } from 'react';
import type { ApiKeyPublic, Benchmark, RunConfig, ModelProvider } from '../api/client';
import { api } from '../api/client';

interface RunFormProps {
  benchmarks: Benchmark[];
  apiKeys: ApiKeyPublic[];
  onSubmit: (config: RunConfig) => void;
  loading?: boolean;
  prefill?: RunConfig;  // Pre-fill form from "Run Again"
}

export default function RunForm({ benchmarks, apiKeys, onSubmit, loading, prefill }: RunFormProps) {
  // State for dynamically fetched models
  const [modelProviders, setModelProviders] = useState<ModelProvider[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState<string | null>(null);
  
  // Check if prefilled model exists in the fetched models
  const allModelIds = modelProviders.flatMap(p => p.models.map(m => m.id));
  const isPrefillModelKnown = prefill?.model ? allModelIds.includes(prefill.model) : false;
  
  const [benchmark, setBenchmark] = useState(prefill?.benchmark || '');
  const [model, setModel] = useState(
    prefill?.model 
      ? (isPrefillModelKnown ? prefill.model : 'custom')
      : ''
  );
  const [customModel, setCustomModel] = useState(
    prefill?.model && !isPrefillModelKnown ? prefill.model : ''
  );
  const [limit, setLimit] = useState<number | undefined>(prefill?.limit ?? 10);
  
  // Advanced settings
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [temperature, setTemperature] = useState<number | undefined>(prefill?.temperature);
  const [topP, setTopP] = useState<number | undefined>(prefill?.top_p);
  const [maxTokens, setMaxTokens] = useState<number | undefined>(prefill?.max_tokens);
  const [timeout, setTimeout] = useState<number | undefined>(prefill?.timeout);
  const [epochs, setEpochs] = useState<number | undefined>(prefill?.epochs);
  const [maxConnections, setMaxConnections] = useState<number | undefined>(prefill?.max_connections);

  // Fetch available models when component mounts or API keys change
  useEffect(() => {
    const fetchModels = async () => {
      setModelsLoading(true);
      setModelsError(null);
      
      try {
        const response = await api.getAvailableModels();
        setModelProviders(response.providers);
      } catch (error) {
        console.error('Failed to fetch available models:', error);
        setModelsError(error instanceof Error ? error.message : 'Failed to load models');
        // Set empty providers list on error (will show custom model option only)
        setModelProviders([]);
      } finally {
        setModelsLoading(false);
      }
    };
    
    fetchModels();
    
    // Listen for model updates from Settings page
    const handleModelsUpdated = () => {
      console.log('Models updated event received, refreshing...');
      fetchModels();
    };
    
    window.addEventListener('modelsUpdated', handleModelsUpdated);
    
    return () => {
      window.removeEventListener('modelsUpdated', handleModelsUpdated);
    };
  }, [apiKeys]); // Re-fetch when API keys change

  // Show advanced settings if any are prefilled
  useEffect(() => {
    if (prefill && (
      prefill.temperature !== undefined ||
      prefill.top_p !== undefined ||
      prefill.max_tokens !== undefined ||
      prefill.timeout !== undefined ||
      prefill.epochs !== undefined ||
      prefill.max_connections !== undefined
    )) {
      setShowAdvanced(true);
    }
  }, [prefill]);

  // Filter out separator/divider entries and invalid benchmarks
  const validBenchmarks = benchmarks.filter((b) => {
    // Filter out entries that are just dividers, separators, or box-drawing characters
    if (!b.name || typeof b.name !== 'string') return false;
    
    // Filter out entries that are only dashes, underscores, or box-drawing characters
    const trimmedName = b.name.trim();
    if (!trimmedName) return false;
    if (/^[─━┄┅┈┉╌╍═_-]+$/.test(trimmedName)) return false;
    if (/^[╭╮╯╰├┤┬┴┼│┃║╠╣╦╩╬]+$/.test(trimmedName)) return false;
    
    // Filter out entries that look like category headers (e.g., "Core Benchmarks")
    if (/^(Core|Community|Custom|Available)\s+(Benchmark|Category)/i.test(trimmedName)) return false;
    
    return true;
  });

  // Separate featured and additional benchmarks
  const featuredBenchmarks = validBenchmarks.filter((b) => b.featured);
  const additionalBenchmarks = validBenchmarks.filter((b) => !b.featured);

  const selectedBenchmark = validBenchmarks.find((b) => b.name === benchmark);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Determine the final model value
    const finalModel = model === 'custom' ? customModel : model;
    
    if (!benchmark || !finalModel) return;

    const config: RunConfig = {
      benchmark,
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

    onSubmit(config);
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

  return (
    <form onSubmit={handleSubmit} className="space-y-12">
      {/* Benchmark Selection */}
      <div>
        <p className="text-[11px] text-[#666] uppercase tracking-[0.1em] mb-4">
          Popular Benchmarks
        </p>
        <div className="grid grid-cols-2 gap-3 mb-6">
          {featuredBenchmarks.map((b, index) => (
            <button
              key={`${b.name}-${index}`}
              type="button"
              onClick={() => setBenchmark(b.name)}
              className={`relative p-4 text-left transition-all border ${
                benchmark === b.name
                  ? 'border-white bg-[#111]'
                  : 'border-[#222] hover:border-[#444]'
              }`}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <span className="text-[15px] text-white break-words flex-1">
                  {b.name}
                </span>
                <span className="text-[11px] text-[#666] uppercase tracking-wide flex-shrink-0">
                  {b.category}
                </span>
              </div>
              <p className="text-[13px] text-[#666] line-clamp-2 break-words">
                {b.description_short}
              </p>
            </button>
          ))}
        </div>

        {/* Additional Benchmarks Dropdown */}
        {additionalBenchmarks.length > 0 && (
          <div>
            <p className="text-[11px] text-[#666] uppercase tracking-[0.1em] mb-3">
              More Benchmarks
            </p>
            <select
              value={additionalBenchmarks.some(b => b.name === benchmark) ? benchmark : ''}
              onChange={(e) => setBenchmark(e.target.value)}
              className="w-full px-4 py-3 bg-[#0c0c0c] border border-[#222] text-white text-[15px] focus:border-white transition-colors appearance-none cursor-pointer hover:border-[#444]"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%23666' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 1rem center',
                backgroundSize: '12px 8px',
              }}
            >
              <option value="">Select additional benchmark...</option>
              {additionalBenchmarks.map((b) => (
                <option key={b.name} value={b.name}>
                  {b.name} - {b.description_short}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Model Selection */}
      <div>
        <p className="text-[11px] text-[#666] uppercase tracking-[0.1em] mb-4">
          Model
        </p>
        
        {modelsLoading && (
          <div className="text-[13px] text-[#666] mb-3">
            Loading available models...
          </div>
        )}
        
        {modelsError && (
          <div className="text-[13px] text-red-400 mb-3">
            Error loading models: {modelsError}. You can still enter a custom model below.
          </div>
        )}
        
        <select
          id="model"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          disabled={modelsLoading}
          className="w-full px-4 py-3 bg-[#0c0c0c] border border-[#222] text-white text-[15px] focus:border-white transition-colors appearance-none cursor-pointer hover:border-[#444] disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%23666' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 1rem center',
            backgroundSize: '12px 8px',
          }}
        >
          <option value="" disabled>Select a model...</option>
          {modelProviders.length === 0 && !modelsLoading ? (
            <option value="" disabled>No models available - please add API keys in Settings</option>
          ) : (
            modelProviders.map((provider) => (
              <optgroup key={provider.provider_key} label={provider.name}>
                {provider.models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}{m.description ? ` - ${m.description}` : ''}
                  </option>
                ))}
              </optgroup>
            ))
          )}
        </select>
        
        {/* Custom Model Input */}
        {model === 'custom' && (
          <div className="mt-3">
            <input
              type="text"
              value={customModel}
              onChange={(e) => setCustomModel(e.target.value)}
              placeholder="provider/model-name"
              className="w-full px-4 py-3 bg-transparent border border-[#222] text-white placeholder-[#444] text-[15px] focus:border-white transition-colors"
            />
            <p className="text-[13px] text-[#666] mt-2">
              Enter the model identifier in the format: provider/model-name
            </p>
          </div>
        )}
        
        {model && model !== 'custom' && (
          <p className="text-[13px] text-[#666] mt-2">
            Selected: {model}
          </p>
        )}
      </div>

      {/* Limit Input */}
      <div>
        <p className="text-[11px] text-[#666] uppercase tracking-[0.1em] mb-4">
          Sample Limit
          <span className="ml-2 text-[#444] normal-case tracking-normal">(optional)</span>
        </p>
        <input
          id="limit"
          type="number"
          value={limit ?? ''}
          onChange={(e) => handleNumberInput(e.target.value, setLimit)}
          placeholder="10"
          min={1}
          max={10000}
          className="w-32 px-4 py-3 bg-transparent border border-[#222] text-white placeholder-[#444] text-[15px] focus:border-white transition-colors"
        />
        <p className="text-[13px] text-[#666] mt-2">
          Limit the number of samples to run. Leave empty for full benchmark.
        </p>
      </div>

      {/* Advanced Settings Toggle */}
      <div className="border-t border-[#1a1a1a] pt-8">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-3 text-[13px] text-[#888] hover:text-white transition-colors group"
        >
          <span className={`transition-transform ${showAdvanced ? 'rotate-90' : ''}`}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M4 2L8 6L4 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </span>
          <span className="uppercase tracking-[0.1em]">Advanced Settings</span>
          {!showAdvanced && (temperature !== undefined || topP !== undefined || maxTokens !== undefined || timeout !== undefined || epochs !== undefined || maxConnections !== undefined) && (
            <span className="text-[11px] text-[#555] normal-case tracking-normal">
              (configured)
            </span>
          )}
        </button>

        {showAdvanced && (
          <div className="mt-6 grid grid-cols-2 gap-6">
            {/* Temperature */}
            <div>
              <label className="block text-[11px] text-[#666] uppercase tracking-[0.1em] mb-2">
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
                className="w-full px-3 py-2 bg-transparent border border-[#222] text-white placeholder-[#444] text-[14px] focus:border-white transition-colors"
              />
              <p className="text-[12px] text-[#555] mt-1.5">
                Controls randomness (0.0 - 2.0)
              </p>
            </div>

            {/* Top P */}
            <div>
              <label className="block text-[11px] text-[#666] uppercase tracking-[0.1em] mb-2">
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
                className="w-full px-3 py-2 bg-transparent border border-[#222] text-white placeholder-[#444] text-[14px] focus:border-white transition-colors"
              />
              <p className="text-[12px] text-[#555] mt-1.5">
                Nucleus sampling (0.0 - 1.0)
              </p>
            </div>

            {/* Max Tokens */}
            <div>
              <label className="block text-[11px] text-[#666] uppercase tracking-[0.1em] mb-2">
                Max Tokens
              </label>
              <input
                type="number"
                value={maxTokens ?? ''}
                onChange={(e) => handleNumberInput(e.target.value, setMaxTokens)}
                placeholder="1024"
                min={1}
                max={128000}
                className="w-full px-3 py-2 bg-transparent border border-[#222] text-white placeholder-[#444] text-[14px] focus:border-white transition-colors"
              />
              <p className="text-[12px] text-[#555] mt-1.5">
                Maximum tokens per response
              </p>
            </div>

            {/* Timeout */}
            <div>
              <label className="block text-[11px] text-[#666] uppercase tracking-[0.1em] mb-2">
                Timeout (seconds)
              </label>
              <input
                type="number"
                value={timeout ?? ''}
                onChange={(e) => handleNumberInput(e.target.value, setTimeout)}
                placeholder="120"
                min={1}
                max={3600}
                className="w-full px-3 py-2 bg-transparent border border-[#222] text-white placeholder-[#444] text-[14px] focus:border-white transition-colors"
              />
              <p className="text-[12px] text-[#555] mt-1.5">
                Request timeout per sample
              </p>
            </div>

            {/* Epochs */}
            <div>
              <label className="block text-[11px] text-[#666] uppercase tracking-[0.1em] mb-2">
                Epochs
              </label>
              <input
                type="number"
                value={epochs ?? ''}
                onChange={(e) => handleNumberInput(e.target.value, setEpochs)}
                placeholder="1"
                min={1}
                max={100}
                className="w-full px-3 py-2 bg-transparent border border-[#222] text-white placeholder-[#444] text-[14px] focus:border-white transition-colors"
              />
              <p className="text-[12px] text-[#555] mt-1.5">
                Number of evaluation passes
              </p>
            </div>

            {/* Max Connections */}
            <div>
              <label className="block text-[11px] text-[#666] uppercase tracking-[0.1em] mb-2">
                Max Connections
              </label>
              <input
                type="number"
                value={maxConnections ?? ''}
                onChange={(e) => handleNumberInput(e.target.value, setMaxConnections)}
                placeholder="10"
                min={1}
                max={100}
                className="w-full px-3 py-2 bg-transparent border border-[#222] text-white placeholder-[#444] text-[14px] focus:border-white transition-colors"
              />
              <p className="text-[12px] text-[#555] mt-1.5">
                Concurrent API connections
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Selected Benchmark Info */}
      {selectedBenchmark && (
        <div className="border-t border-[#1a1a1a] pt-8">
          <p className="text-[11px] text-[#666] uppercase tracking-[0.1em] mb-4">
            Selected Benchmark
          </p>
          <div className="p-5 border border-[#1a1a1a] bg-[#0a0a0a]">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[17px] text-white font-medium">
                {selectedBenchmark.name}
              </h3>
              <span className="px-2.5 py-1 text-[11px] text-[#888] border border-[#222] uppercase tracking-wide">
                {selectedBenchmark.category}
              </span>
            </div>
            <p className="text-[14px] text-[#888] leading-relaxed">
              {selectedBenchmark.description || selectedBenchmark.description_short}
            </p>
            {selectedBenchmark.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-[#1a1a1a]">
                {selectedBenchmark.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-1 text-[11px] text-[#666] bg-[#111] border border-[#1a1a1a]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Submit Button */}
      <button
        type="submit"
        disabled={!benchmark || !model || (model === 'custom' && !customModel) || loading || modelsLoading}
        className="px-8 py-3 bg-white text-[#0c0c0c] text-[14px] tracking-wide disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
      >
        {loading ? 'Starting...' : modelsLoading ? 'Loading...' : 'Start Run'}
      </button>
    </form>
  );
}
