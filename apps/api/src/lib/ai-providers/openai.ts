/**
 * OpenAI provider — wraps the OpenAI SDK for GPT-4o / GPT-4o-mini.
 */
import OpenAI from 'openai';
import type { AIProvider, AICompletionRequest, AICompletionResponse } from './types.js';

const DEFAULT_MODEL = 'gpt-4o-mini';

export class OpenAIProvider implements AIProvider {
  readonly name = 'openai' as const;
  private client: OpenAI | null = null;
  private readonly apiKey: string | undefined;

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  private getClient(): OpenAI {
    if (!this.client) {
      if (!this.apiKey) throw new Error('OpenAI API key not configured');
      this.client = new OpenAI({ apiKey: this.apiKey });
    }
    return this.client;
  }

  async complete(request: AICompletionRequest): Promise<AICompletionResponse> {
    const client = this.getClient();
    const model = request.model ?? DEFAULT_MODEL;

    const messages = request.messages.map((m) => ({
      role: m.role as 'system' | 'user' | 'assistant',
      content: m.content,
    }));

    const response = await client.chat.completions.create({
      model,
      messages,
      max_tokens: request.maxTokens ?? 4096,
      temperature: request.temperature ?? 0.7,
      ...(request.jsonMode ? { response_format: { type: 'json_object' as const } } : {}),
    });

    const choice = response.choices[0];
    if (!choice) throw new Error('OpenAI returned no choices');

    return {
      content: choice.message.content ?? '',
      model: response.model,
      provider: 'openai',
      usage: {
        promptTokens: response.usage?.prompt_tokens ?? 0,
        completionTokens: response.usage?.completion_tokens ?? 0,
        totalTokens: response.usage?.total_tokens ?? 0,
      },
      finishReason: choice.finish_reason ?? 'unknown',
    };
  }
}
