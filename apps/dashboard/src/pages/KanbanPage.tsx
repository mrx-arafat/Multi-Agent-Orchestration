import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  useSensor,
  useSensors,
  PointerSensor,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useDroppable } from '@dnd-kit/core';
import {
  listKanbanTasks,
  createKanbanTask,
  updateKanbanTaskStatus,
  listTeamAgents,
  getTeam,
  type KanbanTask,
  type Agent,
  type Team,
} from '../lib/api.js';
import { useToast } from '../components/Toast.js';

const COLUMNS = [
  { key: 'backlog', label: 'Backlog', color: 'bg-slate-400', headerBg: 'bg-slate-50', ring: 'ring-slate-200' },
  { key: 'todo', label: 'To Do', color: 'bg-blue-400', headerBg: 'bg-blue-50', ring: 'ring-blue-200' },
  { key: 'in_progress', label: 'In Progress', color: 'bg-amber-400', headerBg: 'bg-amber-50', ring: 'ring-amber-200' },
  { key: 'review', label: 'Review', color: 'bg-purple-400', headerBg: 'bg-purple-50', ring: 'ring-purple-200' },
  { key: 'done', label: 'Done', color: 'bg-emerald-400', headerBg: 'bg-emerald-50', ring: 'ring-emerald-200' },
];

const PRIORITY_STYLES: Record<string, { border: string; badge: string; label: string }> = {
  critical: { border: 'border-l-red-500', badge: 'bg-red-100 text-red-700', label: 'Critical' },
  high: { border: 'border-l-orange-400', badge: 'bg-orange-100 text-orange-700', label: 'High' },
  medium: { border: 'border-l-yellow-400', badge: 'bg-yellow-100 text-yellow-700', label: 'Medium' },
  low: { border: 'border-l-blue-300', badge: 'bg-blue-100 text-blue-700', label: 'Low' },
};

// ─── Sortable Task Card ────────────────────────────────────────────────────

function TaskCard({ task, agents, isDragging }: { task: KanbanTask; agents: Agent[]; isDragging?: boolean }) {
  const priority = PRIORITY_STYLES[task.priority] ?? PRIORITY_STYLES.medium!;
  const assignedAgent = task.assignedAgentUuid ? agents.find((a) => a.agentUuid === task.assignedAgentUuid) : null;

  return (
    <div
      className={`rounded-lg border-l-4 ${priority.border} bg-white border border-gray-200 p-3.5 shadow-sm transition-all ${
        isDragging ? 'shadow-xl ring-2 ring-brand-300 opacity-90 rotate-2 scale-105' : 'hover:shadow-md'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <h4 className="text-sm font-semibold text-gray-900 leading-snug">{task.title}</h4>
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${priority.badge}`}>
          {priority.label}
        </span>
      </div>
      {task.description && (
        <p className="text-xs text-gray-500 mb-2 line-clamp-2 leading-relaxed">{task.description}</p>
      )}
      {task.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {task.tags.map((tag) => (
            <span key={tag} className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">{tag}</span>
          ))}
        </div>
      )}
      {assignedAgent && (
        <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-gray-100">
          <div className={`h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white ${
            assignedAgent.status === 'online' ? 'bg-emerald-500' : 'bg-gray-400'
          }`}>
            {assignedAgent.name.charAt(0).toUpperCase()}
          </div>
          <span className="text-xs text-gray-600">{assignedAgent.name}</span>
        </div>
      )}
    </div>
  );
}

function SortableTaskCard({ task, agents }: { task: KanbanTask; agents: Agent[] }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.taskUuid });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
      <TaskCard task={task} agents={agents} />
    </div>
  );
}

// ─── Droppable Column ──────────────────────────────────────────────────────

