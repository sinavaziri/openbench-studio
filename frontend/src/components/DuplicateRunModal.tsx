import { useState, useEffect } from 'react';
import { RunConfig, RunDuplicateOverrides } from '../api/client';

interface DuplicateRunModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDuplicate: (overrides: RunDuplicateOverrides) => void;
  originalConfig: RunConfig;
  originalModel: string;
  benchmark: string;
  isSubmitting: boolean;
}

export default function DuplicateRunModal({
  isOpen,
  onClose,
  onDuplicate,
  originalConfig,
  originalModel,
  benchmark,
  isSubmitting,
}: DuplicateRunModalProps) {
  // Initialize form state from original config
  const [model, setModel] = useState(originalModel);
  const [limit, setLimit] = useState<number | undefined>(originalConfig.limit);
  const [temperature, setTemperature] = useState<number | undefined>(originalConfig.temperature);
  const [topP, setTopP] = useState<number | undefined>(originalConfig.top_p);
  const [maxTokens, setMaxTokens] = useState<number | undefined>(originalConfig.max_tokens);
  const [timeout, setTimeoutValue] = useState<number | undefined>(originalConfig.timeout);
  const [epochs, setEpochs] = useState<number | undefined>(originalConfig.epochs);
  const [maxConnections, setMaxConnections] = useState<number | undefined>(originalConfig.max_connections);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setModel(originalModel);
      setLimit(originalConfig.limit);
      setTemperature(originalConfig.temperature);
      setTopP(originalConfig.top_p);
      setMaxTokens(originalConfig.max_tokens);
      setTimeoutValue(originalConfig.timeout);
      setEpochs(originalConfig.epochs);
      setMaxConnections(originalConfig.max_connections);
      // Show advanced if any advanced settings are configured
      setShowAdvanced(
        originalConfig.temperature !== undefined ||
        originalConfig.top_p !== undefined ||
        originalConfig.max_tokens !== undefined ||
        originalConfig.timeout !== undefined ||
        originalConfig.epochs !== undefined ||
        originalConfig.max_connections !== undefined
      );
    }
  }, [isOpen, originalConfig, originalModel]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const overrides: RunDuplicateOverrides = {};
    
    // Only include values that differ from original
    if (model !== originalModel) overrides.model = model;
    if (limit !== originalConfig.limit) overrides.limit = limit;
    if (temperature !== originalConfig.temperature) overrides.temperature = temperature;
    if (topP !== originalConfig.top_p) overrides.top_p = topP;
    if (maxTokens !== originalConfig.max_tokens) overrides.max_tokens = maxTokens;
    if (timeout !== originalConfig.timeout) overrides.timeout = timeout;
    if (epochs !== originalConfig.epochs) overrides.epochs = epochs;
    if (maxConnections !== originalConfig.max_connections) overrides.max_connections = maxConnections;
    
    onDuplicate(overrides);
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

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-lg mx-4 bg-background border border-border shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-background border-b border-border px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-[18px] text-foreground">Duplicate Run</h2>
            <p className="text-[13px] text-muted-foreground mt-1">{benchmark}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Model */}
          <div>
            <label className="block text-[11px] text-muted-foreground uppercase tracking-[0.1em] mb-2">
              Model
            </label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="provider/model-name"
              className="w-full px-4 py-3 bg-background-secondary border border-border-secondary text-foreground placeholder-muted-foreground text-[14px] focus:border-foreground focus:outline-none transition-colors"
            />
          </div>

          {/* Sample Limit */}
          <div>
            <label className="block text-[11px] text-muted-foreground uppercase tracking-[0.1em] mb-2">
              Sample Limit
            </label>
            <input
              type="number"
              value={limit ?? ''}
              onChange={(e) => handleNumberInput(e.target.value, setLimit)}
              placeholder="No limit"
              min={1}
              className="w-full sm:w-32 px-4 py-3 bg-background-secondary border border-border-secondary text-foreground placeholder-muted-foreground text-[14px] focus:border-foreground focus:outline-none transition-colors"
            />
          </div>

          {/* Advanced Settings Toggle */}
          <div className="border-t border-border pt-4">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-3 text-[13px] text-muted hover:text-foreground transition-colors"
            >
              <span className={`transition-transform ${showAdvanced ? 'rotate-90' : ''}`}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M4 2L8 6L4 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </span>
              <span className="uppercase tracking-[0.1em]">Advanced Settings</span>
            </button>

            {showAdvanced && (
              <div className="mt-4 grid grid-cols-2 gap-4">
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
                    className="w-full px-3 py-2 bg-background-secondary border border-border-secondary text-foreground placeholder-muted-foreground text-[14px] focus:border-foreground focus:outline-none transition-colors"
                  />
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
                    className="w-full px-3 py-2 bg-background-secondary border border-border-secondary text-foreground placeholder-muted-foreground text-[14px] focus:border-foreground focus:outline-none transition-colors"
                  />
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
                    className="w-full px-3 py-2 bg-background-secondary border border-border-secondary text-foreground placeholder-muted-foreground text-[14px] focus:border-foreground focus:outline-none transition-colors"
                  />
                </div>

                {/* Timeout */}
                <div>
                  <label className="block text-[11px] text-muted-foreground uppercase tracking-[0.1em] mb-2">
                    Timeout (s)
                  </label>
                  <input
                    type="number"
                    value={timeout ?? ''}
                    onChange={(e) => handleNumberInput(e.target.value, setTimeoutValue)}
                    placeholder="120"
                    min={1}
                    className="w-full px-3 py-2 bg-background-secondary border border-border-secondary text-foreground placeholder-muted-foreground text-[14px] focus:border-foreground focus:outline-none transition-colors"
                  />
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
                    className="w-full px-3 py-2 bg-background-secondary border border-border-secondary text-foreground placeholder-muted-foreground text-[14px] focus:border-foreground focus:outline-none transition-colors"
                  />
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
                    className="w-full px-3 py-2 bg-background-secondary border border-border-secondary text-foreground placeholder-muted-foreground text-[14px] focus:border-foreground focus:outline-none transition-colors"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-[13px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!model || isSubmitting}
              className="px-6 py-2 bg-accent text-accent-foreground text-[13px] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
            >
              {isSubmitting ? 'Starting...' : 'Start Duplicate Run'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
