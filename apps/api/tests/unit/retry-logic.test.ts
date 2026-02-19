/**
 * Unit tests for workflow stage retry logic and fallback agent routing.
 * Tests executeStageWithRetry in isolation with mocked dependencies.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies before importing the module
vi.mock('../../src/modules/agents/router.js', () => ({
  findAgentForCapability: vi.fn(),
}));

vi.mock('../../src/modules/agents/service.js', () => ({
  getAgentAuthToken: vi.fn(),
}));

vi.mock('../../src/lib/agent-client.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/lib/agent-client.js')>();
  return {
    ...original,
    callAgent: vi.fn(),
  };
});

vi.mock('../../src/modules/audit/service.js', () => ({
  logStageExecution: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/config/index.js', () => ({
  getConfig: vi.fn(() => ({
    MAOF_AGENT_DISPATCH_MODE: 'real',
    MAOF_AGENT_CALL_TIMEOUT_MS: 30000,
  })),
}));

import { executeStageWithRetry } from '../../src/queue/workflow-worker.js';
import { findAgentForCapability } from '../../src/modules/agents/router.js';
import { getAgentAuthToken } from '../../src/modules/agents/service.js';
import { callAgent, AgentCallError } from '../../src/lib/agent-client.js';
import { logStageExecution } from '../../src/modules/audit/service.js';
import { getConfig } from '../../src/config/index.js';
import type { StageDefinition } from '../../src/modules/workflows/validator.js';
import type { Database } from '../../src/db/index.js';

const mockDb = {} as Database;

const mockAgent = {
  agentUuid: 'agent-uuid-1',
  agentId: 'agent-1',
  name: 'Primary Agent',
  endpoint: 'https://agent1.example.com',
  maxConcurrentTasks: 5,
};

const fallbackAgent = {
  agentUuid: 'agent-uuid-2',
  agentId: 'agent-2',
  name: 'Fallback Agent',
  endpoint: 'https://agent2.example.com',
  maxConcurrentTasks: 3,
};

const baseStage: StageDefinition = {
  id: 'stage-1',
  name: 'Test Stage',
  agentCapability: 'text-generation',
  input: { prompt: 'hello' },
};

const successResponse = {
  status: 'success' as const,
  output: { result: 'done' },
  execution_time_ms: 100,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getConfig).mockReturnValue({
    MAOF_AGENT_DISPATCH_MODE: 'real',
    MAOF_AGENT_CALL_TIMEOUT_MS: 30000,
  } as ReturnType<typeof getConfig>);
  vi.mocked(getAgentAuthToken).mockResolvedValue('auth-token');
  vi.mocked(logStageExecution).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('executeStageWithRetry', () => {
  describe('mock mode', () => {
    it('should skip retry logic in mock mode', async () => {
      vi.mocked(getConfig).mockReturnValue({
        MAOF_AGENT_DISPATCH_MODE: 'mock',
        MAOF_AGENT_CALL_TIMEOUT_MS: 30000,
      } as ReturnType<typeof getConfig>);

      const result = await executeStageWithRetry(
        mockDb, baseStage, { prompt: 'hello' }, 'wfr-1', 'user-1', [],
      );

      expect(result.agentId).toBe('mock-text-generation');
      expect(result.output.capability).toBe('text-generation');
      expect(findAgentForCapability).not.toHaveBeenCalled();
    });
  });

  describe('successful execution', () => {
    it('should succeed on first attempt', async () => {
      vi.mocked(findAgentForCapability).mockResolvedValue(mockAgent);
      vi.mocked(callAgent).mockResolvedValue(successResponse);

      const result = await executeStageWithRetry(
        mockDb, baseStage, { prompt: 'hello' }, 'wfr-1', 'user-1', [],
      );

      expect(result.agentId).toBe('agent-1');
      expect(result.output).toEqual({ result: 'done' });
      expect(callAgent).toHaveBeenCalledTimes(1);
      expect(logStageExecution).not.toHaveBeenCalled();
    });
  });

  describe('retry on retryable errors', () => {
    it('should retry and succeed on second attempt', async () => {
      vi.mocked(findAgentForCapability).mockResolvedValue(mockAgent);
      vi.mocked(callAgent)
        .mockRejectedValueOnce(new AgentCallError('Timeout', 'TIMEOUT', true, 'text-generation'))
        .mockResolvedValueOnce(successResponse);

      const stage: StageDefinition = {
        ...baseStage,
        retryConfig: { maxRetries: 2, backoffMs: 10 }, // Short backoff for tests
      };

      const result = await executeStageWithRetry(
        mockDb, stage, { prompt: 'hello' }, 'wfr-1', 'user-1', [],
      );

      expect(result.agentId).toBe('agent-1');
      expect(callAgent).toHaveBeenCalledTimes(2);
      // Should have logged a retry audit entry
      expect(logStageExecution).toHaveBeenCalledWith(mockDb, expect.objectContaining({
        action: 'retry',
        stageId: 'stage-1',
        status: 'retry_1_of_2',
      }));
    });

    it('should retry up to maxRetries times', async () => {
      vi.mocked(findAgentForCapability).mockResolvedValue(mockAgent);
      vi.mocked(callAgent)
        .mockRejectedValueOnce(new AgentCallError('Timeout', 'TIMEOUT', true, 'text-generation'))
        .mockRejectedValueOnce(new AgentCallError('Timeout', 'TIMEOUT', true, 'text-generation'))
        .mockResolvedValueOnce(successResponse);

      const stage: StageDefinition = {
        ...baseStage,
        retryConfig: { maxRetries: 2, backoffMs: 10 },
      };

      const result = await executeStageWithRetry(
        mockDb, stage, { prompt: 'hello' }, 'wfr-1', 'user-1', [],
      );

      expect(result.agentId).toBe('agent-1');
      expect(callAgent).toHaveBeenCalledTimes(3); // initial + 2 retries
      expect(logStageExecution).toHaveBeenCalledTimes(2); // 2 retry audit entries
    });

    it('should use exponential backoff delays', async () => {
      vi.mocked(findAgentForCapability).mockResolvedValue(mockAgent);
      vi.mocked(callAgent)
        .mockRejectedValueOnce(new AgentCallError('Timeout', 'TIMEOUT', true, 'text-generation'))
        .mockRejectedValueOnce(new AgentCallError('Timeout', 'TIMEOUT', true, 'text-generation'))
        .mockResolvedValueOnce(successResponse);

      const stage: StageDefinition = {
        ...baseStage,
        retryConfig: { maxRetries: 3, backoffMs: 100 },
      };

      const start = Date.now();
      await executeStageWithRetry(
        mockDb, stage, { prompt: 'hello' }, 'wfr-1', 'user-1', [],
      );
      const elapsed = Date.now() - start;

      // backoffMs=100, retry 0 = 100ms, retry 1 = 200ms, total >= 300ms
      expect(elapsed).toBeGreaterThanOrEqual(250); // Allow minor timing variance
    });
  });

  describe('non-retryable errors', () => {
    it('should fail immediately on non-retryable error', async () => {
      vi.mocked(findAgentForCapability).mockResolvedValue(mockAgent);
      vi.mocked(callAgent).mockRejectedValue(
        new AgentCallError('Bad request', 'AGENT_CLIENT_ERROR', false, 'text-generation'),
      );

      const stage: StageDefinition = {
        ...baseStage,
        retryConfig: { maxRetries: 3, backoffMs: 10 },
      };

      await expect(
        executeStageWithRetry(mockDb, stage, { prompt: 'hello' }, 'wfr-1', 'user-1', []),
      ).rejects.toThrow('Bad request');

      expect(callAgent).toHaveBeenCalledTimes(1);
      expect(logStageExecution).not.toHaveBeenCalled();
    });
  });

  describe('fallback agent routing', () => {
    it('should try fallback agent when primary exhausts retries', async () => {
      vi.mocked(findAgentForCapability)
        .mockResolvedValueOnce(mockAgent)     // Primary
        .mockResolvedValueOnce(fallbackAgent); // Fallback
      vi.mocked(callAgent)
        .mockRejectedValueOnce(new AgentCallError('Timeout', 'TIMEOUT', true, 'text-generation'))
        .mockRejectedValueOnce(new AgentCallError('Timeout', 'TIMEOUT', true, 'text-generation'))
        .mockRejectedValueOnce(new AgentCallError('Timeout', 'TIMEOUT', true, 'text-generation'))
        .mockResolvedValueOnce(successResponse); // Fallback succeeds

      const stage: StageDefinition = {
        ...baseStage,
        retryConfig: { maxRetries: 2, backoffMs: 10 },
      };

      const result = await executeStageWithRetry(
        mockDb, stage, { prompt: 'hello' }, 'wfr-1', 'user-1', [],
      );

      expect(result.agentId).toBe('agent-2');
      // Primary: 1 initial + 2 retries = 3, then fallback: 1 initial = 1, total = 4
      expect(callAgent).toHaveBeenCalledTimes(4);
      // findAgentForCapability called with exclude list on fallback
      expect(findAgentForCapability).toHaveBeenCalledTimes(2);
      expect(findAgentForCapability).toHaveBeenNthCalledWith(2, mockDb, 'text-generation', ['agent-uuid-1'], undefined);
    });

    it('should fail when no fallback agent is available', async () => {
      vi.mocked(findAgentForCapability)
        .mockResolvedValueOnce(mockAgent) // Primary
        .mockResolvedValueOnce(null);     // No fallback
      vi.mocked(callAgent)
        .mockRejectedValue(new AgentCallError('Server error', 'AGENT_SERVER_ERROR', true, 'text-generation'));

      const stage: StageDefinition = {
        ...baseStage,
        retryConfig: { maxRetries: 1, backoffMs: 10 },
      };

      await expect(
        executeStageWithRetry(mockDb, stage, { prompt: 'hello' }, 'wfr-1', 'user-1', []),
      ).rejects.toThrow('Server error');
    });
  });

  describe('no agent available', () => {
    it('should throw when no agent found initially', async () => {
      vi.mocked(findAgentForCapability).mockResolvedValue(null);

      await expect(
        executeStageWithRetry(mockDb, baseStage, { prompt: 'hello' }, 'wfr-1', 'user-1', []),
      ).rejects.toThrow("No online agent available with capability 'text-generation'");

      expect(callAgent).not.toHaveBeenCalled();
    });
  });

  describe('default retry config', () => {
    it('should use defaults when retryConfig is not set', async () => {
      vi.mocked(findAgentForCapability).mockResolvedValue(mockAgent);
      vi.mocked(callAgent)
        .mockRejectedValueOnce(new AgentCallError('Timeout', 'TIMEOUT', true, 'text-generation'))
        .mockRejectedValueOnce(new AgentCallError('Timeout', 'TIMEOUT', true, 'text-generation'))
        .mockResolvedValueOnce(successResponse);

      // No retryConfig — defaults to maxRetries=2
      const stage: StageDefinition = { ...baseStage };

      const result = await executeStageWithRetry(
        mockDb, stage, { prompt: 'hello' }, 'wfr-1', 'user-1', [],
      );

      expect(result.agentId).toBe('agent-1');
      expect(callAgent).toHaveBeenCalledTimes(3);
    });

    it('should respect maxRetries=0 (no retries)', async () => {
      vi.mocked(findAgentForCapability).mockResolvedValue(mockAgent);
      vi.mocked(callAgent).mockRejectedValue(
        new AgentCallError('Timeout', 'TIMEOUT', true, 'text-generation'),
      );

      const stage: StageDefinition = {
        ...baseStage,
        retryConfig: { maxRetries: 0, backoffMs: 10 },
      };

      // maxRetries=0 means no retries — still tries fallback
      vi.mocked(findAgentForCapability)
        .mockResolvedValueOnce(mockAgent)
        .mockResolvedValueOnce(null);

      await expect(
        executeStageWithRetry(mockDb, stage, { prompt: 'hello' }, 'wfr-1', 'user-1', []),
      ).rejects.toThrow('Timeout');

      expect(callAgent).toHaveBeenCalledTimes(1);
    });
  });

  describe('custom timeout per stage', () => {
    it('should pass stage-level timeoutMs to callAgent', async () => {
      vi.mocked(findAgentForCapability).mockResolvedValue(mockAgent);
      vi.mocked(callAgent).mockResolvedValue(successResponse);

      const stage: StageDefinition = {
        ...baseStage,
        retryConfig: { timeoutMs: 5000 },
      };

      await executeStageWithRetry(
        mockDb, stage, { prompt: 'hello' }, 'wfr-1', 'user-1', [],
      );

      expect(callAgent).toHaveBeenCalledWith(
        mockAgent.endpoint,
        'auth-token',
        expect.objectContaining({
          context: expect.objectContaining({ deadline_ms: 5000 }),
        }),
        5000,
      );
    });
  });
});
