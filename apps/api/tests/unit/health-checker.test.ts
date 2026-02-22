/**
 * Unit tests for agent health checker.
 * Tests checkAgentHealth in isolation with mocked DB and fetch.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkAgentHealth, checkAllAgentsHealth } from '../../src/modules/agents/health-checker.js';

// Mock DB
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockLimit = vi.fn();
const mockUpdate = vi.fn();
const mockSet = vi.fn();
const mockUpdateWhere = vi.fn();

const mockDb = {
  select: mockSelect,
  update: mockUpdate,
} as unknown as import('../../src/db/index.js').Database;

const agentRow = {
  agentUuid: 'agent-uuid-1',
  agentId: 'agent-1',
  endpoint: 'https://agent1.example.com',
  status: 'offline' as const,
};

function setupSelectChain(result: unknown[]) {
  mockLimit.mockResolvedValue(result);
  mockWhere.mockReturnValue({ limit: mockLimit });
  mockFrom.mockReturnValue({ where: mockWhere });
  mockSelect.mockReturnValue({ from: mockFrom });
}

function setupUpdateChain() {
  mockUpdateWhere.mockResolvedValue(undefined);
  mockSet.mockReturnValue({ where: mockUpdateWhere });
  mockUpdate.mockReturnValue({ set: mockSet });
}

beforeEach(() => {
  vi.clearAllMocks();
  setupUpdateChain();
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('checkAgentHealth', () => {
  it('should mark agent as online when health endpoint returns healthy', async () => {
    setupSelectChain([agentRow]);
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ status: 'healthy', timestamp: Date.now() }), { status: 200 }) as unknown as Response,
    );

    const result = await checkAgentHealth(mockDb, 'agent-uuid-1');

    expect(result.newStatus).toBe('online');
    expect(result.previousStatus).toBe('offline');
    expect(result.error).toBeUndefined();
    expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'online' }),
    );
  });

  it('should mark agent as degraded when health endpoint returns non-healthy status', async () => {
    setupSelectChain([agentRow]);
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ status: 'degraded', timestamp: Date.now() }), { status: 200 }) as unknown as Response,
    );

    const result = await checkAgentHealth(mockDb, 'agent-uuid-1');

    expect(result.newStatus).toBe('degraded');
    expect(result.error).toContain('Agent reported status: degraded');
  });

  it('should mark agent as degraded on non-200 HTTP response', async () => {
    setupSelectChain([agentRow]);
    vi.mocked(fetch).mockResolvedValue(
      new Response('Service Unavailable', { status: 503 }) as unknown as Response,
    );

    const result = await checkAgentHealth(mockDb, 'agent-uuid-1');

    expect(result.newStatus).toBe('degraded');
    expect(result.error).toContain('HTTP 503');
  });

  it('should mark agent as offline on network error', async () => {
    setupSelectChain([agentRow]);
    vi.mocked(fetch).mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await checkAgentHealth(mockDb, 'agent-uuid-1');

    expect(result.newStatus).toBe('offline');
    expect(result.error).toContain('ECONNREFUSED');
  });

  it('should mark agent as offline on timeout', async () => {
    setupSelectChain([agentRow]);
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    vi.mocked(fetch).mockRejectedValue(abortError);

    const result = await checkAgentHealth(mockDb, 'agent-uuid-1', 5000);

    expect(result.newStatus).toBe('offline');
    expect(result.error).toContain('timed out after 5000ms');
  });

  it('should throw when agent not found', async () => {
    setupSelectChain([]);

    await expect(
      checkAgentHealth(mockDb, 'nonexistent-uuid'),
    ).rejects.toThrow("Agent 'nonexistent-uuid' not found");
  });

  it('should call the correct health endpoint URL', async () => {
    setupSelectChain([{ ...agentRow, endpoint: 'https://agent.example.com/api/' }]);
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ status: 'healthy' }), { status: 200 }) as unknown as Response,
    );

    await checkAgentHealth(mockDb, 'agent-uuid-1');

    expect(fetch).toHaveBeenCalledWith(
      'https://agent.example.com/api/health',
      expect.objectContaining({ method: 'GET' }),
    );
  });
});

describe('checkAllAgentsHealth', () => {
  it('should return empty array when no agents exist', async () => {
    // For checkAllAgentsHealth, the first select returns list of agents (no .limit)
    const mockListWhere = vi.fn().mockResolvedValue([]);
    const mockListFrom = vi.fn().mockReturnValue({ where: mockListWhere });
    mockSelect.mockReturnValue({ from: mockListFrom });

    const results = await checkAllAgentsHealth(mockDb);

    expect(results).toEqual([]);
  });
});
