import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  listKanbanTasks,
  createKanbanTask,
  updateKanbanTaskStatus,
  listTeamAgents,
  getTeam,
  type KanbanTask,
  type Agent,
  type Team,
} from '../lib/api';

const COLUMNS = [
  { key: 'backlog', label: 'Backlog', color: 'bg-gray-400' },
  { key: 'todo', label: 'To Do', color: 'bg-blue-400' },
  { key: 'in_progress', label: 'In Progress', color: 'bg-yellow-400' },
  { key: 'review', label: 'Review', color: 'bg-purple-400' },
  { key: 'done', label: 'Done', color: 'bg-green-400' },
];

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'border-l-red-500',
  high: 'border-l-orange-400',
  medium: 'border-l-yellow-400',
  low: 'border-l-blue-300',
};

export function KanbanPage() {
  const { teamUuid } = useParams<{ teamUuid: string }>();
  const [team, setTeam] = useState<Team | null>(null);
  const [tasks, setTasks] = useState<KanbanTask[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium', tags: '' });
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!teamUuid) return;
    try {
      setLoading(true);
      const [teamData, taskData, agentData] = await Promise.all([
        getTeam(teamUuid),
        listKanbanTasks(teamUuid, { limit: 100 }),
        listTeamAgents(teamUuid),
      ]);
      setTeam(teamData);
      setTasks(taskData.tasks);
      setAgents(agentData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load board');
    } finally {
      setLoading(false);
    }
  }, [teamUuid]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!teamUuid) return;
    setCreating(true);
    try {
      const tags = form.tags.split(',').map((t) => t.trim()).filter(Boolean);
      await createKanbanTask(teamUuid, {
        title: form.title,
        description: form.description || undefined,
        priority: form.priority,
        tags: tags.length > 0 ? tags : undefined,
      });
      setShowCreate(false);
      setForm({ title: '', description: '', priority: 'medium', tags: '' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task');
    } finally {
      setCreating(false);
    }
  }

  async function moveTask(taskUuid: string, newStatus: string) {
    if (!teamUuid) return;
    try {
      await updateKanbanTaskStatus(teamUuid, taskUuid, newStatus);
      setTasks((prev) => prev.map((t) => (t.taskUuid === taskUuid ? { ...t, status: newStatus } : t)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to move task');
    }
  }

  function getAgentName(agentUuid: string | null) {
    if (!agentUuid) return null;
    return agents.find((a) => a.agentUuid === agentUuid)?.name ?? 'Unknown';
  }

  const columnIdx = (status: string) => COLUMNS.findIndex((c) => c.key === status);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse h-8 w-48 rounded bg-gray-200" />
        <div className="flex gap-4">
          {COLUMNS.map((col) => (
            <div key={col.key} className="animate-pulse flex-1 h-64 rounded-xl bg-gray-100" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to={`/teams/${teamUuid}`} className="text-gray-400 hover:text-gray-600 text-sm">&larr; {team?.name ?? 'Team'}</Link>
          <h1 className="text-xl font-bold text-gray-900">Kanban Board</h1>
          <span className="text-sm text-gray-400">{tasks.length} tasks</span>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 transition-colors"
        >
          {showCreate ? 'Cancel' : '+ New Task'}
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>
      )}

      {showCreate && (
        <form onSubmit={handleCreate} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-3">
          <input
            type="text"
            required
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Task title"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
          />
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Description (optional)"
            rows={2}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
          />
          <div className="flex gap-3">
            <select
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value })}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 outline-none"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
            <input
              type="text"
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
              placeholder="Tags (comma-separated)"
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 outline-none"
            />
            <button
              type="submit"
              disabled={creating}
              className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Add Task'}
            </button>
          </div>
        </form>
      )}

      {/* Board */}
      <div className="flex gap-3 overflow-x-auto pb-4">
        {COLUMNS.map((col) => {
          const colTasks = tasks.filter((t) => t.status === col.key);
          return (
            <div key={col.key} className="flex-shrink-0 w-64 flex flex-col">
              <div className="flex items-center gap-2 px-2 py-2 mb-2">
                <div className={`h-2.5 w-2.5 rounded-full ${col.color}`} />
                <span className="text-sm font-semibold text-gray-700">{col.label}</span>
                <span className="ml-auto rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                  {colTasks.length}
                </span>
              </div>
              <div className="flex-1 space-y-2 min-h-[200px] rounded-xl bg-gray-50/80 p-2">
                {colTasks.map((task) => (
                  <div
                    key={task.taskUuid}
                    className={`rounded-lg border-l-4 ${PRIORITY_COLORS[task.priority] ?? 'border-l-gray-300'} bg-white border border-gray-200 p-3 shadow-sm hover:shadow-md transition-shadow`}
                  >
                    <h4 className="text-sm font-medium text-gray-900 mb-1">{task.title}</h4>
                    {task.description && (
                      <p className="text-xs text-gray-500 mb-2 line-clamp-2">{task.description}</p>
                    )}
                    <div className="flex flex-wrap gap-1 mb-2">
                      {task.tags.map((tag) => (
                        <span key={tag} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">{tag}</span>
                      ))}
                    </div>
                    {task.assignedAgentUuid && (
                      <div className="text-xs text-brand-600 mb-2">
                        Assigned: {getAgentName(task.assignedAgentUuid)}
                      </div>
                    )}
                    {/* Move buttons */}
                    <div className="flex gap-1 mt-1">
                      {columnIdx(task.status) > 0 && (() => {
                        const prevCol = COLUMNS[columnIdx(task.status) - 1]!;
                        return (
                          <button
                            onClick={() => moveTask(task.taskUuid, prevCol.key)}
                            className="rounded px-1.5 py-0.5 text-[10px] text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                            title={`Move to ${prevCol.label}`}
                          >
                            &larr;
                          </button>
                        );
                      })()}
                      {columnIdx(task.status) < COLUMNS.length - 1 && (() => {
                        const nextCol = COLUMNS[columnIdx(task.status) + 1]!;
                        return (
                          <button
                            onClick={() => moveTask(task.taskUuid, nextCol.key)}
                            className="rounded px-1.5 py-0.5 text-[10px] text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                            title={`Move to ${nextCol.label}`}
                          >
                            &rarr;
                          </button>
                        );
                      })()}
                    </div>
                  </div>
                ))}
                {colTasks.length === 0 && (
                  <div className="flex items-center justify-center h-20 text-xs text-gray-400">No tasks</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
