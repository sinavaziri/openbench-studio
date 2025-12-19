import { useState } from 'react';
import { PREDEFINED_PROVIDERS, ProviderDefinition } from '../data/providers';

interface ProviderSelectorProps {
  configuredProviders: string[];
  onSelect: (provider: ProviderDefinition | { id: string; displayName: string; envVar: string; color: string; isCustom: true }) => void;
  onCancel: () => void;
}

export default function ProviderSelector({ configuredProviders, onSelect, onCancel }: ProviderSelectorProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customProviderName, setCustomProviderName] = useState('');
  const [customEnvVar, setCustomEnvVar] = useState('');

  // Filter out already configured providers
  const availableProviders = PREDEFINED_PROVIDERS.filter(
    p => !configuredProviders.includes(p.id)
  );

  // Filter by search term
  const filteredProviders = availableProviders.filter(p =>
    p.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCustomProviderSubmit = () => {
    if (!customProviderName.trim()) return;

    const providerId = customProviderName.toLowerCase().replace(/\s+/g, '-');
    const envVar = customEnvVar.trim() || `${customProviderName.toUpperCase().replace(/\s+/g, '_')}_API_KEY`;

    onSelect({
      id: providerId,
      displayName: customProviderName,
      envVar: envVar,
      color: '#6b7280',
      isCustom: true,
    });
  };

  if (showCustomForm) {
    return (
      <div className="bg-[#0a0a0a] border border-[#1a1a1a] p-5">
        <h3 className="text-[15px] text-white mb-4">Add Custom Provider</h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-[12px] text-[#888] mb-2">Provider Name</label>
            <input
              type="text"
              value={customProviderName}
              onChange={(e) => setCustomProviderName(e.target.value)}
              placeholder="e.g., My Custom Provider"
              className="w-full px-3 py-2 bg-[#111] border border-[#222] text-white text-[14px] focus:border-[#444] focus:outline-none transition-colors"
              autoFocus
            />
          </div>
          
          <div>
            <label className="block text-[12px] text-[#888] mb-2">
              Environment Variable (optional)
            </label>
            <input
              type="text"
              value={customEnvVar}
              onChange={(e) => setCustomEnvVar(e.target.value)}
              placeholder="e.g., MY_CUSTOM_PROVIDER_API_KEY"
              className="w-full px-3 py-2 bg-[#111] border border-[#222] text-white text-[14px] font-mono focus:border-[#444] focus:outline-none transition-colors"
            />
            <p className="text-[11px] text-[#555] mt-1">
              If not specified, will be auto-generated from provider name
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={handleCustomProviderSubmit}
              disabled={!customProviderName.trim()}
              className="px-4 py-2 text-[13px] text-black bg-white hover:bg-[#e0e0e0] disabled:opacity-50 transition-colors"
            >
              Continue
            </button>
            <button
              onClick={() => {
                setShowCustomForm(false);
                setCustomProviderName('');
                setCustomEnvVar('');
              }}
              className="px-4 py-2 text-[13px] text-[#888] hover:text-white transition-colors"
            >
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#0a0a0a] border border-[#1a1a1a] p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[15px] text-white">Select Provider</h3>
        <button
          onClick={onCancel}
          className="text-[13px] text-[#888] hover:text-white transition-colors"
        >
          Cancel
        </button>
      </div>
      
      <input
        type="text"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        placeholder="Search providers..."
        className="w-full px-3 py-2 mb-4 bg-[#111] border border-[#222] text-white text-[14px] focus:border-[#444] focus:outline-none transition-colors"
      />
      
      <div className="max-h-[300px] overflow-y-auto space-y-1">
        {filteredProviders.map((provider) => (
          <button
            key={provider.id}
            onClick={() => onSelect(provider)}
            className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[#111] transition-colors text-left"
          >
            <div 
              className="w-1.5 h-6 rounded-full flex-shrink-0"
              style={{ backgroundColor: provider.color }}
            />
            <div className="flex-1 min-w-0">
              <div className="text-[14px] text-white">{provider.displayName}</div>
              <div className="text-[11px] text-[#555] font-mono truncate">{provider.envVar}</div>
            </div>
          </button>
        ))}
        
        {filteredProviders.length === 0 && !searchTerm && (
          <p className="text-[13px] text-[#555] text-center py-4">
            All available providers are configured
          </p>
        )}
        
        {filteredProviders.length === 0 && searchTerm && (
          <p className="text-[13px] text-[#555] text-center py-4">
            No providers match "{searchTerm}"
          </p>
        )}
        
        <button
          onClick={() => setShowCustomForm(true)}
          className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[#111] transition-colors text-left border-t border-[#1a1a1a] mt-2 pt-3"
        >
          <div className="w-1.5 h-6 rounded-full flex-shrink-0 bg-[#6b7280]" />
          <div className="flex-1">
            <div className="text-[14px] text-white">Custom Provider</div>
            <div className="text-[11px] text-[#555]">Add a custom provider with your own env var</div>
          </div>
        </button>
      </div>
    </div>
  );
}

