/**
 * Common types for AI provider abstraction.
 * All providers implement the same interface so the orchestrator
 * can swap between OpenAI, Anthropic, or Google seamlessly.
 */

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AICompletionRequest {
  messages: AIMessage[];
  /** Max tokens to generate. Default varies by provider. */
  maxTokens?: number;
  /** Sampling temperature (0–2). Lower = more deterministic. */
  temperature?: number;
  /** Model override. If omitted, provider uses its default. */
  model?: string;
  /** Whether to request JSON output mode (if provider supports it). */
  jsonMode?: boolean;
}

export interface AICompletionResponse {
  content: string;
  model: string;
  provider: AIProviderName;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason: string;
}

export type AIProviderName = 'openai' | 'anthropic' | 'google';

export interface AIProvider {
  readonly name: AIProviderName;

  /** Returns true if the provider has a valid API key configured. */
  isConfigured(): boolean;

  /** Send a completion request and return the response. */
  complete(request: AICompletionRequest): Promise<AICompletionResponse>;
}
