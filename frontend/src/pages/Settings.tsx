import { useEffect, useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api, ApiKeyPublic, ApiKeyProvider, SettingsExport, ImportPreview } from '../api/client';
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
    <div className="bg-background-secondary border border-border p-5 hover:border-border-secondary transition-colors">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div 
            className="w-2 h-8 rounded-full"
            style={{ backgroundColor: color }}
          />
          <div>
            <h3 className="text-[15px] text-foreground">{displayName}</h3>
            <p className="text-[12px] text-muted-foreground font-mono">{envVar}</p>
          </div>
        </div>
        
        {existingKey && !isEditing && (
          <span className="px-2 py-1 text-[11px] text-success bg-success-bg border border-success-border">
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
            className="w-full px-3 py-2 bg-background-tertiary border border-border-secondary text-foreground text-[14px] font-mono focus:border-muted-foreground focus:outline-none transition-colors"
            autoFocus
          />
          
          {error && (
            <p className="text-[12px] text-error">{error}</p>
          )}
          
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={loading}
              className="px-4 py-2 text-[13px] text-accent-foreground bg-accent hover:opacity-90 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={() => {
                setIsEditing(false);
                setKeyValue('');
                setError(null);
              }}
              className="px-4 py-2 text-[13px] text-muted hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          {existingKey ? (
            <>
              <span className="text-[14px] text-muted-foreground font-mono">
                {existingKey.key_preview}
              </span>
              <button
                onClick={() => setIsEditing(true)}
                className="ml-auto px-3 py-1.5 text-[12px] text-muted border border-border-secondary hover:border-muted-foreground hover:text-foreground transition-colors"
              >
                Update
              </button>
              <button
                onClick={handleDelete}
                disabled={loading}
                className="px-3 py-1.5 text-[12px] text-error border border-error-border hover:border-error transition-colors disabled:opacity-50"
              >
                {loading ? '...' : 'Delete'}
              </button>
            </>
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              className="px-4 py-2 text-[13px] text-muted border border-border-secondary hover:border-muted-foreground hover:text-foreground transition-colors"
            >
              Add Key
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Password Dialog Component
// =============================================================================

interface PasswordDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmText: string;
  onConfirm: (password: string) => void;
  onCancel: () => void;
  loading?: boolean;
  optional?: boolean;
}

