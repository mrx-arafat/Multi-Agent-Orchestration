/**
 * Built-in agent executor.
 *
 * Combines AI providers with capability prompts to execute workflow stages
 * using real AI APIs — no external agent HTTP server needed.
 */
import { aiComplete, hasAnyProvider, type AIProviderName } from '../../lib/ai-providers/index.js';
import { getCapabilityPrompt } from './capability-prompts.js';

export interface BuiltinExecutionResult {
  output: Record<string, unknown>;
  agentId: string;
  provider: string;
  model: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
}

/**
 * Execute a workflow stage using a built-in AI provider.
 */
export async function executeWithBuiltinAgent(
  capability: string,
  stageId: string,
  input: Record<string, unknown>,
  providerOverride?: AIProviderName,
): Promise<BuiltinExecutionResult> {
  if (!hasAnyProvider()) {
    throw new Error(
      'No AI provider configured. Set MAOF_OPENAI_API_KEY, MAOF_ANTHROPIC_API_KEY, or MAOF_GOOGLE_AI_API_KEY in your .env file.',
    );
  }

  const prompt = getCapabilityPrompt(capability);

  // Build the user message from the stage input
  const inputText = formatInput(input);
  const userMessage = `${prompt.outputInstructions}\n\n---\n\n**Input:**\n${inputText}`;

  const response = await aiComplete(
    {
      messages: [
        { role: 'system', content: prompt.systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: prompt.temperature,
      jsonMode: true,
    },
    providerOverride,
  );

  // Parse the AI's JSON response into structured output
  const output = parseAIOutput(response.content, capability, stageId);

  return {
    output,
    agentId: `builtin-${capability}`,
    provider: response.provider,
    model: response.model,
    usage: response.usage,
  };
}

/**
 * Format stage input as readable text for the AI.
 */
function formatInput(input: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null || value === '') continue;
    if (typeof value === 'string') {
      parts.push(`**${key}:** ${value}`);
    } else {
      parts.push(`**${key}:** ${JSON.stringify(value, null, 2)}`);
    }
  }
  return parts.length > 0 ? parts.join('\n\n') : '(no input provided)';
}

/**
 * Parse AI response content into a structured output object.
 * Tries JSON parse first, falls back to wrapping as text.
 */
function parseAIOutput(
  content: string,
  capability: string,
  stageId: string,
): Record<string, unknown> {
  // Try direct JSON parse
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    return {
      ...parsed,
      _meta: { capability, stageId, generatedAt: new Date().toISOString() },
    };
  } catch {
    // Not valid JSON — try to extract JSON from markdown code block
    const jsonMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (jsonMatch?.[1]) {
      try {
        const parsed = JSON.parse(jsonMatch[1]) as Record<string, unknown>;
        return {
          ...parsed,
          _meta: { capability, stageId, generatedAt: new Date().toISOString() },
        };
      } catch {
        // Still not valid JSON
      }
    }

    // Fall back to text wrapper
    return {
      result: content,
      _meta: {
        capability,
        stageId,
        generatedAt: new Date().toISOString(),
        note: 'AI response was not valid JSON — wrapped as text',
      },
    };
  }
}

/**
 * Check if the built-in agent system is ready to handle requests.
 */
export function isBuiltinReady(): boolean {
  return hasAnyProvider();
}
