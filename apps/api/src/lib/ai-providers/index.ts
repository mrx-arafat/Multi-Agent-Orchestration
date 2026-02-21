/**
 * AI Provider registry.
 * Manages provider instances and selects the best available provider
 * based on configuration and API key availability.
 */
import { OpenAIProvider } from './openai.js';
import { AnthropicProvider } from './anthropic.js';
import { GoogleProvider } from './google.js';
import type { AIProvider, AIProviderName, AICompletionRequest, AICompletionResponse } from './types.js';

export type { AIProvider, AIProviderName, AICompletionRequest, AICompletionResponse, AIMessage } from './types.js';

interface ProviderConfig {
  openaiApiKey?: string | undefined;
  anthropicApiKey?: string | undefined;
  googleApiKey?: string | undefined;
  defaultProvider?: AIProviderName | undefined;
}

let _providers: Map<AIProviderName, AIProvider> | null = null;
let _defaultProvider: AIProviderName | null = null;

/**
 * Initialise providers from configuration. Safe to call multiple times.
 */
export function initProviders(config: ProviderConfig): void {
  _providers = new Map();
  _defaultProvider = config.defaultProvider ?? null;

  const openai = new OpenAIProvider(config.openaiApiKey);
  const anthropic = new AnthropicProvider(config.anthropicApiKey);
  const google = new GoogleProvider(config.googleApiKey);

  if (openai.isConfigured()) _providers.set('openai', openai);
  if (anthropic.isConfigured()) _providers.set('anthropic', anthropic);
  if (google.isConfigured()) _providers.set('google', google);

  // Auto-select default if not specified
  if (!_defaultProvider || !_providers.has(_defaultProvider)) {
    if (_providers.size > 0) {
      _defaultProvider = _providers.keys().next().value ?? null;
    }
  }
}

/**
 * Get a specific provider by name.
 */
export function getProvider(name: AIProviderName): AIProvider | undefined {
  return _providers?.get(name);
}

/**
 * Get the default (preferred) provider.
 */
export function getDefaultProvider(): AIProvider | null {
  if (!_providers || !_defaultProvider) return null;
  return _providers.get(_defaultProvider) ?? null;
}

/**
 * Returns the names of all configured (key available) providers.
 */
export function getConfiguredProviders(): AIProviderName[] {
  if (!_providers) return [];
  return Array.from(_providers.keys());
}

/**
 * Check whether at least one AI provider is configured.
 */
export function hasAnyProvider(): boolean {
  return !!_providers && _providers.size > 0;
}

/**
 * Run a completion using the default provider (or a specific one).
 * Throws if no provider is available.
 */
export async function aiComplete(
  request: AICompletionRequest,
  providerName?: AIProviderName,
): Promise<AICompletionResponse> {
  const provider = providerName
    ? getProvider(providerName)
    : getDefaultProvider();

  if (!provider) {
    const available = getConfiguredProviders();
    throw new Error(
      available.length === 0
        ? 'No AI provider configured. Set MAOF_OPENAI_API_KEY, MAOF_ANTHROPIC_API_KEY, or MAOF_GOOGLE_AI_API_KEY.'
        : `Provider '${providerName}' not configured. Available: ${available.join(', ')}`,
    );
  }

  return provider.complete(request);
}

/** Reset for testing. */
export function _resetProviders(): void {
  _providers = null;
  _defaultProvider = null;
}
