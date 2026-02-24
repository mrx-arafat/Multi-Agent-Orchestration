import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useDroppable } from '@dnd-kit/core';
import {
  listKanbanTasks,
  createKanbanTask,
  updateKanbanTaskStatus,
  updateKanbanTask,
  deleteKanbanTask,
  listTeamAgents,
  getTeam,
  type KanbanTask,
  type Agent,
  type Team,
} from '../lib/api.js';
import { useToast } from '../components/Toast.js';
import { ConfirmDialog } from '../components/ConfirmDialog.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const COLUMNS = [
  { key: 'backlog', label: 'Backlog', color: 'bg-slate-400', headerBg: 'bg-slate-50', ring: 'ring-slate-200', icon: 'M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4' },
  { key: 'todo', label: 'To Do', color: 'bg-blue-400', headerBg: 'bg-blue-50', ring: 'ring-blue-200', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
  { key: 'in_progress', label: 'In Progress', color: 'bg-amber-400', headerBg: 'bg-amber-50', ring: 'ring-amber-200', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
  { key: 'review', label: 'Review', color: 'bg-purple-400', headerBg: 'bg-purple-50', ring: 'ring-purple-200', icon: 'M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z' },
  { key: 'done', label: 'Done', color: 'bg-emerald-400', headerBg: 'bg-emerald-50', ring: 'ring-emerald-200', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
] as const;

const PRIORITY_STYLES: Record<string, { border: string; badge: string; label: string; dot: string }> = {
  critical: { border: 'border-l-red-500', badge: 'bg-red-100 text-red-700', label: 'Critical', dot: 'bg-red-500' },
  high: { border: 'border-l-orange-400', badge: 'bg-orange-100 text-orange-700', label: 'High', dot: 'bg-orange-400' },
  medium: { border: 'border-l-yellow-400', badge: 'bg-yellow-100 text-yellow-700', label: 'Medium', dot: 'bg-yellow-400' },
  low: { border: 'border-l-blue-300', badge: 'bg-blue-100 text-blue-700', label: 'Low', dot: 'bg-blue-300' },
};

const PRIORITIES = ['critical', 'high', 'medium', 'low'] as const;

// ─── Helpers ────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

// ─── Task Card ──────────────────────────────────────────────────────────────

function TaskCard({
  task,
  agents,
  isDragging,
  onClick,
}: {
  task: KanbanTask;
  agents: Agent[];
  isDragging?: boolean;
  onClick?: () => void;
}) {
  const priority = PRIORITY_STYLES[task.priority] ?? PRIORITY_STYLES.medium!;
  const assignedAgent = task.assignedAgentUuid ? agents.find((a) => a.agentUuid === task.assignedAgentUuid) : null;
  const hasProgress = task.progressCurrent !== null && task.progressTotal !== null && task.progressTotal > 0;
  const progressPct = hasProgress ? Math.round(((task.progressCurrent ?? 0) / (task.progressTotal ?? 1)) * 100) : 0;
  const hasDeps = task.dependsOn && task.dependsOn.length > 0;

  return (
    <div
      onClick={onClick}
      className={`group rounded-lg border-l-4 ${priority.border} bg-white border border-gray-200 p-3 shadow-sm transition-all cursor-pointer ${
        isDragging ? 'shadow-xl ring-2 ring-brand-300 opacity-90 rotate-1 scale-105' : 'hover:shadow-md hover:border-gray-300'
      }`}
    >
      {/* Header: priority + title */}
      <div className="flex items-start justify-between gap-2 mb-1">
        <h4 className="text-sm font-semibold text-gray-900 leading-snug line-clamp-2 group-hover:text-brand-700 transition-colors">
          {task.title}
        </h4>
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${priority.badge}`}>
          {priority.label}
        </span>
      </div>

      {/* Description */}
      {task.description && (
        <p className="text-xs text-gray-500 mb-2 line-clamp-2 leading-relaxed">{task.description}</p>
      )}

      {/* Progress bar */}
      {hasProgress && (
        <div className="mb-2">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[10px] text-gray-400 font-medium">
              {task.progressMessage ?? `${task.progressCurrent}/${task.progressTotal}`}
            </span>
            <span className="text-[10px] font-bold text-gray-500">{progressPct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-brand-500 transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Tags */}
      {task.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {task.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
              {tag}
            </span>
          ))}
          {task.tags.length > 3 && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-400">
              +{task.tags.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Footer: agent, deps, timestamp */}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-50">
        <div className="flex items-center gap-2">
          {assignedAgent ? (
            <div className="flex items-center gap-1.5">
              <div className={`h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white ${
                assignedAgent.status === 'online' ? 'bg-emerald-500' : 'bg-gray-400'
              }`}>
                {assignedAgent.name.charAt(0).toUpperCase()}
              </div>
              <span className="text-[11px] text-gray-500 max-w-[80px] truncate">{assignedAgent.name}</span>
            </div>
          ) : (
            <span className="text-[10px] text-gray-300 italic">Unassigned</span>
          )}

          {hasDeps && (
            <span className="flex items-center gap-0.5 rounded bg-purple-50 px-1.5 py-0.5 text-[9px] font-medium text-purple-600" title="Has dependencies">
              <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.102 1.101" />
              </svg>
              {task.dependsOn.length}
            </span>
          )}

          {task.lastError && (
            <span className="flex items-center rounded bg-red-50 px-1.5 py-0.5 text-[9px] font-medium text-red-600" title={task.lastError}>
              <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </span>
          )}
        </div>

        <span className="text-[10px] text-gray-300">{timeAgo(task.updatedAt)}</span>
      </div>
    </div>
  );
}

// ─── Sortable Wrapper ───────────────────────────────────────────────────────

function SortableTaskCard({ task, agents, onClick }: { task: KanbanTask; agents: Agent[]; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.taskUuid });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
      <TaskCard task={task} agents={agents} onClick={onClick} />
    </div>
  );
}

// ─── Droppable Column ───────────────────────────────────────────────────────

function KanbanColumn({
  column,
  tasks,
  agents,
  onTaskClick,
}: {
  column: typeof COLUMNS[number];
  tasks: KanbanTask[];
  agents: Agent[];
  onTaskClick: (task: KanbanTask) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.key });

  return (
    <div className="flex-shrink-0 w-[280px] flex flex-col max-h-[calc(100vh-220px)]">
      {/* Column header */}
      <div className={`flex items-center gap-2 px-3 py-2.5 mb-2 rounded-lg ${column.headerBg}`}>
        <svg className="h-4 w-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d={column.icon} />
        </svg>
        <span className="text-sm font-bold text-gray-700">{column.label}</span>
        <span className="ml-auto rounded-full bg-white/80 px-2 py-0.5 text-xs font-bold text-gray-500 shadow-sm min-w-[24px] text-center">
          {tasks.length}
        </span>
      </div>

      {/* Column body */}
      <div
        ref={setNodeRef}
        className={`flex-1 space-y-2 min-h-[120px] rounded-xl p-2 transition-all overflow-y-auto ${
          isOver ? 'bg-brand-50 ring-2 ring-brand-200 shadow-inner' : 'bg-gray-50/60'
        }`}
      >
        <SortableContext items={tasks.map((t) => t.taskUuid)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <SortableTaskCard key={task.taskUuid} task={task} agents={agents} onClick={() => onTaskClick(task)} />
          ))}
        </SortableContext>
        {tasks.length === 0 && (
          <div className={`flex flex-col items-center justify-center h-28 rounded-lg border-2 border-dashed transition-all ${
            isOver ? 'border-brand-300 bg-brand-50/50 scale-[1.02]' : 'border-gray-200'
          }`}>
            <svg className="h-6 w-6 text-gray-300 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d={column.icon} />
            </svg>
            <span className="text-xs text-gray-400">{isOver ? 'Drop here' : 'No tasks'}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Create Task Modal ──────────────────────────────────────────────────────

function CreateTaskModal({
  agents,
  onClose,
  onCreated,
}: {
  agents: Agent[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    title: '',
    description: '',
    priority: 'medium',
    assignedAgentUuid: '',
    status: 'backlog',
  });
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const { teamUuid } = useParams<{ teamUuid: string }>();

  useEffect(() => { titleRef.current?.focus(); }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  function handleTagKeyDown(e: React.KeyboardEvent) {
    if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
      e.preventDefault();
      const tag = tagInput.trim().replace(/,$/, '');
      if (tag && !tags.includes(tag)) {
        setTags([...tags, tag]);
      }
      setTagInput('');
    }
    if (e.key === 'Backspace' && !tagInput && tags.length > 0) {
      setTags(tags.slice(0, -1));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!teamUuid || !form.title.trim()) return;
    setCreating(true);
    try {
      await createKanbanTask(teamUuid, {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        priority: form.priority,
        tags: tags.length > 0 ? tags : undefined,
        assignedAgentUuid: form.assignedAgentUuid || undefined,
      });
      toast('Task created successfully', 'success');
      onCreated();
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to create task', 'error');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white shadow-2xl mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
          <h2 className="text-lg font-bold text-gray-900">Create New Task</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
            <input
              ref={titleRef}
              type="text"
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="What needs to be done?"
              className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none transition-all"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Add details, context, or acceptance criteria..."
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none transition-all resize-none"
            />
          </div>

          {/* Priority + Agent (side by side) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <select
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm focus:border-brand-500 outline-none bg-white"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>{PRIORITY_STYLES[p]!.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Assign Agent</label>
              <select
                value={form.assignedAgentUuid}
                onChange={(e) => setForm({ ...form, assignedAgentUuid: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm focus:border-brand-500 outline-none bg-white"
              >
                <option value="">Unassigned</option>
                {agents.map((a) => (
                  <option key={a.agentUuid} value={a.agentUuid}>{a.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tags</label>
            <div className="flex flex-wrap gap-1.5 rounded-lg border border-gray-300 px-3 py-2 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20 transition-all min-h-[42px]">
              {tags.map((tag) => (
                <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-brand-50 text-brand-700 px-2.5 py-0.5 text-xs font-medium">
                  {tag}
                  <button
                    type="button"
                    onClick={() => setTags(tags.filter((t) => t !== tag))}
                    className="text-brand-400 hover:text-brand-600 ml-0.5"
                  >
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              ))}
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                placeholder={tags.length === 0 ? 'Type and press Enter to add tags' : 'Add more...'}
                className="flex-1 min-w-[100px] text-sm outline-none bg-transparent py-0.5"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating || !form.title.trim()}
              className="rounded-lg bg-gradient-to-r from-brand-500 to-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:from-brand-600 hover:to-brand-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all"
            >
              {creating ? (
                <span className="flex items-center gap-2">
                  <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Creating...
                </span>
              ) : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Task Detail Drawer ─────────────────────────────────────────────────────

function TaskDetailDrawer({
  task,
  agents,
  allTasks,
  onClose,
  onUpdated,
  onDeleted,
}: {
  task: KanbanTask;
  agents: Agent[];
  allTasks: KanbanTask[];
  onClose: () => void;
  onUpdated: () => void;
  onDeleted: () => void;
}) {
  const { toast } = useToast();
  const { teamUuid } = useParams<{ teamUuid: string }>();
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? '');
  const [priority, setPriority] = useState(task.priority);
  const [assignedAgent, setAssignedAgent] = useState(task.assignedAgentUuid ?? '');
  const [saving, setSaving] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>(task.tags);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  async function saveField(field: string, value: unknown) {
    if (!teamUuid) return;
    setSaving(true);
    try {
      await updateKanbanTask(teamUuid, task.taskUuid, { [field]: value });
      onUpdated();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to update', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!teamUuid) return;
    try {
      await deleteKanbanTask(teamUuid, task.taskUuid);
      toast('Task deleted', 'success');
      onDeleted();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to delete', 'error');
    }
  }

  function handleTagKeyDown(e: React.KeyboardEvent) {
    if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
      e.preventDefault();
      const tag = tagInput.trim().replace(/,$/, '');
      if (tag && !tags.includes(tag)) {
        const updated = [...tags, tag];
        setTags(updated);
        saveField('tags', updated);
      }
      setTagInput('');
    }
    if (e.key === 'Backspace' && !tagInput && tags.length > 0) {
      const updated = tags.slice(0, -1);
      setTags(updated);
      saveField('tags', updated);
    }
  }

  function removeTag(tag: string) {
    const updated = tags.filter((t) => t !== tag);
    setTags(updated);
    saveField('tags', updated);
  }

  const depTasks = task.dependsOn
    .map((uuid) => allTasks.find((t) => t.taskUuid === uuid))
    .filter(Boolean) as KanbanTask[];
  const assignedAgentObj = task.assignedAgentUuid ? agents.find((a) => a.agentUuid === task.assignedAgentUuid) : null;
  const hasProgress = task.progressCurrent !== null && task.progressTotal !== null && task.progressTotal > 0;
  const progressPct = hasProgress ? Math.round(((task.progressCurrent ?? 0) / (task.progressTotal ?? 1)) * 100) : 0;
  const statusCol = COLUMNS.find((c) => c.key === task.status);
  const pri = PRIORITY_STYLES[task.priority] ?? PRIORITY_STYLES.medium!;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-white shadow-2xl border-l border-gray-200 flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50 shrink-0">
          <div className="flex items-center gap-2">
            {statusCol && (
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${statusCol.headerBg} text-gray-700`}>
                <span className={`h-2 w-2 rounded-full ${statusCol.color}`} />
                {statusCol.label}
              </span>
            )}
            {saving && (
              <span className="flex items-center gap-1 text-xs text-gray-400">
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-gray-300 border-t-brand-500" />
                Saving
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowDelete(true)}
              className="rounded-lg p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
              title="Delete task"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
            <button onClick={onClose} className="rounded-lg p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Title (click to edit) */}
          {editingTitle ? (
            <input
              ref={titleInputRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => {
                setEditingTitle(false);
                if (title.trim() && title !== task.title) saveField('title', title.trim());
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') { setTitle(task.title); setEditingTitle(false); }
              }}
              className="w-full text-xl font-bold text-gray-900 border-b-2 border-brand-500 outline-none pb-1 bg-transparent"
              autoFocus
            />
          ) : (
            <h2
              onClick={() => { setEditingTitle(true); setTimeout(() => titleInputRef.current?.focus(), 0); }}
              className="text-xl font-bold text-gray-900 cursor-text hover:bg-gray-50 rounded px-1 -mx-1 py-0.5 transition-colors"
            >
              {task.title}
            </h2>
          )}

          {/* Description (click to edit) */}
          <div>
            <label className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1 block">Description</label>
            {editingDesc ? (
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={() => {
                  setEditingDesc(false);
                  const val = description.trim() || null;
                  if (val !== (task.description ?? '')) saveField('description', val);
                }}
                rows={4}
                className="w-full rounded-lg border border-brand-300 px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500/20 outline-none resize-none"
                autoFocus
              />
            ) : (
              <div
                onClick={() => setEditingDesc(true)}
                className="text-sm text-gray-600 cursor-text hover:bg-gray-50 rounded-lg px-3 py-2 -mx-1 transition-colors min-h-[60px] border border-transparent hover:border-gray-200"
              >
                {task.description || <span className="text-gray-300 italic">Click to add description...</span>}
              </div>
            )}
          </div>

          {/* Properties grid */}
          <div className="grid grid-cols-2 gap-4">
            {/* Priority */}
            <div>
              <label className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1.5 block">Priority</label>
              <select
                value={priority}
                onChange={(e) => {
                  setPriority(e.target.value);
                  saveField('priority', e.target.value);
                }}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand-500 outline-none bg-white"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>{PRIORITY_STYLES[p]!.label}</option>
                ))}
              </select>
            </div>

            {/* Assigned Agent */}
            <div>
              <label className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1.5 block">Assigned Agent</label>
              <select
                value={assignedAgent}
                onChange={(e) => {
                  const val = e.target.value || null;
                  setAssignedAgent(e.target.value);
                  saveField('assignedAgentUuid', val);
                }}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand-500 outline-none bg-white"
              >
                <option value="">Unassigned</option>
                {agents.map((a) => (
                  <option key={a.agentUuid} value={a.agentUuid}>{a.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1.5 block">Tags</label>
            <div className="flex flex-wrap gap-1.5 rounded-lg border border-gray-200 px-3 py-2 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20 transition-all min-h-[38px]">
              {tags.map((tag) => (
                <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-brand-50 text-brand-700 px-2.5 py-0.5 text-xs font-medium">
                  {tag}
                  <button type="button" onClick={() => removeTag(tag)} className="text-brand-400 hover:text-brand-600">
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              ))}
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                placeholder={tags.length === 0 ? 'Press Enter to add' : ''}
                className="flex-1 min-w-[80px] text-sm outline-none bg-transparent py-0.5"
              />
            </div>
          </div>

          {/* Progress (if applicable) */}
          {hasProgress && (
            <div>
              <label className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1.5 block">Progress</label>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm text-gray-600">{task.progressMessage ?? 'Processing'}</span>
                  <span className="text-sm font-bold text-gray-700">{progressPct}%</span>
                </div>
                <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
                  <div className="h-full rounded-full bg-brand-500 transition-all duration-500" style={{ width: `${progressPct}%` }} />
                </div>
                <div className="text-xs text-gray-400 mt-1">{task.progressCurrent} of {task.progressTotal} completed</div>
              </div>
            </div>
          )}

          {/* Dependencies */}
          {depTasks.length > 0 && (
            <div>
              <label className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1.5 block">Dependencies ({depTasks.length})</label>
              <div className="space-y-1.5">
                {depTasks.map((dep) => {
                  const depStatus = COLUMNS.find((c) => c.key === dep.status);
                  return (
                    <div key={dep.taskUuid} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                      <span className={`h-2 w-2 rounded-full shrink-0 ${depStatus?.color ?? 'bg-gray-300'}`} />
                      <span className="text-sm text-gray-700 truncate">{dep.title}</span>
                      <span className="ml-auto text-xs text-gray-400 shrink-0">{depStatus?.label ?? dep.status}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Error info */}
          {task.lastError && (
            <div>
              <label className="text-xs font-medium text-red-400 uppercase tracking-wider mb-1.5 block">Last Error</label>
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                {task.lastError}
                {task.maxRetries > 0 && (
                  <div className="text-xs text-red-500 mt-1">Retry {task.retryCount} of {task.maxRetries}</div>
                )}
              </div>
            </div>
          )}

          {/* Output (if available) */}
          {task.output != null && (
            <div>
              <label className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1.5 block">Output</label>
              <pre className="bg-gray-900 text-gray-100 rounded-lg p-3 text-xs overflow-auto max-h-40">
                {JSON.stringify(task.output, null, 2)}
              </pre>
            </div>
          )}

          {/* Timestamps */}
          <div>
            <label className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1.5 block">Timeline</label>
            <div className="space-y-2">
              <div className="flex items-center gap-3 text-sm">
                <span className="text-gray-400 w-20 shrink-0">Created</span>
                <span className="text-gray-600">{new Date(task.createdAt).toLocaleString()}</span>
              </div>
              {task.startedAt && (
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-gray-400 w-20 shrink-0">Started</span>
                  <span className="text-gray-600">{new Date(task.startedAt).toLocaleString()}</span>
                </div>
              )}
              {task.completedAt && (
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-gray-400 w-20 shrink-0">Completed</span>
                  <span className="text-gray-600">{new Date(task.completedAt).toLocaleString()}</span>
                </div>
              )}
              <div className="flex items-center gap-3 text-sm">
                <span className="text-gray-400 w-20 shrink-0">Updated</span>
                <span className="text-gray-600">{timeAgo(task.updatedAt)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={showDelete}
        title="Delete Task"
        message={`Are you sure you want to delete "${task.title}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setShowDelete(false)}
      />
    </>
  );
}

// ─── Filter Bar ─────────────────────────────────────────────────────────────

function FilterBar({
  search,
  onSearch,
  priorityFilter,
  onPriorityFilter,
  agentFilter,
  onAgentFilter,
  agents,
  activeFilterCount,
  onClear,
}: {
  search: string;
  onSearch: (v: string) => void;
  priorityFilter: string;
  onPriorityFilter: (v: string) => void;
  agentFilter: string;
  onAgentFilter: (v: string) => void;
  agents: Agent[];
  activeFilterCount: number;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Search */}
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search tasks..."
          className="w-full rounded-lg border border-gray-200 pl-10 pr-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none bg-white transition-all"
        />
        {search && (
          <button
            onClick={() => onSearch('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:text-gray-600"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Priority filter */}
      <select
        value={priorityFilter}
        onChange={(e) => onPriorityFilter(e.target.value)}
        className={`rounded-lg border px-3 py-2 text-sm outline-none bg-white transition-all ${
          priorityFilter ? 'border-brand-300 text-brand-700 bg-brand-50' : 'border-gray-200 text-gray-600'
        }`}
      >
        <option value="">All Priorities</option>
        {PRIORITIES.map((p) => (
          <option key={p} value={p}>{PRIORITY_STYLES[p]!.label}</option>
        ))}
      </select>

      {/* Agent filter */}
      <select
        value={agentFilter}
        onChange={(e) => onAgentFilter(e.target.value)}
        className={`rounded-lg border px-3 py-2 text-sm outline-none bg-white transition-all ${
          agentFilter ? 'border-brand-300 text-brand-700 bg-brand-50' : 'border-gray-200 text-gray-600'
        }`}
      >
        <option value="">All Agents</option>
        <option value="unassigned">Unassigned</option>
        {agents.map((a) => (
          <option key={a.agentUuid} value={a.agentUuid}>{a.name}</option>
        ))}
      </select>

      {/* Clear filters */}
      {activeFilterCount > 0 && (
        <button
          onClick={onClear}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-500 hover:bg-gray-50 transition-colors"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
          Clear ({activeFilterCount})
        </button>
      )}
    </div>
  );
}

// ─── Board Stats ────────────────────────────────────────────────────────────

function BoardStats({ tasks }: { tasks: KanbanTask[] }) {
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === 'done').length;
  const inProgress = tasks.filter((t) => t.status === 'in_progress').length;
  const critical = tasks.filter((t) => t.priority === 'critical' && t.status !== 'done').length;
  const completionRate = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="flex items-center gap-4 text-sm">
      <div className="flex items-center gap-1.5 bg-gray-50 rounded-lg px-3 py-1.5">
        <span className="text-gray-400 font-medium">Total</span>
        <span className="font-bold text-gray-700">{total}</span>
      </div>
      <div className="flex items-center gap-1.5 bg-amber-50 rounded-lg px-3 py-1.5">
        <span className="h-2 w-2 rounded-full bg-amber-400" />
        <span className="text-amber-600 font-medium">Active</span>
        <span className="font-bold text-amber-700">{inProgress}</span>
      </div>
      <div className="flex items-center gap-1.5 bg-emerald-50 rounded-lg px-3 py-1.5">
        <span className="h-2 w-2 rounded-full bg-emerald-400" />
        <span className="text-emerald-600 font-medium">Done</span>
        <span className="font-bold text-emerald-700">{completionRate}%</span>
      </div>
      {critical > 0 && (
        <div className="flex items-center gap-1.5 bg-red-50 rounded-lg px-3 py-1.5 animate-pulse">
          <span className="h-2 w-2 rounded-full bg-red-500" />
          <span className="text-red-600 font-medium">Critical</span>
          <span className="font-bold text-red-700">{critical}</span>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export function KanbanPage() {
  const { teamUuid } = useParams<{ teamUuid: string }>();
  const { toast } = useToast();
  const [team, setTeam] = useState<Team | null>(null);
  const [tasks, setTasks] = useState<KanbanTask[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTask, setActiveTask] = useState<KanbanTask | null>(null);
  const [detailTask, setDetailTask] = useState<KanbanTask | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [agentFilter, setAgentFilter] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const activeFilterCount = [search, priorityFilter, agentFilter].filter(Boolean).length;

  const filteredTasks = useMemo(() => {
    let result = tasks;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) => t.title.toLowerCase().includes(q) || (t.description ?? '').toLowerCase().includes(q) || t.tags.some((tag) => tag.toLowerCase().includes(q)),
      );
    }
    if (priorityFilter) {
      result = result.filter((t) => t.priority === priorityFilter);
    }
    if (agentFilter === 'unassigned') {
      result = result.filter((t) => !t.assignedAgentUuid);
    } else if (agentFilter) {
      result = result.filter((t) => t.assignedAgentUuid === agentFilter);
    }
    return result;
  }, [tasks, search, priorityFilter, agentFilter]);

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

  // Update detail task when tasks change
  useEffect(() => {
    if (detailTask) {
      const updated = tasks.find((t) => t.taskUuid === detailTask.taskUuid);
      if (updated) setDetailTask(updated);
    }
  }, [tasks, detailTask]);

  function handleDragStart(event: DragStartEvent) {
    const task = filteredTasks.find((t) => t.taskUuid === event.active.id);
    setActiveTask(task ?? null);
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeId = active.id as string;
    const overId = over.id as string;

    const overColumn = COLUMNS.find((c) => c.key === overId);
    if (overColumn) {
      setTasks((prev) => prev.map((t) => (t.taskUuid === activeId ? { ...t, status: overColumn.key } : t)));
      return;
    }

    const overTask = tasks.find((t) => t.taskUuid === overId);
    if (overTask) {
      setTasks((prev) => prev.map((t) => (t.taskUuid === activeId ? { ...t, status: overTask.status } : t)));
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveTask(null);
    const { active } = event;
    const activeId = active.id as string;
    const task = tasks.find((t) => t.taskUuid === activeId);
    if (!task || !teamUuid) return;

    setSaving(true);
    try {
      await updateKanbanTaskStatus(teamUuid, task.taskUuid, task.status);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to move task', 'error');
      await load();
    } finally {
      setSaving(false);
    }
  }

  // Loading skeleton
  if (loading) {
    return (
      <div className="space-y-5 animate-in fade-in">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="animate-pulse h-5 w-16 rounded bg-gray-200" />
            <div className="h-5 w-px bg-gray-200" />
            <div className="animate-pulse h-7 w-40 rounded bg-gray-200" />
          </div>
          <div className="animate-pulse h-10 w-28 rounded-lg bg-gray-200" />
        </div>
        <div className="animate-pulse h-10 w-full max-w-sm rounded-lg bg-gray-100" />
        <div className="flex gap-4 overflow-hidden">
          {COLUMNS.map((col) => (
            <div key={col.key} className="flex-shrink-0 w-[280px] space-y-2">
              <div className="animate-pulse h-10 rounded-lg bg-gray-100" />
              <div className="space-y-2 p-2">
                <div className="animate-pulse h-24 rounded-lg bg-gray-100" />
                <div className="animate-pulse h-20 rounded-lg bg-gray-50" />
              </div>
            </div>
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
          <Link
            to={`/teams/${teamUuid}`}
            className="flex items-center gap-1 text-gray-400 hover:text-gray-600 text-sm transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            {team?.name ?? 'Team'}
          </Link>
          <div className="h-5 w-px bg-gray-200" />
          <h1 className="text-xl font-bold text-gray-900">Kanban Board</h1>
          {saving && (
            <span className="flex items-center gap-1.5 text-xs text-gray-400 bg-gray-50 rounded-full px-3 py-1">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-gray-300 border-t-brand-500" />
              Saving...
            </span>
          )}
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-brand-500 to-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:from-brand-600 hover:to-brand-700 shadow-sm hover:shadow transition-all active:scale-[0.98]"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New Task
        </button>
      </div>

      {/* Stats bar */}
      <BoardStats tasks={tasks} />

      {/* Filter bar */}
      <FilterBar
        search={search}
        onSearch={setSearch}
        priorityFilter={priorityFilter}
        onPriorityFilter={setPriorityFilter}
        agentFilter={agentFilter}
        onAgentFilter={setAgentFilter}
        agents={agents}
        activeFilterCount={activeFilterCount}
        onClear={() => { setSearch(''); setPriorityFilter(''); setAgentFilter(''); }}
      />

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => { setError(''); load(); }} className="flex items-center gap-1 text-red-500 hover:text-red-700 text-xs font-medium">
            Retry
          </button>
        </div>
      )}

      {/* Board */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-3 overflow-x-auto pb-4">
          {COLUMNS.map((col) => {
            const colTasks = filteredTasks.filter((t) => t.status === col.key);
            return (
              <KanbanColumn
                key={col.key}
                column={col}
                tasks={colTasks}
                agents={agents}
                onTaskClick={(t) => setDetailTask(t)}
              />
            );
          })}
        </div>
        <DragOverlay>
          {activeTask && <TaskCard task={activeTask} agents={agents} isDragging />}
        </DragOverlay>
      </DndContext>

      {/* Create modal */}
      {showCreate && (
        <CreateTaskModal agents={agents} onClose={() => setShowCreate(false)} onCreated={load} />
      )}

      {/* Detail drawer */}
      {detailTask && (
        <TaskDetailDrawer
          task={detailTask}
          agents={agents}
          allTasks={tasks}
          onClose={() => setDetailTask(null)}
          onUpdated={load}
          onDeleted={() => { setDetailTask(null); load(); }}
        />
      )}
    </div>
  );
}
