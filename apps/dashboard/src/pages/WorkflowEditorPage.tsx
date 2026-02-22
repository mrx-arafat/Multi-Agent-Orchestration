/**
 * Workflow Visual Editor — drag-and-drop stage builder.
 * Allows users to create workflow stages, configure inputs/outputs,
 * set dependencies, and execute or save as template.
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import {
  executeWorkflow,
  createWorkflowTemplate,
} from '../lib/api.js';

// ── Types ─────────────────────────────────────────────────────────────

interface StageNode {
  id: string;
  name: string;
  agentCapability: string;
  input: Record<string, string>;
  dependencies: string[];
  retryConfig: { maxRetries: number; backoffMs: number; timeoutMs: number };
}

interface WorkflowDraft {
  name: string;
  stages: StageNode[];
}

// ── Available Capabilities (from built-in agents) ─────────────────────

const BUILTIN_CAPABILITIES = [
  'text.summarize', 'text.translate', 'text.sentiment', 'text.classify',
  'research.web_search', 'research.fact_check', 'research.compare',
  'content.blog_post', 'content.email', 'content.social_media',
  'code.review', 'code.generate', 'code.explain', 'code.refactor',
  'data.extract', 'data.transform', 'data.analyze',
];

// ── Helper: Generate Stage ID ─────────────────────────────────────────

function nextStageId(counterRef: React.MutableRefObject<number>): string {
  counterRef.current++;
  return `stage_${counterRef.current}`;
}

// ── Stage Card Component ──────────────────────────────────────────────

function StageCard({
  stage,
  index,
  allStages,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: {
  stage: StageNode;
  index: number;
  allStages: StageNode[];
  onUpdate: (updated: StageNode) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const availableDeps = allStages.filter(s => s.id !== stage.id);
  const [inputKey, setInputKey] = useState('');
  const [inputVal, setInputVal] = useState('');

  const addInput = () => {
    if (!inputKey.trim()) return;
    onUpdate({ ...stage, input: { ...stage.input, [inputKey]: inputVal } });
    setInputKey('');
    setInputVal('');
  };

  const removeInput = (key: string) => {
    const { [key]: _, ...rest } = stage.input;
    onUpdate({ ...stage, input: rest });
  };

  const toggleDep = (depId: string) => {
    const deps = stage.dependencies.includes(depId)
      ? stage.dependencies.filter(d => d !== depId)
      : [...stage.dependencies, depId];
    onUpdate({ ...stage, dependencies: deps });
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center h-6 w-6 rounded-full bg-brand-100 text-brand-700 text-xs font-bold">
            {index + 1}
          </span>
          <input
            value={stage.name}
            onChange={(e) => onUpdate({ ...stage, name: e.target.value })}
            className="text-sm font-medium text-gray-900 bg-transparent border-none focus:outline-none focus:ring-0 p-0"
            placeholder="Stage name"
          />
        </div>
        <div className="flex items-center gap-1">
          {!isFirst && (
            <button onClick={onMoveUp} className="p-1 text-gray-400 hover:text-gray-600" title="Move up">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" /></svg>
            </button>
          )}
          {!isLast && (
            <button onClick={onMoveDown} className="p-1 text-gray-400 hover:text-gray-600" title="Move down">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
            </button>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1 text-gray-400 hover:text-gray-600"
          >
            <svg className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
          </button>
          <button onClick={onRemove} className="p-1 text-red-400 hover:text-red-600">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      </div>

      {expanded && (
        <div className="p-4 space-y-4">
          {/* Capability */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Agent Capability</label>
            <select
              value={stage.agentCapability}
              onChange={(e) => onUpdate({ ...stage, agentCapability: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            >
              <option value="">Select capability...</option>
              {BUILTIN_CAPABILITIES.map(cap => (
                <option key={cap} value={cap}>{cap}</option>
              ))}
            </select>
          </div>

          {/* Stage ID */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Stage ID</label>
            <input
              value={stage.id}
              onChange={(e) => onUpdate({ ...stage, id: e.target.value.replace(/\s/g, '_') })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              placeholder="unique_stage_id"
            />
          </div>

          {/* Dependencies */}
          {availableDeps.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Dependencies (runs after)</label>
              <div className="flex flex-wrap gap-2">
                {availableDeps.map(dep => (
                  <button
                    key={dep.id}
                    onClick={() => toggleDep(dep.id)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                      stage.dependencies.includes(dep.id)
                        ? 'bg-brand-100 text-brand-700 ring-1 ring-brand-300'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    {dep.name || dep.id}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input Variables */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Input Variables</label>
            {Object.entries(stage.input).length > 0 && (
              <div className="space-y-1 mb-2">
                {Object.entries(stage.input).map(([key, val]) => (
                  <div key={key} className="flex items-center gap-2 text-xs">
                    <code className="px-1.5 py-0.5 bg-gray-100 rounded font-mono text-gray-700">{key}</code>
                    <span className="text-gray-400">=</span>
                    <code className="px-1.5 py-0.5 bg-blue-50 rounded font-mono text-blue-700 truncate flex-1">{val}</code>
                    <button onClick={() => removeInput(key)} className="text-red-400 hover:text-red-600">
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                value={inputKey}
                onChange={(e) => setInputKey(e.target.value)}
                placeholder="key"
                className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-xs font-mono focus:ring-1 focus:ring-brand-500"
              />
              <input
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                placeholder="${workflow.input.field} or value"
                className="flex-[2] rounded border border-gray-300 px-2 py-1.5 text-xs font-mono focus:ring-1 focus:ring-brand-500"
              />
              <button onClick={addInput} className="px-2 py-1.5 bg-gray-100 rounded text-xs font-medium text-gray-600 hover:bg-gray-200">
                Add
              </button>
            </div>
            <p className="mt-1 text-[10px] text-gray-400">
              Use {'${workflow.input.field}'} for workflow inputs or {'${stageId.output.field}'} for previous stage outputs
            </p>
          </div>

          {/* Retry Config */}
          <details className="text-xs">
            <summary className="text-gray-500 font-medium cursor-pointer hover:text-gray-700">Retry Configuration</summary>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] text-gray-400">Max Retries</label>
                <input
                  type="number"
                  value={stage.retryConfig.maxRetries}
                  onChange={(e) => onUpdate({
                    ...stage,
                    retryConfig: { ...stage.retryConfig, maxRetries: parseInt(e.target.value) || 0 },
                  })}
                  className="w-full rounded border border-gray-300 px-2 py-1 text-xs focus:ring-1 focus:ring-brand-500"
                  min={0}
                  max={10}
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-400">Backoff (ms)</label>
                <input
                  type="number"
                  value={stage.retryConfig.backoffMs}
                  onChange={(e) => onUpdate({
                    ...stage,
                    retryConfig: { ...stage.retryConfig, backoffMs: parseInt(e.target.value) || 1000 },
                  })}
                  className="w-full rounded border border-gray-300 px-2 py-1 text-xs focus:ring-1 focus:ring-brand-500"
                  step={500}
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-400">Timeout (ms)</label>
                <input
                  type="number"
                  value={stage.retryConfig.timeoutMs}
                  onChange={(e) => onUpdate({
                    ...stage,
                    retryConfig: { ...stage.retryConfig, timeoutMs: parseInt(e.target.value) || 30000 },
                  })}
                  className="w-full rounded border border-gray-300 px-2 py-1 text-xs focus:ring-1 focus:ring-brand-500"
                  step={5000}
                />
              </div>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

// ── Compute Execution Levels (groups stages for parallel execution) ────

function computeExecutionLevels(stages: StageNode[]): StageNode[][] {
  if (stages.length === 0) return [];

  const stageMap = new Map(stages.map((s) => [s.id, s]));
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const stage of stages) {
    inDegree.set(stage.id, stage.dependencies?.length ?? 0);
    adjacency.set(stage.id, []);
  }

  for (const stage of stages) {
    for (const dep of stage.dependencies ?? []) {
      adjacency.get(dep)?.push(stage.id);
    }
  }

  const levels: StageNode[][] = [];
  let queue = stages.filter((s) => (inDegree.get(s.id) ?? 0) === 0);

  while (queue.length > 0) {
    levels.push(queue);
    const nextQueue: StageNode[] = [];
    for (const stage of queue) {
      for (const dependent of adjacency.get(stage.id) ?? []) {
        const deg = (inDegree.get(dependent) ?? 0) - 1;
        inDegree.set(dependent, deg);
        if (deg === 0) {
          const s = stageMap.get(dependent);
          if (s) nextQueue.push(s);
        }
      }
    }
    queue = nextQueue;
  }

  return levels;
}

// ── Connection Lines (visual dependency indicators) ────────────────────

function DependencyGraph({ stages }: { stages: StageNode[] }) {
  if (stages.length < 2) return null;

  const levels = computeExecutionLevels(stages);
  const hasParallel = levels.some((l) => l.length > 1);

  return (
    <div className="mb-4 px-4 py-3 bg-gray-50 rounded-lg border border-gray-200">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-medium text-gray-500">Execution Flow:</span>
        {hasParallel && (
          <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[10px] font-semibold">
            PARALLEL
          </span>
        )}
        <span className="text-[10px] text-gray-400 ml-auto">{levels.length} level{levels.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {levels.map((level, li) => (
          <span key={li} className="flex items-center gap-1.5">
            {level.length === 1 ? (
              <span className="px-2 py-0.5 bg-brand-100 text-brand-700 rounded text-xs font-medium">
                {level[0]!.name || level[0]!.id}
              </span>
            ) : (
              <span className="flex items-center gap-1 px-2 py-1 bg-emerald-50 border border-emerald-200 rounded-lg">
                {level.map((stage, si) => (
                  <span key={stage.id} className="flex items-center gap-1">
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-xs font-medium">
                      {stage.name || stage.id}
                    </span>
                    {si < level.length - 1 && (
                      <span className="text-[10px] text-emerald-400 font-bold">||</span>
                    )}
                  </span>
                ))}
              </span>
            )}
            {li < levels.length - 1 && (
              <svg className="h-3 w-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── JSON Preview Panel ────────────────────────────────────────────────

function JsonPreview({ workflow }: { workflow: WorkflowDraft }) {
  const definition = {
    name: workflow.name,
    stages: workflow.stages.map(s => ({
      id: s.id,
      name: s.name,
      agentCapability: s.agentCapability,
      ...(Object.keys(s.input).length > 0 ? { input: s.input } : {}),
      ...(s.dependencies.length > 0 ? { dependencies: s.dependencies } : {}),
      ...(s.retryConfig.maxRetries !== 2 || s.retryConfig.backoffMs !== 1000 || s.retryConfig.timeoutMs !== 30000
        ? { retryConfig: s.retryConfig }
        : {}),
    })),
  };

  return (
    <pre className="bg-gray-900 text-green-400 p-4 rounded-lg text-xs font-mono overflow-auto max-h-96">
      {JSON.stringify(definition, null, 2)}
    </pre>
  );
}

// ── Main Editor Page ──────────────────────────────────────────────────

export function WorkflowEditorPage() {
  const [workflow, setWorkflow] = useState<WorkflowDraft>({
    name: 'My Workflow',
    stages: [],
  });
  const [showJson, setShowJson] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [workflowInput, setWorkflowInput] = useState('{}');
  const stageCounterRef = useRef(0);

  const addStage = useCallback(() => {
    const id = nextStageId(stageCounterRef);
    const newStage: StageNode = {
      id,
      name: `Stage ${workflow.stages.length + 1}`,
      agentCapability: '',
      input: {},
      dependencies: workflow.stages.length > 0 ? [workflow.stages[workflow.stages.length - 1]!.id] : [],
      retryConfig: { maxRetries: 2, backoffMs: 1000, timeoutMs: 30000 },
    };
    setWorkflow(prev => ({ ...prev, stages: [...prev.stages, newStage] }));
  }, [workflow.stages]);

  const updateStage = useCallback((index: number, updated: StageNode) => {
    setWorkflow(prev => ({
      ...prev,
      stages: prev.stages.map((s, i) => i === index ? updated : s),
    }));
  }, []);

  const removeStage = useCallback((index: number) => {
    setWorkflow(prev => {
      const removedId = prev.stages[index]!.id;
      return {
        ...prev,
        stages: prev.stages
          .filter((_, i) => i !== index)
          .map(s => ({
            ...s,
            dependencies: s.dependencies.filter(d => d !== removedId),
          })),
      };
    });
  }, []);

  const moveStage = useCallback((from: number, to: number) => {
    setWorkflow(prev => {
      const stages = [...prev.stages];
      const [moved] = stages.splice(from, 1);
      stages.splice(to, 0, moved!);
      return { ...prev, stages };
    });
  }, []);

  const buildDefinition = () => ({
    name: workflow.name,
    stages: workflow.stages.map(s => ({
      id: s.id,
      name: s.name,
      agentCapability: s.agentCapability,
      ...(Object.keys(s.input).length > 0 ? { input: s.input } : {}),
      ...(s.dependencies.length > 0 ? { dependencies: s.dependencies } : {}),
      ...(s.retryConfig.maxRetries !== 2 || s.retryConfig.backoffMs !== 1000 || s.retryConfig.timeoutMs !== 30000
        ? { retryConfig: s.retryConfig }
        : {}),
    })),
  });

  const handleExecute = async () => {
    if (workflow.stages.length === 0) {
      setResult({ type: 'error', message: 'Add at least one stage before executing' });
      return;
    }
    const invalidStage = workflow.stages.find(s => !s.agentCapability);
    if (invalidStage) {
      setResult({ type: 'error', message: `Stage "${invalidStage.name}" needs a capability` });
      return;
    }

    setExecuting(true);
    setResult(null);
    try {
      let input: Record<string, unknown> = {};
      try { input = JSON.parse(workflowInput); } catch { /* empty */ }
      const res = await executeWorkflow(buildDefinition(), input);
      setResult({ type: 'success', message: `Workflow queued: ${res.workflowRunId}` });
    } catch (err) {
      setResult({ type: 'error', message: err instanceof Error ? err.message : 'Execution failed' });
    } finally {
      setExecuting(false);
    }
  };

  const handleSaveTemplate = async () => {
    if (workflow.stages.length === 0) {
      setResult({ type: 'error', message: 'Add at least one stage before saving' });
      return;
    }
    setSaving(true);
    setResult(null);
    try {
      await createWorkflowTemplate({
        name: workflow.name,
        description: `Created via visual editor with ${workflow.stages.length} stages`,
        category: 'custom',
        definition: buildDefinition(),
        isPublic: false,
        tags: [...new Set(workflow.stages.map(s => s.agentCapability.split('.')[0]!))],
      });
      setResult({ type: 'success', message: 'Saved as template successfully' });
    } catch (err) {
      setResult({ type: 'error', message: err instanceof Error ? err.message : 'Save failed' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Workflow Editor</h1>
          <p className="text-sm text-gray-500">Visual drag-and-drop workflow builder</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowJson(!showJson)}
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            {showJson ? 'Hide JSON' : 'Show JSON'}
          </button>
          <button
            onClick={handleSaveTemplate}
            disabled={saving}
            className="px-4 py-2 rounded-lg border border-brand-300 bg-brand-50 text-sm font-medium text-brand-700 hover:bg-brand-100 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save as Template'}
          </button>
          <button
            onClick={handleExecute}
            disabled={executing}
            className="px-4 py-2 rounded-lg bg-brand-600 text-sm font-medium text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
          >
            {executing ? 'Executing...' : 'Execute Workflow'}
          </button>
        </div>
      </div>

      {/* Result Banner */}
      {result && (
        <div className={`px-4 py-3 rounded-lg text-sm font-medium ${
          result.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {result.message}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Stage List */}
        <div className="lg:col-span-2 space-y-4">
          {/* Workflow Name */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <label className="block text-xs font-medium text-gray-500 mb-1">Workflow Name</label>
            <input
              value={workflow.name}
              onChange={(e) => setWorkflow(prev => ({ ...prev, name: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              placeholder="My Workflow"
            />
          </div>

          {/* Dependency Graph */}
          <DependencyGraph stages={workflow.stages} />

          {/* Stages */}
          {workflow.stages.map((stage, index) => (
            <StageCard
              key={stage.id}
              stage={stage}
              index={index}
              allStages={workflow.stages}
              onUpdate={(updated) => updateStage(index, updated)}
              onRemove={() => removeStage(index)}
              onMoveUp={() => moveStage(index, index - 1)}
              onMoveDown={() => moveStage(index, index + 1)}
              isFirst={index === 0}
              isLast={index === workflow.stages.length - 1}
            />
          ))}

          {/* Add Stage Button */}
          <button
            onClick={addStage}
            className="w-full py-3 rounded-xl border-2 border-dashed border-gray-300 text-sm font-medium text-gray-500 hover:border-brand-400 hover:text-brand-600 hover:bg-brand-50 transition-all"
          >
            + Add Stage
          </button>
        </div>

        {/* Right: Config & Preview */}
        <div className="space-y-4">
          {/* Workflow Input */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <label className="block text-xs font-medium text-gray-500 mb-1">Workflow Input (JSON)</label>
            <textarea
              value={workflowInput}
              onChange={(e) => setWorkflowInput(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs font-mono focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              rows={4}
              placeholder='{"text": "Hello world", "language": "es"}'
            />
          </div>

          {/* Summary */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <h3 className="text-xs font-semibold text-gray-900 mb-3">Summary</h3>
            {(() => {
              const levels = computeExecutionLevels(workflow.stages);
              const parallelLevels = levels.filter((l) => l.length > 1).length;
              return (
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Stages</span>
                    <span className="font-medium text-gray-900">{workflow.stages.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Execution Levels</span>
                    <span className="font-medium text-gray-900">{levels.length}</span>
                  </div>
                  {parallelLevels > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Parallel Groups</span>
                      <span className="font-medium text-emerald-600">{parallelLevels}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-500">Capabilities</span>
                    <span className="font-medium text-gray-900">
                      {new Set(workflow.stages.map(s => s.agentCapability).filter(Boolean)).size}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Dependencies</span>
                    <span className="font-medium text-gray-900">
                      {workflow.stages.reduce((sum, s) => sum + s.dependencies.length, 0)}
                    </span>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* JSON Preview */}
          {showJson && (
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <h3 className="text-xs font-semibold text-gray-900 mb-3">JSON Definition</h3>
              <JsonPreview workflow={workflow} />
            </div>
          )}

          {/* Quick Templates */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <h3 className="text-xs font-semibold text-gray-900 mb-3">Quick Start Templates</h3>
            <div className="space-y-2">
              <button
                onClick={() => {
                  stageCounterRef.current = 0;
                  setWorkflow({
                    name: 'Text Translation Pipeline',
                    stages: [
                      { id: 'analyze', name: 'Analyze Text', agentCapability: 'text.sentiment', input: { text: '${workflow.input.text}' }, dependencies: [], retryConfig: { maxRetries: 2, backoffMs: 1000, timeoutMs: 30000 } },
                      { id: 'translate', name: 'Translate', agentCapability: 'text.translate', input: { text: '${workflow.input.text}', targetLanguage: '${workflow.input.language}' }, dependencies: ['analyze'], retryConfig: { maxRetries: 2, backoffMs: 1000, timeoutMs: 30000 } },
                      { id: 'summarize', name: 'Summarize', agentCapability: 'text.summarize', input: { text: '${translate.output.translated}' }, dependencies: ['translate'], retryConfig: { maxRetries: 2, backoffMs: 1000, timeoutMs: 30000 } },
                    ],
                  });
                }}
                className="w-full text-left px-3 py-2 rounded-lg bg-gray-50 text-xs font-medium text-gray-700 hover:bg-gray-100 transition-colors"
              >
                Text Translation Pipeline (3 stages)
              </button>
              <button
                onClick={() => {
                  stageCounterRef.current = 0;
                  setWorkflow({
                    name: 'Code Review Workflow',
                    stages: [
                      { id: 'review', name: 'Code Review', agentCapability: 'code.review', input: { code: '${workflow.input.code}', language: '${workflow.input.language}' }, dependencies: [], retryConfig: { maxRetries: 2, backoffMs: 1000, timeoutMs: 30000 } },
                      { id: 'explain', name: 'Explain Issues', agentCapability: 'code.explain', input: { code: '${workflow.input.code}', review: '${review.output.review}' }, dependencies: ['review'], retryConfig: { maxRetries: 2, backoffMs: 1000, timeoutMs: 30000 } },
                      { id: 'refactor', name: 'Refactor', agentCapability: 'code.refactor', input: { code: '${workflow.input.code}', suggestions: '${review.output.suggestions}' }, dependencies: ['review'], retryConfig: { maxRetries: 2, backoffMs: 1000, timeoutMs: 30000 } },
                    ],
                  });
                }}
                className="w-full text-left px-3 py-2 rounded-lg bg-gray-50 text-xs font-medium text-gray-700 hover:bg-gray-100 transition-colors"
              >
                Code Review Workflow (3 stages)
              </button>
              <button
                onClick={() => {
                  stageCounterRef.current = 0;
                  setWorkflow({
                    name: 'Research & Content Pipeline',
                    stages: [
                      { id: 'research', name: 'Web Research', agentCapability: 'research.web_search', input: { query: '${workflow.input.topic}' }, dependencies: [], retryConfig: { maxRetries: 2, backoffMs: 1000, timeoutMs: 30000 } },
                      { id: 'analyze', name: 'Analyze Data', agentCapability: 'data.analyze', input: { data: '${research.output.results}' }, dependencies: ['research'], retryConfig: { maxRetries: 2, backoffMs: 1000, timeoutMs: 30000 } },
                      { id: 'write', name: 'Write Blog Post', agentCapability: 'content.blog_post', input: { topic: '${workflow.input.topic}', research: '${research.output.results}', analysis: '${analyze.output.analysis}' }, dependencies: ['research', 'analyze'], retryConfig: { maxRetries: 2, backoffMs: 1000, timeoutMs: 30000 } },
                      { id: 'social', name: 'Create Social Posts', agentCapability: 'content.social_media', input: { content: '${write.output.article}', topic: '${workflow.input.topic}' }, dependencies: ['write'], retryConfig: { maxRetries: 2, backoffMs: 1000, timeoutMs: 30000 } },
                    ],
                  });
                }}
                className="w-full text-left px-3 py-2 rounded-lg bg-gray-50 text-xs font-medium text-gray-700 hover:bg-gray-100 transition-colors"
              >
                Research & Content Pipeline (4 stages)
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
