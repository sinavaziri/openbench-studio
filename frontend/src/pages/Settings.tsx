import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api, ApiKeyPublic, ApiKeyProvider, CostsResponse, CostThreshold } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { parseError } from '../utils/errorMessages';
import Layout from '../components/Layout';
import { InlineError } from '../components/ErrorBoundary';
import ProviderSelector from '../components/ProviderSelector';
import { getProviderDisplay, ProviderDefinition } from '../data/providers';

interface ProviderCardProps {
  providerId: string;
  displayName: string;
  envVar: string;
  color: string;
  existingKey?: ApiKeyPublic;
  onSave: (provider: ApiKeyProvider, key: string, customEnvVar?: string) => Promise<void>;
  onDelete: (provider: ApiKeyProvider) => Promise<void>;
  autoEdit?: boolean;
}

function ProviderCard({ providerId, displayName, envVar, color, existingKey, onSave, onDelete, autoEdit = false }: ProviderCardProps) {
  const [isEditing, setIsEditing] = useState(autoEdit);
  const [keyValue, setKeyValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!keyValue.trim()) {
      setError('API key is required');
      toast.error('API key is required');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      // For custom providers, pass the custom env var
      const customEnvVar = existingKey?.custom_env_var || undefined;
      await onSave(providerId, keyValue, customEnvVar);
      setKeyValue('');
      setIsEditing(false);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to save API key';
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setLoading(true);
    setError(null);
    
    try {
      await onDelete(providerId);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to delete API key';
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-background-secondary border border-border p-4 sm:p-5 hover:border-border-secondary transition-colors">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div 
            className="w-2 h-8 rounded-full flex-shrink-0"
            style={{ backgroundColor: color }}
          />
          <div className="min-w-0 flex-1">
            <h3 className="text-[14px] sm:text-[15px] text-foreground truncate">{displayName}</h3>
            <p className="text-[11px] sm:text-[12px] text-muted-foreground font-mono truncate">{envVar}</p>
          </div>
        </div>
        
        {existingKey && !isEditing && (
          <span className="px-2 py-1 text-[11px] text-success bg-success-bg border border-success-border flex-shrink-0 ml-2">
            Configured
          </span>
        )}
      </div>
      
      {isEditing ? (
        <div className="space-y-3">
          <input
            type="password"
            value={keyValue}
            onChange={(e) => setKeyValue(e.target.value)}
            placeholder={existingKey ? 'Enter new key to update...' : 'Enter API key...'}
            className="w-full px-3 py-3 sm:py-2 bg-background-tertiary border border-border-secondary text-foreground text-[13px] sm:text-[14px] font-mono focus:border-muted-foreground focus:outline-none transition-colors min-h-[48px] sm:min-h-[44px]"
            autoFocus
          />
          
          {error && (
            <p className="text-[12px] text-error">{error}</p>
          )}
          
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <button
              onClick={handleSave}
              disabled={loading}
              className="px-4 py-3 sm:py-2 text-[13px] text-accent-foreground bg-accent hover:opacity-90 disabled:opacity-50 transition-colors min-h-[48px] sm:min-h-[44px]"
            >
              {loading ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={() => {
                setIsEditing(false);
                setKeyValue('');
                setError(null);
              }}
              className="px-4 py-3 sm:py-2 text-[13px] text-muted hover:text-foreground transition-colors min-h-[48px] sm:min-h-[44px]"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-2">
          {existingKey ? (
            <>
              <span className="text-[13px] sm:text-[14px] text-muted-foreground font-mono">
                {existingKey.key_preview}
              </span>
              <div className="flex items-center gap-2 sm:ml-auto">
                <button
                  onClick={() => setIsEditing(true)}
                  className="flex-1 sm:flex-none px-3 py-2 text-[12px] text-muted border border-border-secondary hover:border-muted-foreground hover:text-foreground transition-colors min-h-[44px]"
                >
                  Update
                </button>
                <button
                  onClick={handleDelete}
                  disabled={loading}
                  className="flex-1 sm:flex-none px-3 py-2 text-[12px] text-error border border-error-border hover:border-error transition-colors disabled:opacity-50 min-h-[44px]"
                >
                  {loading ? '...' : 'Delete'}
                </button>
              </div>
            </>
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              className="w-full sm:w-auto px-4 py-3 sm:py-2 text-[13px] text-muted border border-border-secondary hover:border-muted-foreground hover:text-foreground transition-colors min-h-[48px] sm:min-h-[44px]"
            >
              Add Key
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function Settings() {
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useAuth();
  
  const [apiKeys, setApiKeys] = useState<ApiKeyPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ title: string; message: string; recoverable: boolean } | null>(null);
  const [refreshingModels, setRefreshingModels] = useState(false);
  const [showProviderSelector, setShowProviderSelector] = useState(false);
  const [newProvider, setNewProvider] = useState<{ id: string; displayName: string; envVar: string; color: string; customEnvVar?: string } | null>(null);
  const [versionInfo, setVersionInfo] = useState<{ web_ui: string; openbench: string | null; openbench_available: boolean } | null>(null);
  const [costStats, setCostStats] = useState<CostsResponse | null>(null);
  const [costThreshold, setCostThreshold] = useState<CostThreshold | null>(null);
  const [costPeriod, setCostPeriod] = useState<number>(30);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    loadData();
  }, [isAuthenticated, navigate]);

  // Load cost data when period changes
  useEffect(() => {
    if (isAuthenticated) {
      loadCostData();
    }
  }, [isAuthenticated, costPeriod]);

  const loadCostData = async () => {
    try {
      const [costs, thresholds] = await Promise.all([
        api.getCostStats(costPeriod).catch(() => null),
        api.getCostThresholds(costPeriod).catch(() => null),
      ]);
      if (costs) setCostStats(costs);
      if (thresholds) setCostThreshold(thresholds);
    } catch {
      // Ignore cost loading errors
    }
  };

  const loadData = async () => {
    try {
      const [keysData, version] = await Promise.all([
        api.listApiKeys(),
        api.getVersion().catch(() => null),
      ]);
      setApiKeys(keysData);
      if (version) {
        setVersionInfo(version);
      }
      setError(null);
    } catch (err) {
      const parsed = parseError(err);
      setError({
        title: parsed.title,
        message: parsed.action ? `${parsed.message} ${parsed.action}` : parsed.message,
        recoverable: parsed.recoverable,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveKey = async (provider: ApiKeyProvider, key: string, customEnvVar?: string) => {
    await api.createOrUpdateApiKey({ provider, key, custom_env_var: customEnvVar });
    
    // Clear the new provider state after successful save
    if (newProvider && newProvider.id === provider) {
      setNewProvider(null);
    }
    
    const display = getProviderDisplay(provider);
    toast.success(`API key saved: ${display.name}`, {
      icon: '🔑',
    });
    
    await loadData();
    // Refresh available models after key change
    await refreshModels();
    // Notify other components that models have been updated
    window.dispatchEvent(new CustomEvent('modelsUpdated'));
  };

  const handleDeleteKey = async (provider: ApiKeyProvider) => {
    await api.deleteApiKey(provider);
    
    const display = getProviderDisplay(provider);
    toast.success(`API key deleted: ${display.name}`);
    
    await loadData();
    // Refresh available models after key change
    await refreshModels();
    // Notify other components that models have been updated
    window.dispatchEvent(new CustomEvent('modelsUpdated'));
  };

  const handleProviderSelect = (provider: ProviderDefinition | { id: string; displayName: string; envVar: string; color: string; isCustom: true }) => {
    setShowProviderSelector(false);
    
    // Set up the new provider for editing
    if ('isCustom' in provider && provider.isCustom) {
      setNewProvider({
        id: provider.id,
        displayName: provider.displayName,
        envVar: provider.envVar,
        color: provider.color,
        customEnvVar: provider.envVar,
      });
    } else {
      setNewProvider({
        id: provider.id,
        displayName: provider.displayName,
        envVar: provider.envVar,
        color: provider.color,
      });
    }
  };

  const handleCancelNewProvider = () => {
    setNewProvider(null);
  };

  const refreshModels = async () => {
    setRefreshingModels(true);
    try {
      // Force refresh the models cache
      await api.getAvailableModels(true);
      toast.success('Models refreshed', { icon: '🔄' });
    } catch (err) {
      console.error('Failed to refresh models:', err);
      toast.error('Failed to refresh models');
    } finally {
      setRefreshingModels(false);
    }
  };

  const handleLogout = () => {
    logout();
    toast.success('Signed out successfully');
    navigate('/');
  };

  if (loading) {
    return (
      <Layout>
        <div className="space-y-6 sm:space-y-8">
          <div className="h-8 w-32 sm:w-48 bg-border rounded animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-28 sm:h-32 bg-border rounded animate-pulse" />
            ))}
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {/* Header */}
      <div className="mb-8 sm:mb-12">
        <Link
          to="/"
          className="text-[13px] text-muted-foreground hover:text-foreground transition-colors mb-4 inline-flex items-center min-h-[44px]"
        >
          ← Back
        </Link>
        <h1 className="text-[22px] sm:text-[28px] text-foreground tracking-tight mb-2">
          Settings
        </h1>
        <p className="text-[14px] sm:text-[15px] text-muted-foreground">
          Manage your account and API keys
        </p>
      </div>

      {error && (
        <div className="mb-6 sm:mb-8">
          <InlineError 
            title={error.title}
            message={error.message}
            onRetry={error.recoverable ? () => {
              setError(null);
              loadData();
            } : undefined}
            onDismiss={() => setError(null)}
          />
        </div>
      )}

      {/* Account Section */}
      <div className="mb-8 sm:mb-12">
        <p className="text-[11px] text-muted-foreground uppercase tracking-[0.1em] mb-4 sm:mb-6">
          Account
        </p>
        <div className="bg-background-secondary border border-border p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[14px] sm:text-[15px] text-foreground mb-1 truncate">{user?.email}</p>
              <p className="text-[11px] sm:text-[12px] text-muted-foreground">
                Member since {user?.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="w-full sm:w-auto px-4 py-3 sm:py-2 text-[13px] text-muted border border-border-secondary hover:border-muted-foreground hover:text-foreground transition-colors min-h-[48px] sm:min-h-[44px]"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>

      {/* Version Information */}
      {versionInfo && (
        <div className="mb-8 sm:mb-12">
          <p className="text-[11px] text-muted-foreground uppercase tracking-[0.1em] mb-4 sm:mb-6">
            Version Information
          </p>
          <div className="bg-background-secondary border border-border p-4 sm:p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              <div>
                <p className="text-[11px] sm:text-[12px] text-muted-foreground mb-1">Web UI</p>
                <p className="text-[13px] sm:text-[14px] text-foreground font-mono">{versionInfo.web_ui}</p>
              </div>
              <div>
                <p className="text-[11px] sm:text-[12px] text-muted-foreground mb-1">OpenBench CLI</p>
                {versionInfo.openbench_available ? (
                  <p className="text-[13px] sm:text-[14px] text-foreground font-mono">{versionInfo.openbench}</p>
                ) : (
                  <p className="text-[13px] sm:text-[14px] text-muted">Not installed</p>
                )}
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-border">
              <a
                href="https://github.com/groq/openbench"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[12px] text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1 min-h-[44px]"
              >
                View OpenBench on GitHub →
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Cost Tracking Section */}
      {costStats && (
        <div className="mb-8 sm:mb-12">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 sm:mb-6">
            <p className="text-[11px] text-muted-foreground uppercase tracking-[0.1em]">
              API Cost Summary
            </p>
            <select
              value={costPeriod}
              onChange={(e) => setCostPeriod(Number(e.target.value))}
              className="px-3 py-2 bg-background-secondary border border-border text-foreground text-[12px] focus:border-border-secondary focus:outline-none transition-colors cursor-pointer"
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
              <option value={365}>Last year</option>
            </select>
          </div>
          
          <div className="bg-background-secondary border border-border p-4 sm:p-6">
            {/* Cost Warning */}
            {costThreshold && (costThreshold.is_warning || costThreshold.is_critical) && (
              <div className={`mb-4 p-3 border ${costThreshold.is_critical ? 'bg-error-bg border-error-border' : 'bg-warning-bg border-warning-border'}`}>
                <p className={`text-[13px] ${costThreshold.is_critical ? 'text-error' : 'text-warning-foreground'}`}>
                  ⚠️ {costThreshold.is_critical ? 'Critical' : 'Warning'}: You've reached {costThreshold.percentage_of_warning.toFixed(0)}% of your warning threshold (${costThreshold.warning_threshold})
                </p>
              </div>
            )}
            
            {/* Cost Summary Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6 mb-6">
              <div>
                <p className="text-[11px] sm:text-[12px] text-muted-foreground mb-1">Total Cost</p>
                <p className="text-[18px] sm:text-[22px] text-foreground font-light tabular-nums">
                  ${costStats.total_cost < 1 ? costStats.total_cost.toFixed(3) : costStats.total_cost.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-[11px] sm:text-[12px] text-muted-foreground mb-1">Total Tokens</p>
                <p className="text-[18px] sm:text-[22px] text-foreground font-light tabular-nums">
                  {costStats.total_tokens.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-[11px] sm:text-[12px] text-muted-foreground mb-1">Input Tokens</p>
                <p className="text-[14px] sm:text-[16px] text-muted-foreground tabular-nums">
                  {costStats.total_input_tokens.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-[11px] sm:text-[12px] text-muted-foreground mb-1">Output Tokens</p>
                <p className="text-[14px] sm:text-[16px] text-muted-foreground tabular-nums">
                  {costStats.total_output_tokens.toLocaleString()}
                </p>
              </div>
            </div>
            
            {/* Cost by Model */}
            {costStats.by_model.length > 0 && (
              <div className="border-t border-border pt-4">
                <p className="text-[11px] text-muted-foreground uppercase tracking-[0.1em] mb-3">
                  Cost by Model
                </p>
                <div className="space-y-2">
                  {costStats.by_model.slice(0, 5).map((model) => (
                    <div key={model.model} className="flex items-center justify-between">
                      <span className="text-[13px] text-foreground truncate mr-4">{model.model}</span>
                      <div className="flex items-center gap-4 flex-shrink-0">
                        <span className="text-[12px] text-muted-foreground tabular-nums">
                          {model.total_tokens.toLocaleString()} tokens
                        </span>
                        <span className="text-[13px] text-foreground tabular-nums font-medium">
                          ${model.total_cost < 0.01 ? model.total_cost.toFixed(4) : model.total_cost.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                {costStats.by_model.length > 5 && (
                  <p className="text-[11px] text-muted-foreground mt-2">
                    +{costStats.by_model.length - 5} more models
                  </p>
                )}
              </div>
            )}
            
            {costStats.run_count === 0 && (
              <p className="text-[13px] text-muted-foreground text-center py-4">
                No cost data available for this period. Costs are tracked for completed benchmark runs.
              </p>
            )}
          </div>
        </div>
      )}

      {/* API Keys Section */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 sm:mb-6">
          <p className="text-[11px] text-muted-foreground uppercase tracking-[0.1em]">
            API Keys
          </p>
          <div className="flex items-center gap-4">
            {refreshingModels && (
              <span className="text-[12px] text-muted">
                Refreshing models...
              </span>
            )}
            <p className="text-[12px] text-muted-foreground">
              {apiKeys.length} configured
            </p>
          </div>
        </div>
        
        <p className="text-[12px] sm:text-[13px] text-muted-foreground mb-4 sm:mb-6 max-w-2xl">
          Add your API keys to run benchmarks with different providers. 
          Keys are encrypted at rest and never exposed in logs or artifacts.
        </p>

        {/* Grid of configured API keys */}
        {(apiKeys.length > 0 || newProvider) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {apiKeys.map((key) => {
              const display = getProviderDisplay(key.provider);
              return (
                <ProviderCard
                  key={key.key_id}
                  providerId={key.provider}
                  displayName={display.name}
                  envVar={key.custom_env_var || display.envVar}
                  color={display.color}
                  existingKey={key}
                  onSave={handleSaveKey}
                  onDelete={handleDeleteKey}
                />
              );
            })}
            
            {/* New provider being added */}
            {newProvider && (
              <ProviderCard
                key={`new-${newProvider.id}`}
                providerId={newProvider.id}
                displayName={newProvider.displayName}
                envVar={newProvider.envVar}
                color={newProvider.color}
                onSave={async (provider, key) => {
                  await handleSaveKey(provider, key, newProvider.customEnvVar);
                }}
                onDelete={async () => {
                  handleCancelNewProvider();
                }}
                autoEdit={true}
              />
            )}
          </div>
        )}

        {/* Provider Selector or Add Another button */}
        {showProviderSelector ? (
          <ProviderSelector
            configuredProviders={apiKeys.map(k => k.provider)}
            onSelect={handleProviderSelect}
            onCancel={() => setShowProviderSelector(false)}
          />
        ) : (
          !newProvider && (
            <button
              onClick={() => setShowProviderSelector(true)}
              className="w-full sm:w-auto px-4 py-3 sm:py-2.5 text-[13px] text-muted border border-border-secondary hover:border-muted-foreground hover:text-foreground transition-colors flex items-center justify-center sm:justify-start gap-2 min-h-[48px] sm:min-h-[44px]"
            >
              <span className="text-[16px]">+</span>
              Add Another
            </button>
          )
        )}
      </div>
    </Layout>
  );
}
