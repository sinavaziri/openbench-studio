import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiKeyPublic, ApiKeyProvider } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Layout from '../components/Layout';
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
      setError(err instanceof Error ? err.message : 'Failed to save API key');
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
      setError(err instanceof Error ? err.message : 'Failed to delete API key');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[#0a0a0a] border border-[#1a1a1a] p-5 hover:border-[#2a2a2a] transition-colors">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div 
            className="w-2 h-8 rounded-full"
            style={{ backgroundColor: color }}
          />
          <div>
            <h3 className="text-[15px] text-white">{displayName}</h3>
            <p className="text-[12px] text-[#555] font-mono">{envVar}</p>
          </div>
        </div>
        
        {existingKey && !isEditing && (
          <span className="px-2 py-1 text-[11px] text-[#4a4] bg-[#0a1a0a] border border-[#1a3a1a]">
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
            className="w-full px-3 py-2 bg-[#111] border border-[#222] text-white text-[14px] font-mono focus:border-[#444] focus:outline-none transition-colors"
            autoFocus
          />
          
          {error && (
            <p className="text-[12px] text-[#c44]">{error}</p>
          )}
          
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={loading}
              className="px-4 py-2 text-[13px] text-black bg-white hover:bg-[#e0e0e0] disabled:opacity-50 transition-colors"
            >
              {loading ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={() => {
                setIsEditing(false);
                setKeyValue('');
                setError(null);
              }}
              className="px-4 py-2 text-[13px] text-[#888] hover:text-white transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          {existingKey ? (
            <>
              <span className="text-[14px] text-[#666] font-mono">
                {existingKey.key_preview}
              </span>
              <button
                onClick={() => setIsEditing(true)}
                className="ml-auto px-3 py-1.5 text-[12px] text-[#888] border border-[#333] hover:border-[#555] hover:text-white transition-colors"
              >
                Update
              </button>
              <button
                onClick={handleDelete}
                disabled={loading}
                className="px-3 py-1.5 text-[12px] text-[#c44] border border-[#3a1a1a] hover:border-[#c44] transition-colors disabled:opacity-50"
              >
                {loading ? '...' : 'Delete'}
              </button>
            </>
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              className="px-4 py-2 text-[13px] text-[#888] border border-[#333] hover:border-[#555] hover:text-white transition-colors"
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
  const [error, setError] = useState<string | null>(null);
  const [refreshingModels, setRefreshingModels] = useState(false);
  const [showProviderSelector, setShowProviderSelector] = useState(false);
  const [newProvider, setNewProvider] = useState<{ id: string; displayName: string; envVar: string; color: string; customEnvVar?: string } | null>(null);
  const [versionInfo, setVersionInfo] = useState<{ web_ui: string; openbench: string | null; openbench_available: boolean } | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    loadData();
  }, [isAuthenticated, navigate]);

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
      setError(err instanceof Error ? err.message : 'Failed to load settings');
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
    
    await loadData();
    // Refresh available models after key change
    await refreshModels();
    // Notify other components that models have been updated
    window.dispatchEvent(new CustomEvent('modelsUpdated'));
  };

  const handleDeleteKey = async (provider: ApiKeyProvider) => {
    await api.deleteApiKey(provider);
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
    } catch (err) {
      console.error('Failed to refresh models:', err);
    } finally {
      setRefreshingModels(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  if (loading) {
    return (
      <Layout>
        <div className="space-y-8">
          <div className="h-8 w-48 bg-[#1a1a1a] rounded animate-pulse" />
          <div className="grid grid-cols-2 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-32 bg-[#1a1a1a] rounded animate-pulse" />
            ))}
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {/* Header */}
      <div className="mb-12">
        <Link
          to="/"
          className="text-[13px] text-[#666] hover:text-white transition-colors mb-4 inline-block"
        >
          ← Back
        </Link>
        <h1 className="text-[28px] text-white tracking-tight mb-2">
          Settings
        </h1>
        <p className="text-[15px] text-[#666]">
          Manage your account and API keys
        </p>
      </div>

      {error && (
        <div className="mb-8 py-3 px-4 bg-[#1a0a0a] border border-[#3a1a1a] text-[14px] text-[#c44]">
          {error}
        </div>
      )}

      {/* Account Section */}
      <div className="mb-12">
        <p className="text-[11px] text-[#666] uppercase tracking-[0.1em] mb-6">
          Account
        </p>
        <div className="bg-[#0a0a0a] border border-[#1a1a1a] p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[15px] text-white mb-1">{user?.email}</p>
              <p className="text-[12px] text-[#555]">
                Member since {user?.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="px-4 py-2 text-[13px] text-[#888] border border-[#333] hover:border-[#555] hover:text-white transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>

      {/* Version Information */}
      {versionInfo && (
        <div className="mb-12">
          <p className="text-[11px] text-[#666] uppercase tracking-[0.1em] mb-6">
            Version Information
          </p>
          <div className="bg-[#0a0a0a] border border-[#1a1a1a] p-6">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-[12px] text-[#555] mb-1">Web UI</p>
                <p className="text-[14px] text-white font-mono">{versionInfo.web_ui}</p>
              </div>
              <div>
                <p className="text-[12px] text-[#555] mb-1">OpenBench CLI</p>
                {versionInfo.openbench_available ? (
                  <p className="text-[14px] text-white font-mono">{versionInfo.openbench}</p>
                ) : (
                  <p className="text-[14px] text-[#888]">Not installed</p>
                )}
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-[#1a1a1a]">
              <a
                href="https://github.com/groq/openbench"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[12px] text-[#666] hover:text-white transition-colors inline-flex items-center gap-1"
              >
                View OpenBench on GitHub →
              </a>
            </div>
          </div>
        </div>
      )}

      {/* API Keys Section */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <p className="text-[11px] text-[#666] uppercase tracking-[0.1em]">
            API Keys
          </p>
          <div className="flex items-center gap-4">
            {refreshingModels && (
              <span className="text-[12px] text-[#888]">
                Refreshing available models...
              </span>
            )}
            <p className="text-[12px] text-[#555]">
              {apiKeys.length} configured
            </p>
          </div>
        </div>
        
        <p className="text-[13px] text-[#555] mb-6 max-w-2xl">
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
              className="w-full md:w-auto px-4 py-2.5 text-[13px] text-[#888] border border-[#333] hover:border-[#555] hover:text-white transition-colors flex items-center gap-2"
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



