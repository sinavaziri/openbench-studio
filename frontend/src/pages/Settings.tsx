import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiKeyPublic, ApiKeyProvider, ProviderInfo } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Layout from '../components/Layout';

// Provider display info with icons/colors
const PROVIDER_DISPLAY: Record<string, { name: string; color: string }> = {
  openai: { name: 'OpenAI', color: '#10a37f' },
  anthropic: { name: 'Anthropic', color: '#d97706' },
  google: { name: 'Google AI', color: '#4285f4' },
  mistral: { name: 'Mistral', color: '#ff7000' },
  cohere: { name: 'Cohere', color: '#7c3aed' },
  together: { name: 'Together AI', color: '#3b82f6' },
  groq: { name: 'Groq', color: '#f97316' },
  fireworks: { name: 'Fireworks', color: '#ef4444' },
  openrouter: { name: 'OpenRouter', color: '#6366f1' },
  custom: { name: 'Custom', color: '#6b7280' },
};

interface ProviderCardProps {
  provider: ProviderInfo;
  existingKey?: ApiKeyPublic;
  onSave: (provider: ApiKeyProvider, key: string) => Promise<void>;
  onDelete: (provider: ApiKeyProvider) => Promise<void>;
}

function ProviderCard({ provider, existingKey, onSave, onDelete }: ProviderCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [keyValue, setKeyValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const display = PROVIDER_DISPLAY[provider.provider] || { name: provider.display_name, color: '#6b7280' };

  const handleSave = async () => {
    if (!keyValue.trim()) {
      setError('API key is required');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      await onSave(provider.provider, keyValue);
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
      await onDelete(provider.provider);
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
            style={{ backgroundColor: display.color }}
          />
          <div>
            <h3 className="text-[15px] text-white">{display.name}</h3>
            <p className="text-[12px] text-[#555] font-mono">{provider.env_var}</p>
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
  
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKeyPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    loadData();
  }, [isAuthenticated, navigate]);

  const loadData = async () => {
    try {
      const [providersData, keysData] = await Promise.all([
        api.listProviders(),
        api.listApiKeys(),
      ]);
      setProviders(providersData);
      setApiKeys(keysData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveKey = async (provider: ApiKeyProvider, key: string) => {
    await api.createOrUpdateApiKey({ provider, key });
    await loadData();
  };

  const handleDeleteKey = async (provider: ApiKeyProvider) => {
    await api.deleteApiKey(provider);
    await loadData();
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const getKeyForProvider = (provider: ApiKeyProvider): ApiKeyPublic | undefined => {
    return apiKeys.find((k) => k.provider === provider);
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

      {/* API Keys Section */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <p className="text-[11px] text-[#666] uppercase tracking-[0.1em]">
            API Keys
          </p>
          <p className="text-[12px] text-[#555]">
            {apiKeys.length} of {providers.length} configured
          </p>
        </div>
        
        <p className="text-[13px] text-[#555] mb-6 max-w-2xl">
          Add your API keys to run benchmarks with different providers. 
          Keys are encrypted at rest and never exposed in logs or artifacts.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {providers.map((provider) => (
            <ProviderCard
              key={provider.provider}
              provider={provider}
              existingKey={getKeyForProvider(provider.provider)}
              onSave={handleSaveKey}
              onDelete={handleDeleteKey}
            />
          ))}
        </div>
      </div>
    </Layout>
  );
}