function PasswordDialog({ isOpen, title, description, confirmText, onConfirm, onCancel, loading, optional }: PasswordDialogProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (!optional && !password) {
      setError('Password is required');
      return;
    }
    if (password && password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setError(null);
    onConfirm(password);
  };

  const handleSkip = () => {
    setError(null);
    onConfirm('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative bg-background-secondary border border-border p-6 w-full max-w-md mx-4">
        <h3 className="text-[16px] text-foreground mb-2">{title}</h3>
        <p className="text-[13px] text-muted-foreground mb-4">{description}</p>
        
        <div className="space-y-3 mb-4">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter password..."
            className="w-full px-3 py-2 bg-background-tertiary border border-border-secondary text-foreground text-[14px] focus:border-muted-foreground focus:outline-none"
            autoFocus
          />
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm password..."
            className="w-full px-3 py-2 bg-background-tertiary border border-border-secondary text-foreground text-[14px] focus:border-muted-foreground focus:outline-none"
          />
        </div>
        
        {error && <p className="text-[12px] text-error mb-4">{error}</p>}
        
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-[13px] text-muted hover:text-foreground transition-colors"
            disabled={loading}
          >
            Cancel
          </button>
          {optional && (
            <button
              onClick={handleSkip}
              className="px-4 py-2 text-[13px] text-muted border border-border-secondary hover:border-muted-foreground transition-colors"
              disabled={loading}
            >
              Skip Encryption
            </button>
          )}
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="px-4 py-2 text-[13px] text-accent-foreground bg-accent hover:opacity-90 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Processing...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Import Preview Dialog Component
// =============================================================================

interface ImportPreviewDialogProps {
  isOpen: boolean;
  preview: ImportPreview | null;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

function ImportPreviewDialog({ isOpen, preview, onConfirm, onCancel, loading }: ImportPreviewDialogProps) {
  if (!isOpen || !preview) return null;

  const hasErrors = preview.errors.length > 0;
  const totalKeys = preview.api_keys.length;
  const willOverwrite = preview.will_overwrite.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative bg-background-secondary border border-border p-6 w-full max-w-lg mx-4 max-h-[80vh] overflow-auto">
        <h3 className="text-[16px] text-foreground mb-2">Import Preview</h3>
        
        {hasErrors ? (
          <div className="mb-4">
            <p className="text-[13px] text-error mb-2">Cannot import due to errors:</p>
            <ul className="list-disc list-inside text-[12px] text-error">
              {preview.errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        ) : (
          <>
            <p className="text-[13px] text-muted-foreground mb-4">
              Found {totalKeys} API key{totalKeys !== 1 ? 's' : ''} to import.
              {willOverwrite > 0 && (
                <span className="text-warning"> {willOverwrite} existing key{willOverwrite !== 1 ? 's' : ''} will be overwritten.</span>
              )}
            </p>

            {/* Preview table */}
            <div className="border border-border mb-4">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-border bg-background-tertiary">
                    <th className="text-left px-3 py-2 text-muted-foreground font-medium">Provider</th>
                    <th className="text-left px-3 py-2 text-muted-foreground font-medium">Key Preview</th>
                    <th className="text-left px-3 py-2 text-muted-foreground font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.api_keys.map((key, i) => (
                    <tr key={i} className="border-b border-border last:border-b-0">
                      <td className="px-3 py-2 text-foreground">{key.display_name}</td>
                      <td className="px-3 py-2 text-muted-foreground font-mono">{key.key_preview}</td>
                      <td className="px-3 py-2">
                        {preview.will_overwrite.includes(key.provider) ? (
                          <span className="text-warning text-[11px]">Overwrite</span>
                        ) : (
                          <span className="text-success text-[11px]">New</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {willOverwrite > 0 && (
              <div className="bg-warning-bg border border-warning-border p-3 mb-4">
                <p className="text-[12px] text-warning">
                  ⚠️ Warning: This will overwrite {willOverwrite} existing API key{willOverwrite !== 1 ? 's' : ''}. 
                  This action cannot be undone.
                </p>
              </div>
            )}
          </>
        )}
        
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-[13px] text-muted hover:text-foreground transition-colors"
            disabled={loading}
          >
            Cancel
          </button>
          {!hasErrors && (
            <button
              onClick={onConfirm}
              disabled={loading || totalKeys === 0}
              className="px-4 py-2 text-[13px] text-accent-foreground bg-accent hover:opacity-90 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Importing...' : `Import ${totalKeys} Key${totalKeys !== 1 ? 's' : ''}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Import Password Dialog Component
// =============================================================================

interface ImportPasswordDialogProps {
  isOpen: boolean;
  onConfirm: (password: string) => void;
  onCancel: () => void;
  loading?: boolean;
  error?: string | null;
}

function ImportPasswordDialog({ isOpen, onConfirm, onCancel, loading, error }: ImportPasswordDialogProps) {
  const [password, setPassword] = useState('');

  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm(password);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative bg-background-secondary border border-border p-6 w-full max-w-md mx-4">
        <h3 className="text-[16px] text-foreground mb-2">Enter Password</h3>
        <p className="text-[13px] text-muted-foreground mb-4">
          This backup file is password-protected. Enter the password used when exporting.
        </p>
        
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter password..."
          className="w-full px-3 py-2 bg-background-tertiary border border-border-secondary text-foreground text-[14px] focus:border-muted-foreground focus:outline-none mb-4"
          autoFocus
          onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
        />
        
        {error && <p className="text-[12px] text-error mb-4">{error}</p>}
        
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-[13px] text-muted hover:text-foreground transition-colors"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading || !password}
            className="px-4 py-2 text-[13px] text-accent-foreground bg-accent hover:opacity-90 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Decrypting...' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Settings Component
// =============================================================================

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
  
  // Import/Export state
  const [showExportPasswordDialog, setShowExportPasswordDialog] = useState(false);
  const [showImportPasswordDialog, setShowImportPasswordDialog] = useState(false);
  const [showImportPreview, setShowImportPreview] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [pendingImportData, setPendingImportData] = useState<SettingsExport | null>(null);
  const [importPassword, setImportPassword] = useState<string | null>(null);
  const [importPasswordError, setImportPasswordError] = useState<string | null>(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // ===========================================================================
  // Settings Import/Export Handlers
  // ===========================================================================

  const handleExportClick = () => {
    setShowExportPasswordDialog(true);
  };

  const handleExportConfirm = async (password: string) => {
    setExportLoading(true);
    try {
      const response = await api.exportSettings(password || undefined);
      const data = response.data;
      
      // Create and download the JSON file
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const timestamp = new Date().toISOString().slice(0, 10);
      a.download = `openbench-settings-${timestamp}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      setShowExportPasswordDialog(false);
      toast.success(
        password ? 'Settings exported with encryption' : 'Settings exported',
        { icon: '📦' }
      );
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to export settings';
      toast.error(errorMsg);
    } finally {
      setExportLoading(false);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    try {
      const text = await file.text();
      const data = JSON.parse(text) as SettingsExport;
      
      // Validate basic structure
      if (!data.schema_version || !Array.isArray(data.api_keys)) {
        toast.error('Invalid settings file format');
        return;
      }
      
      setPendingImportData(data);
      
      // Check if encrypted
      if (data.encrypted) {
        setImportPasswordError(null);
        setShowImportPasswordDialog(true);
      } else {
        // Preview directly without password
        await previewImport(data, '');
      }
    } catch (err) {
      toast.error('Failed to read settings file');
    } finally {
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const previewImport = async (data: SettingsExport, password: string) => {
    setImportLoading(true);
    try {
      const preview = await api.previewImport(data, password || undefined);
      
      // Check for password errors
      if (preview.errors.some(e => e.includes('password') || e.includes('Password'))) {
        setImportPasswordError('Invalid password. Please try again.');
        return;
      }
      
      setImportPassword(password);
      setImportPreview(preview);
      setShowImportPasswordDialog(false);
      setShowImportPreview(true);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to preview import';
      if (errorMsg.includes('password')) {
        setImportPasswordError('Invalid password. Please try again.');
      } else {
        toast.error(errorMsg);
        setShowImportPasswordDialog(false);
      }
    } finally {
      setImportLoading(false);
    }
  };

  const handleImportPasswordConfirm = async (password: string) => {
    if (!pendingImportData) return;
    await previewImport(pendingImportData, password);
  };

  const handleImportConfirm = async () => {
    if (!pendingImportData) return;
    
    setImportLoading(true);
    try {
      const result = await api.importSettings(pendingImportData, importPassword || undefined);
      
      setShowImportPreview(false);
      setPendingImportData(null);
      setImportPreview(null);
      setImportPassword(null);
      
      if (result.imported_count > 0) {
        toast.success(`Imported ${result.imported_count} API key${result.imported_count !== 1 ? 's' : ''}`, { icon: '✅' });
        // Reload API keys
        await loadData();
        // Refresh available models
        await refreshModels();
        window.dispatchEvent(new CustomEvent('modelsUpdated'));
      } else {
        toast.error('No keys were imported');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to import settings';
      toast.error(errorMsg);
    } finally {
      setImportLoading(false);
    }
  };

  const handleImportCancel = () => {
    setShowImportPasswordDialog(false);
    setShowImportPreview(false);
    setPendingImportData(null);
    setImportPreview(null);
    setImportPassword(null);
    setImportPasswordError(null);
  };

  const handleLogout = () => {
    logout();
    toast.success('Signed out successfully');
    navigate('/');
  };

  if (loading) {
    return (
      <Layout>
        <div className="space-y-8">
          <div className="h-8 w-48 bg-border rounded animate-pulse" />
          <div className="grid grid-cols-2 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-32 bg-border rounded animate-pulse" />
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
          className="text-[13px] text-muted-foreground hover:text-foreground transition-colors mb-4 inline-block"
        >
          ← Back
        </Link>
        <h1 className="text-[28px] text-foreground tracking-tight mb-2">
          Settings
        </h1>
        <p className="text-[15px] text-muted-foreground">
          Manage your account and API keys
        </p>
      </div>

      {error && (
        <div className="mb-8">
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
      <div className="mb-12">
        <p className="text-[11px] text-muted-foreground uppercase tracking-[0.1em] mb-6">
          Account
        </p>
        <div className="bg-background-secondary border border-border p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[15px] text-foreground mb-1">{user?.email}</p>
              <p className="text-[12px] text-muted-foreground">
                Member since {user?.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="px-4 py-2 text-[13px] text-muted border border-border-secondary hover:border-muted-foreground hover:text-foreground transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>

      {/* Settings Backup Section */}
      <div className="mb-12">
        <p className="text-[11px] text-muted-foreground uppercase tracking-[0.1em] mb-6">
          Settings Backup
        </p>
        <div className="bg-background-secondary border border-border p-6">
          <p className="text-[13px] text-muted-foreground mb-4">
            Export your settings to back them up or transfer to another device. 
            You can optionally encrypt the backup with a password for extra security.
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={handleExportClick}
              disabled={exportLoading || apiKeys.length === 0}
              className="px-4 py-2 text-[13px] text-foreground border border-border-secondary hover:border-muted-foreground transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              <span>📦</span>
              {exportLoading ? 'Exporting...' : 'Export Settings'}
            </button>
            <button
              onClick={handleImportClick}
              disabled={importLoading}
              className="px-4 py-2 text-[13px] text-foreground border border-border-secondary hover:border-muted-foreground transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              <span>📥</span>
              {importLoading ? 'Importing...' : 'Import Settings'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
          {apiKeys.length === 0 && (
            <p className="text-[12px] text-muted mt-3">
              Add some API keys first before exporting.
            </p>
          )}
        </div>
      </div>

      {/* Export Password Dialog */}
      <PasswordDialog
        isOpen={showExportPasswordDialog}
        title="Encrypt Export"
        description="Enter a password to encrypt your API keys in the export file. You'll need this password when importing."
        confirmText="Export"
        onConfirm={handleExportConfirm}
        onCancel={() => setShowExportPasswordDialog(false)}
        loading={exportLoading}
        optional={true}
      />

      {/* Import Password Dialog */}
      <ImportPasswordDialog
        isOpen={showImportPasswordDialog}
        onConfirm={handleImportPasswordConfirm}
        onCancel={handleImportCancel}
        loading={importLoading}
        error={importPasswordError}
      />

      {/* Import Preview Dialog */}
      <ImportPreviewDialog
        isOpen={showImportPreview}
        preview={importPreview}
        onConfirm={handleImportConfirm}
        onCancel={handleImportCancel}
        loading={importLoading}
      />

      {/* Version Information */}
      {versionInfo && (
        <div className="mb-12">
          <p className="text-[11px] text-muted-foreground uppercase tracking-[0.1em] mb-6">
            Version Information
          </p>
          <div className="bg-background-secondary border border-border p-6">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-[12px] text-muted-foreground mb-1">Web UI</p>
                <p className="text-[14px] text-foreground font-mono">{versionInfo.web_ui}</p>
              </div>
              <div>
                <p className="text-[12px] text-muted-foreground mb-1">OpenBench CLI</p>
                {versionInfo.openbench_available ? (
                  <p className="text-[14px] text-foreground font-mono">{versionInfo.openbench}</p>
                ) : (
                  <p className="text-[14px] text-muted">Not installed</p>
                )}
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-border">
              <a
                href="https://github.com/groq/openbench"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[12px] text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
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
          <p className="text-[11px] text-muted-foreground uppercase tracking-[0.1em]">
            API Keys
          </p>
          <div className="flex items-center gap-4">
            {refreshingModels && (
              <span className="text-[12px] text-muted">
                Refreshing available models...
              </span>
            )}
            <p className="text-[12px] text-muted-foreground">
              {apiKeys.length} configured
            </p>
          </div>
        </div>
        
        <p className="text-[13px] text-muted-foreground mb-6 max-w-2xl">
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
              className="w-full md:w-auto px-4 py-2.5 text-[13px] text-muted border border-border-secondary hover:border-muted-foreground hover:text-foreground transition-colors flex items-center gap-2"
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