function KanbanColumn({ column, tasks, agents }: {
  column: typeof COLUMNS[number];
  tasks: KanbanTask[];
  agents: Agent[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.key });

  return (
    <div className="flex-shrink-0 w-72 flex flex-col">
      <div className={`flex items-center gap-2.5 px-3 py-2.5 mb-2 rounded-lg ${column.headerBg}`}>
        <div className={`h-3 w-3 rounded-full ${column.color}`} />
        <span className="text-sm font-bold text-gray-700">{column.label}</span>
        <span className="ml-auto rounded-full bg-white/80 px-2.5 py-0.5 text-xs font-bold text-gray-500 shadow-sm">
          {tasks.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex-1 space-y-2.5 min-h-[300px] rounded-xl p-2.5 transition-colors ${
          isOver ? 'bg-brand-50 ring-2 ring-brand-200' : 'bg-gray-50/80'
        }`}
      >
        <SortableContext items={tasks.map((t) => t.taskUuid)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <SortableTaskCard key={task.taskUuid} task={task} agents={agents} />
          ))}
        </SortableContext>
        {tasks.length === 0 && (
          <div className={`flex items-center justify-center h-24 rounded-lg border-2 border-dashed transition-colors ${
            isOver ? 'border-brand-300 bg-brand-50/50' : 'border-gray-200'
          }`}>
            <span className="text-xs text-gray-400">{isOver ? 'Drop here' : 'No tasks'}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────

export function KanbanPage() {
  const { teamUuid } = useParams<{ teamUuid: string }>();
  const { toast } = useToast();
  const [team, setTeam] = useState<Team | null>(null);
  const [tasks, setTasks] = useState<KanbanTask[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium', tags: '' });
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTask, setActiveTask] = useState<KanbanTask | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

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

  useEffect(() => { load(); }, [load]);

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
      toast(err instanceof Error ? err.message : 'Failed to create task', 'error');
    } finally {
      setCreating(false);
    }
  }

  function handleDragStart(event: DragStartEvent) {
    const task = tasks.find((t) => t.taskUuid === event.active.id);
    setActiveTask(task ?? null);
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeId = active.id as string;
    const overId = over.id as string;

    // If dragging over a column (not another task)
    const overColumn = COLUMNS.find((c) => c.key === overId);
    if (overColumn) {
      setTasks((prev) =>
        prev.map((t) => (t.taskUuid === activeId ? { ...t, status: overColumn.key } : t)),
      );
      return;
    }

    // If dragging over another task, move to that task's column
    const overTask = tasks.find((t) => t.taskUuid === overId);
    if (overTask) {
      setTasks((prev) =>
        prev.map((t) => (t.taskUuid === activeId ? { ...t, status: overTask.status } : t)),
      );
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveTask(null);
    const { active } = event;
    const activeId = active.id as string;
    const task = tasks.find((t) => t.taskUuid === activeId);
    if (!task || !teamUuid) return;

    // Persist the status change to backend
    setSaving(true);
    try {
      await updateKanbanTaskStatus(teamUuid, task.taskUuid, task.status);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to move task', 'error');
      await load(); // revert on failure
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse h-8 w-48 rounded bg-gray-200" />
        <div className="flex gap-4">
          {COLUMNS.map((col) => (
            <div key={col.key} className="animate-pulse flex-1 h-80 rounded-xl bg-gray-100" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to={`/teams/${teamUuid}`} className="text-gray-400 hover:text-gray-600 text-sm">&larr; {team?.name ?? 'Team'}</Link>
          <div className="h-5 w-px bg-gray-200" />
          <h1 className="text-xl font-bold text-gray-900">Kanban Board</h1>
          <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">{tasks.length} tasks</span>
          {saving && (
            <span className="flex items-center gap-1.5 text-xs text-gray-400">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-gray-300 border-t-brand-500" />
              Saving...
            </span>
          )}
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="rounded-lg bg-gradient-to-r from-brand-500 to-brand-600 px-4 py-2 text-sm font-medium text-white hover:from-brand-600 hover:to-brand-700 shadow-sm transition-all"
        >
          {showCreate ? 'Cancel' : '+ New Task'}
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 flex items-center justify-between">
          {error}
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600 ml-2">&times;</button>
        </div>
      )}

      {showCreate && (
        <form onSubmit={handleCreate} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-3">
          <div className="flex gap-3">
            <input
              type="text"
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Task title"
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
              autoFocus
            />
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
          </div>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Description (optional)"
            rows={2}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
          />
          <div className="flex gap-3 items-center">
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
              className="rounded-lg bg-brand-500 px-5 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50 shadow-sm"
            >
              {creating ? 'Adding...' : 'Add Task'}
            </button>
          </div>
        </form>
      )}

      {/* Board with DnD */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-6">
          {COLUMNS.map((col) => {
            const colTasks = tasks.filter((t) => t.status === col.key);
            return <KanbanColumn key={col.key} column={col} tasks={colTasks} agents={agents} />;
          })}
        </div>
        <DragOverlay>
          {activeTask && <TaskCard task={activeTask} agents={agents} isDragging />}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
