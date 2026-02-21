/**
 * Google Gemini provider — uses the REST API directly (no SDK dependency).
 * Calls the generativelanguage.googleapis.com v1beta endpoint.
 */
import type { AIProvider, AICompletionRequest, AICompletionResponse } from './types.js';

const DEFAULT_MODEL = 'gemini-2.0-flash';
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

interface GeminiContent {
  role: 'user' | 'model';
  parts: { text: string }[];
}

interface GeminiResponse {
  candidates?: {
    content: { parts: { text: string }[] };
    finishReason: string;
  }[];
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
  modelVersion?: string;
}

export class GoogleProvider implements AIProvider {
  readonly name = 'google' as const;
  private readonly apiKey: string | undefined;

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  async complete(request: AICompletionRequest): Promise<AICompletionResponse> {
    if (!this.apiKey) throw new Error('Google AI API key not configured');

    const model = request.model ?? DEFAULT_MODEL;
    const url = `${BASE_URL}/${model}:generateContent?key=${this.apiKey}`;

    // Build contents array — Gemini uses "user" and "model" roles
    const systemMsg = request.messages.find((m) => m.role === 'system');
    const contents: GeminiContent[] = request.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' as const : 'user' as const,
        parts: [{ text: m.content }],
      }));

    const body = {
      contents,
      ...(systemMsg ? { systemInstruction: { parts: [{ text: systemMsg.content }] } } : {}),
      generationConfig: {
        maxOutputTokens: request.maxTokens ?? 4096,
        temperature: request.temperature ?? 0.7,
        ...(request.jsonMode ? { responseMimeType: 'application/json' } : {}),
      },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Google AI API error (${response.status}): ${errText}`);
    }

    const data = await response.json() as GeminiResponse;
    const candidate = data.candidates?.[0];
    if (!candidate) throw new Error('Google AI returned no candidates');

    const text = candidate.content.parts.map((p) => p.text).join('');

    return {
      content: text,
      model: data.modelVersion ?? model,
      provider: 'google',
      usage: {
        promptTokens: data.usageMetadata?.promptTokenCount ?? 0,
        completionTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
        totalTokens: data.usageMetadata?.totalTokenCount ?? 0,
      },
      finishReason: candidate.finishReason ?? 'unknown',
    };
  }
}
