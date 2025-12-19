/**
 * Provider definitions for all supported model providers from openbench.dev
 * 
 * This list includes 30+ pre-defined providers with their display names,
 * environment variable names, and UI colors.
 */

export interface ProviderDefinition {
  id: string;
  displayName: string;
  envVar: string;
  color: string;
}

export const PREDEFINED_PROVIDERS: ProviderDefinition[] = [
  { id: 'ai21', displayName: 'AI21 Labs', envVar: 'AI21_API_KEY', color: '#6b7280' },
  { id: 'anthropic', displayName: 'Anthropic', envVar: 'ANTHROPIC_API_KEY', color: '#d97706' },
  { id: 'bedrock', displayName: 'AWS Bedrock', envVar: 'AWS_ACCESS_KEY_ID', color: '#ff9900' },
  { id: 'azure', displayName: 'Azure OpenAI', envVar: 'AZURE_OPENAI_API_KEY', color: '#0078d4' },
  { id: 'baseten', displayName: 'Baseten', envVar: 'BASETEN_API_KEY', color: '#6b7280' },
  { id: 'cerebras', displayName: 'Cerebras', envVar: 'CEREBRAS_API_KEY', color: '#6366f1' },
  { id: 'cohere', displayName: 'Cohere', envVar: 'COHERE_API_KEY', color: '#7c3aed' },
  { id: 'crusoe', displayName: 'Crusoe', envVar: 'CRUSOE_API_KEY', color: '#6b7280' },
  { id: 'deepinfra', displayName: 'DeepInfra', envVar: 'DEEPINFRA_API_KEY', color: '#6b7280' },
  { id: 'friendli', displayName: 'Friendli', envVar: 'FRIENDLI_TOKEN', color: '#6b7280' },
  { id: 'google', displayName: 'Google AI', envVar: 'GOOGLE_API_KEY', color: '#4285f4' },
  { id: 'groq', displayName: 'Groq', envVar: 'GROQ_API_KEY', color: '#f97316' },
  { id: 'huggingface', displayName: 'Hugging Face', envVar: 'HF_TOKEN', color: '#fbbf24' },
  { id: 'hyperbolic', displayName: 'Hyperbolic', envVar: 'HYPERBOLIC_API_KEY', color: '#6b7280' },
  { id: 'lambda', displayName: 'Lambda', envVar: 'LAMBDA_API_KEY', color: '#6b7280' },
  { id: 'minimax', displayName: 'MiniMax', envVar: 'MINIMAX_API_KEY', color: '#6b7280' },
  { id: 'mistral', displayName: 'Mistral', envVar: 'MISTRAL_API_KEY', color: '#ff7000' },
  { id: 'moonshot', displayName: 'Moonshot', envVar: 'MOONSHOT_API_KEY', color: '#6b7280' },
  { id: 'nebius', displayName: 'Nebius', envVar: 'NEBIUS_API_KEY', color: '#6b7280' },
  { id: 'nous', displayName: 'Nous Research', envVar: 'NOUS_API_KEY', color: '#6b7280' },
  { id: 'novita', displayName: 'Novita AI', envVar: 'NOVITA_API_KEY', color: '#6b7280' },
  { id: 'ollama', displayName: 'Ollama', envVar: 'OLLAMA_HOST', color: '#6b7280' },
  { id: 'openai', displayName: 'OpenAI', envVar: 'OPENAI_API_KEY', color: '#10a37f' },
  { id: 'openrouter', displayName: 'OpenRouter', envVar: 'OPENROUTER_API_KEY', color: '#6366f1' },
  { id: 'parasail', displayName: 'Parasail', envVar: 'PARASAIL_API_KEY', color: '#6b7280' },
  { id: 'perplexity', displayName: 'Perplexity', envVar: 'PERPLEXITY_API_KEY', color: '#6b7280' },
  { id: 'reka', displayName: 'Reka', envVar: 'REKA_API_KEY', color: '#6b7280' },
  { id: 'sambanova', displayName: 'SambaNova', envVar: 'SAMBANOVA_API_KEY', color: '#6b7280' },
  { id: 'siliconflow', displayName: 'SiliconFlow', envVar: 'SILICONFLOW_API_KEY', color: '#6b7280' },
  { id: 'together', displayName: 'Together AI', envVar: 'TOGETHER_API_KEY', color: '#3b82f6' },
  { id: 'vercel', displayName: 'Vercel AI Gateway', envVar: 'AI_GATEWAY_API_KEY', color: '#000000' },
  { id: 'wandb', displayName: 'W&B Inference', envVar: 'WANDB_API_KEY', color: '#fbbf24' },
  { id: 'vllm', displayName: 'vLLM', envVar: 'VLLM_API_KEY', color: '#6b7280' },
  { id: 'fireworks', displayName: 'Fireworks', envVar: 'FIREWORKS_API_KEY', color: '#ef4444' },
];

/**
 * Get provider definition by ID
 */
export function getProviderById(id: string): ProviderDefinition | undefined {
  return PREDEFINED_PROVIDERS.find(p => p.id === id);
}

/**
 * Get display info for a provider (with fallback for custom providers)
 */
export function getProviderDisplay(providerId: string): { name: string; color: string; envVar: string } {
  const predefined = getProviderById(providerId);
  if (predefined) {
    return {
      name: predefined.displayName,
      color: predefined.color,
      envVar: predefined.envVar,
    };
  }
  
  // Fallback for custom providers
  return {
    name: providerId.charAt(0).toUpperCase() + providerId.slice(1),
    color: '#6b7280',
    envVar: `${providerId.toUpperCase().replace(/-/g, '_')}_API_KEY`,
  };
}

