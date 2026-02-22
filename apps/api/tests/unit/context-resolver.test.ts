/**
 * Unit tests for the context resolver — template resolution logic.
 */
import { describe, it, expect } from 'vitest';
import { resolveTemplate } from '../../src/modules/kanban/context-resolver.js';

describe('resolveTemplate', () => {
  const taskOutputs = new Map([
    ['task-aaa', {
      output: { path: '/tmp/repo', commit: 'abc123', count: 42 },
      result: 'Clone successful',
    }],
    ['task-bbb', {
      output: { findings: [{ severity: 'high' }, { severity: 'low' }], score: 7.5 },
      result: '2 findings',
    }],
  ]);

  it('resolves simple output field references', () => {
    const result = resolveTemplate('Repo at {{task-aaa.output.path}}', taskOutputs);
    expect(result).toBe('Repo at /tmp/repo');
  });

  it('resolves result references', () => {
    const result = resolveTemplate('Status: {{task-aaa.result}}', taskOutputs);
    expect(result).toBe('Status: Clone successful');
  });

  it('resolves multiple references in one string', () => {
    const result = resolveTemplate(
      'Commit {{task-aaa.output.commit}} has {{task-bbb.output.score}} score',
      taskOutputs,
    );
    expect(result).toBe('Commit abc123 has 7.5 score');
  });

  it('resolves object templates recursively', () => {
    const result = resolveTemplate(
      {
        repoPath: '{{task-aaa.output.path}}',
        findings: '{{task-bbb.output.findings}}',
      },
      taskOutputs,
    );
    expect(result).toEqual({
      repoPath: '/tmp/repo',
      findings: JSON.stringify([{ severity: 'high' }, { severity: 'low' }]),
    });
  });

  it('resolves array templates', () => {
    const result = resolveTemplate(
      ['{{task-aaa.output.commit}}', '{{task-bbb.result}}'],
      taskOutputs,
    );
    expect(result).toEqual(['abc123', '2 findings']);
  });

  it('leaves unresolvable templates intact', () => {
    const result = resolveTemplate('{{unknown-task.output.field}}', taskOutputs);
    expect(result).toBe('{{unknown-task.output.field}}');
  });

  it('handles null output gracefully', () => {
    const sparseMap = new Map([
      ['task-ccc', { output: null, result: null }],
    ]);
    const result = resolveTemplate('Val: {{task-ccc.output.field}}', sparseMap);
    expect(result).toBe('Val: ');
  });

  it('resolves numeric values as strings', () => {
    const result = resolveTemplate('Count: {{task-aaa.output.count}}', taskOutputs);
    expect(result).toBe('Count: 42');
  });

  it('passes through non-string non-object values unchanged', () => {
    expect(resolveTemplate(42, taskOutputs)).toBe(42);
    expect(resolveTemplate(true, taskOutputs)).toBe(true);
    expect(resolveTemplate(null, taskOutputs)).toBeNull();
  });
});
