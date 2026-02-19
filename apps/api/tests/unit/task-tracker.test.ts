/**
 * Unit tests for Redis-based concurrent task tracker.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  incrementAgentTasks,
  decrementAgentTasks,
  getAgentTaskCount,
  getAgentTaskCounts,
} from '../../src/modules/agents/task-tracker.js';

const mockRedis = {
  incr: vi.fn(),
  decr: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  mget: vi.fn(),
  expire: vi.fn(),
} as unknown as import('ioredis').Redis;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(mockRedis.expire).mockResolvedValue(1);
});

describe('incrementAgentTasks', () => {
  it('should increment and return new count', async () => {
    vi.mocked(mockRedis.incr).mockResolvedValue(3);

    const count = await incrementAgentTasks(mockRedis, 'agent-uuid-1');

    expect(count).toBe(3);
    expect(mockRedis.incr).toHaveBeenCalledWith('maof:agent:tasks:agent-uuid-1');
    expect(mockRedis.expire).toHaveBeenCalledWith('maof:agent:tasks:agent-uuid-1', 3600);
  });
});

describe('decrementAgentTasks', () => {
  it('should decrement and return new count', async () => {
    vi.mocked(mockRedis.decr).mockResolvedValue(2);

    const count = await decrementAgentTasks(mockRedis, 'agent-uuid-1');

    expect(count).toBe(2);
    expect(mockRedis.decr).toHaveBeenCalledWith('maof:agent:tasks:agent-uuid-1');
  });

  it('should clamp to 0 when decrement goes below 0', async () => {
    vi.mocked(mockRedis.decr).mockResolvedValue(-1);
    vi.mocked(mockRedis.set).mockResolvedValue('OK');

    const count = await decrementAgentTasks(mockRedis, 'agent-uuid-1');

    expect(count).toBe(0);
    expect(mockRedis.set).toHaveBeenCalledWith('maof:agent:tasks:agent-uuid-1', 0, 'EX', 3600);
  });
});

describe('getAgentTaskCount', () => {
  it('should return current count', async () => {
    vi.mocked(mockRedis.get).mockResolvedValue('5');

    const count = await getAgentTaskCount(mockRedis, 'agent-uuid-1');

    expect(count).toBe(5);
  });

  it('should return 0 when key does not exist', async () => {
    vi.mocked(mockRedis.get).mockResolvedValue(null);

    const count = await getAgentTaskCount(mockRedis, 'agent-uuid-1');

    expect(count).toBe(0);
  });
});

describe('getAgentTaskCounts', () => {
  it('should return counts for multiple agents', async () => {
    vi.mocked(mockRedis.mget).mockResolvedValue(['3', '0', null]);

    const counts = await getAgentTaskCounts(mockRedis, ['a', 'b', 'c']);

    expect(counts.get('a')).toBe(3);
    expect(counts.get('b')).toBe(0);
    expect(counts.get('c')).toBe(0);
  });

  it('should return empty map for empty input', async () => {
    const counts = await getAgentTaskCounts(mockRedis, []);

    expect(counts.size).toBe(0);
    expect(mockRedis.mget).not.toHaveBeenCalled();
  });
});
