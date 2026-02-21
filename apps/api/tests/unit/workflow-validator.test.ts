/**
 * Unit tests for workflow validator — parallel execution support.
 * Tests getExecutionLevels() which groups stages by dependency levels
 * for concurrent execution.
 */
import { describe, it, expect } from 'vitest';
import {
  getExecutionLevels,
  getExecutionOrder,
  validateWorkflowDefinition,
  type StageDefinition,
} from '../../src/modules/workflows/validator.js';

function stage(id: string, deps: string[] = []): StageDefinition {
  return {
    id,
    name: `Stage ${id}`,
    agentCapability: `cap-${id}`,
    input: {},
    dependencies: deps,
  };
}

describe('getExecutionLevels', () => {
  it('should return a single level for stages with no dependencies', () => {
    const stages = [stage('a'), stage('b'), stage('c')];
    const levels = getExecutionLevels(stages);

    expect(levels).toHaveLength(1);
    expect(levels[0]!.map((s) => s.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('should return sequential levels for a linear chain', () => {
    const stages = [
      stage('a'),
      stage('b', ['a']),
      stage('c', ['b']),
    ];
    const levels = getExecutionLevels(stages);

    expect(levels).toHaveLength(3);
    expect(levels[0]!.map((s) => s.id)).toEqual(['a']);
    expect(levels[1]!.map((s) => s.id)).toEqual(['b']);
    expect(levels[2]!.map((s) => s.id)).toEqual(['c']);
  });

  it('should group independent branches into the same level', () => {
    // Diamond shape: a -> b, a -> c, b+c -> d
    const stages = [
      stage('a'),
      stage('b', ['a']),
      stage('c', ['a']),
      stage('d', ['b', 'c']),
    ];
    const levels = getExecutionLevels(stages);

    expect(levels).toHaveLength(3);
    expect(levels[0]!.map((s) => s.id)).toEqual(['a']);
    expect(levels[1]!.map((s) => s.id).sort()).toEqual(['b', 'c']);
    expect(levels[2]!.map((s) => s.id)).toEqual(['d']);
  });

  it('should handle multiple independent roots', () => {
    // Two independent chains: a->b and c->d
    const stages = [
      stage('a'),
      stage('c'),
      stage('b', ['a']),
      stage('d', ['c']),
    ];
    const levels = getExecutionLevels(stages);

    expect(levels).toHaveLength(2);
    expect(levels[0]!.map((s) => s.id).sort()).toEqual(['a', 'c']);
    expect(levels[1]!.map((s) => s.id).sort()).toEqual(['b', 'd']);
  });

  it('should handle a single stage', () => {
    const stages = [stage('only')];
    const levels = getExecutionLevels(stages);

    expect(levels).toHaveLength(1);
    expect(levels[0]!.map((s) => s.id)).toEqual(['only']);
  });

  it('should handle complex DAG with mixed parallelism', () => {
    // a -> b -> d
    // a -> c -> d
    //      c -> e
    const stages = [
      stage('a'),
      stage('b', ['a']),
      stage('c', ['a']),
      stage('d', ['b', 'c']),
      stage('e', ['c']),
    ];
    const levels = getExecutionLevels(stages);

    expect(levels).toHaveLength(3);
    expect(levels[0]!.map((s) => s.id)).toEqual(['a']);
    expect(levels[1]!.map((s) => s.id).sort()).toEqual(['b', 'c']);
    // d depends on b+c (level 1), e depends on c (level 1) -> both at level 2
    expect(levels[2]!.map((s) => s.id).sort()).toEqual(['d', 'e']);
  });
});

describe('getExecutionOrder backward compatibility', () => {
  it('should still return a flat sorted list', () => {
    const stages = [
      stage('a'),
      stage('b', ['a']),
      stage('c', ['a']),
      stage('d', ['b', 'c']),
    ];
    const order = getExecutionOrder(stages);

    expect(order).toHaveLength(4);
    expect(order[0]!.id).toBe('a');
    // b and c can be in either order but must come before d
    const dIndex = order.findIndex((s) => s.id === 'd');
    const bIndex = order.findIndex((s) => s.id === 'b');
    const cIndex = order.findIndex((s) => s.id === 'c');
    expect(bIndex).toBeLessThan(dIndex);
    expect(cIndex).toBeLessThan(dIndex);
  });
});
