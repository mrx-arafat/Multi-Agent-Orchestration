/**
 * Analytics page — team-scoped metrics dashboard with charts.
 * Shows task completion, agent utilization, workflow success, and time-series data.
 */
import { useState, useEffect } from 'react';
import {
  listTeams,
  getTaskAnalytics,
  getAgentAnalytics,
  getWorkflowAnalytics,
  getTimeSeriesAnalytics,
  getOverviewAnalytics,
  type Team,
  type TaskCompletionMetrics,
  type AgentUtilization,
  type WorkflowMetrics,
  type TimeSeriesPoint,
  type OverviewStats,
} from '../lib/api.js';

// ── Simple Bar Chart Component ────────────────────────────────────────

function BarChart({ data, maxValue }: { data: { label: string; value: number; color: string }[]; maxValue?: number }) {
  const max = maxValue ?? Math.max(...data.map(d => d.value), 1);
  return (
    <div className="space-y-2">
      {data.map((item) => (
        <div key={item.label} className="flex items-center gap-3">
          <span className="text-xs text-gray-500 w-24 text-right truncate">{item.label}</span>
          <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.max(2, (item.value / max) * 100)}%`,
                backgroundColor: item.color,
              }}
            />
          </div>
          <span className="text-xs font-medium text-gray-700 w-10">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Mini Sparkline ────────────────────────────────────────────────────

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length === 0) return null;
  const max = Math.max(...values, 1);
  const width = 200;
  const height = 40;
  const points = values.map((v, i) => {
    const x = (i / Math.max(values.length - 1, 1)) * width;
    const y = height - (v / max) * (height - 4);
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ── Stat Card ──────────────────────────────────────────────────────────

function StatCard({ label, value, subtitle, color }: {
  label: string; value: string | number; subtitle?: string; color: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</p>
      <p className="mt-1.5 text-2xl font-bold" style={{ color }}>{value}</p>
      {subtitle && <p className="mt-0.5 text-xs text-gray-400">{subtitle}</p>}
    </div>
  );
}

// ── Main Analytics Page ───────────────────────────────────────────────

export function AnalyticsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [taskMetrics, setTaskMetrics] = useState<TaskCompletionMetrics | null>(null);
  const [agentUtils, setAgentUtils] = useState<AgentUtilization[]>([]);
  const [wfMetrics, setWfMetrics] = useState<WorkflowMetrics | null>(null);
  const [timeSeries, setTimeSeries] = useState<TimeSeriesPoint[]>([]);
  const [overview, setOverview] = useState<OverviewStats | null>(null);

  // Load teams
  useEffect(() => {
    listTeams()
      .then((t) => {
        setTeams(t);
        if (t.length > 0) setSelectedTeam(t[0]!.teamUuid);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load teams');
      })
      .finally(() => setLoading(false));
  }, []);

  // Load analytics when team changes
  useEffect(() => {
    if (!selectedTeam) return;
    setLoading(true);
    setError('');

    Promise.all([
      getTaskAnalytics(selectedTeam).catch(() => null),
      getAgentAnalytics(selectedTeam).catch(() => []),
      getWorkflowAnalytics().catch(() => null),
      getTimeSeriesAnalytics(selectedTeam, 30).catch(() => []),
      getOverviewAnalytics(selectedTeam).catch(() => null),
    ]).then(([tasks, agents, workflows, ts, ov]) => {
      setTaskMetrics(tasks);
      setAgentUtils(agents as AgentUtilization[]);
      setWfMetrics(workflows);
      setTimeSeries(ts as TimeSeriesPoint[]);
      setOverview(ov);
      // Show warning if all analytics failed
      if (!tasks && (agents as AgentUtilization[]).length === 0 && !workflows && (ts as TimeSeriesPoint[]).length === 0 && !ov) {
        setError('Unable to load analytics data. The analytics endpoints may not be available yet.');
      }
    }).finally(() => setLoading(false));
  }, [selectedTeam]);

  if (loading && teams.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500" />
      </div>
    );
  }

  if (teams.length === 0) {
    return (
      <div className="text-center py-16">
        <h2 className="text-lg font-semibold text-gray-900">No Teams Yet</h2>
        <p className="mt-1 text-sm text-gray-500">Create a team to see analytics data.</p>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    backlog: '#94a3b8', todo: '#60a5fa', in_progress: '#f59e0b',
    review: '#a78bfa', done: '#22c55e',
  };

  const priorityColors: Record<string, string> = {
    low: '#94a3b8', medium: '#60a5fa', high: '#f59e0b', critical: '#ef4444',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
          <p className="text-sm text-gray-500">Team performance metrics and insights</p>
        </div>
        <select
          value={selectedTeam}
          onChange={(e) => setSelectedTeam(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
        >
          {teams.map((t) => (
            <option key={t.teamUuid} value={t.teamUuid}>{t.name}</option>
          ))}
        </select>
      </div>

      {error && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-sm text-amber-700 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-amber-400 hover:text-amber-600 ml-2 text-lg">&times;</button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-500" />
        </div>
      ) : (
        <>
          {/* Overview Stats */}
          {overview && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Total Agents" value={overview.totalAgents} subtitle={`${overview.onlineAgents} online`} color="#6366f1" />
              <StatCard label="Total Tasks" value={overview.totalTasks} subtitle={`${overview.activeTasks} active`} color="#f59e0b" />
              <StatCard label="Completed Tasks" value={overview.completedTasks} subtitle={`${taskMetrics?.completionRate ?? 0}% rate`} color="#22c55e" />
              <StatCard label="Workflows" value={overview.totalWorkflows} subtitle={`${wfMetrics?.successRate ?? 0}% success`} color="#8b5cf6" />
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Task Status Distribution */}
            {taskMetrics && (
              <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-900 mb-4">Task Distribution by Status</h3>
                <BarChart
                  data={Object.entries(taskMetrics.byStatus).map(([status, count]) => ({
                    label: status.replace('_', ' '),
                    value: count,
                    color: statusColors[status] ?? '#94a3b8',
                  }))}
                />
                {taskMetrics.avgCompletionTimeMs && (
                  <p className="mt-3 text-xs text-gray-400">
                    Avg completion: {Math.round(taskMetrics.avgCompletionTimeMs / 1000)}s
                  </p>
                )}
              </div>
            )}

            {/* Task Priority Breakdown */}
            {taskMetrics && (
              <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-900 mb-4">Tasks by Priority</h3>
                <BarChart
                  data={Object.entries(taskMetrics.byPriority).map(([priority, data]) => ({
                    label: priority,
                    value: data.total,
                    color: priorityColors[priority] ?? '#94a3b8',
                  }))}
                />
                <div className="mt-3 flex gap-4">
                  {Object.entries(taskMetrics.byPriority).map(([priority, data]) => (
                    <span key={priority} className="text-xs text-gray-400">
                      {priority}: {data.completed}/{data.total} done
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Workflow Metrics */}
            {wfMetrics && (
              <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-900 mb-4">Workflow Performance</h3>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <p className="text-xs text-gray-500">Success Rate</p>
                    <p className="text-xl font-bold text-green-600">{wfMetrics.successRate}%</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Avg Duration</p>
                    <p className="text-xl font-bold text-blue-600">
                      {wfMetrics.avgDurationMs ? `${Math.round(wfMetrics.avgDurationMs / 1000)}s` : 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Total Runs</p>
                    <p className="text-xl font-bold text-gray-900">{wfMetrics.total}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Avg Stages</p>
                    <p className="text-xl font-bold text-purple-600">
                      {wfMetrics.avgStagesPerWorkflow ?? 'N/A'}
                    </p>
                  </div>
                </div>
                <BarChart
                  data={Object.entries(wfMetrics.byStatus).map(([status, count]) => ({
                    label: status.replace('_', ' '),
                    value: count,
                    color: status === 'completed' ? '#22c55e' : status === 'failed' ? '#ef4444' : status === 'in_progress' ? '#f59e0b' : '#94a3b8',
                  }))}
                />
              </div>
            )}

            {/* Agent Utilization */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Agent Utilization</h3>
              {agentUtils.length === 0 ? (
                <p className="text-sm text-gray-400">No agents in this team</p>
              ) : (
                <div className="space-y-3">
                  {agentUtils.map((agent) => (
                    <div key={agent.agentUuid} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <span className={`h-2 w-2 rounded-full ${agent.status === 'online' ? 'bg-green-500' : agent.status === 'degraded' ? 'bg-yellow-500' : 'bg-gray-300'}`} />
                        <div>
                          <p className="text-sm font-medium text-gray-900">{agent.name}</p>
                          <p className="text-xs text-gray-400">{agent.agentId}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-gray-900">{agent.utilizationRate}%</p>
                        <p className="text-xs text-gray-400">
                          {agent.tasksCompleted}/{agent.tasksAssigned} tasks
                          {agent.avgExecutionTimeMs && ` | ${Math.round(agent.avgExecutionTimeMs / 1000)}s avg`}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Time-Series Activity */}
          {timeSeries.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">30-Day Activity Trends</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <p className="text-xs text-gray-500 mb-2">Tasks Created</p>
                  <Sparkline values={timeSeries.map(p => p.tasksCreated)} color="#6366f1" />
                  <p className="text-xs text-gray-400 mt-1">
                    Total: {timeSeries.reduce((s, p) => s + p.tasksCreated, 0)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-2">Tasks Completed</p>
                  <Sparkline values={timeSeries.map(p => p.tasksCompleted)} color="#22c55e" />
                  <p className="text-xs text-gray-400 mt-1">
                    Total: {timeSeries.reduce((s, p) => s + p.tasksCompleted, 0)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-2">Workflows</p>
                  <Sparkline values={timeSeries.map(p => p.workflowsCompleted + p.workflowsFailed)} color="#8b5cf6" />
                  <p className="text-xs text-gray-400 mt-1">
                    {timeSeries.reduce((s, p) => s + p.workflowsCompleted, 0)} completed,{' '}
                    {timeSeries.reduce((s, p) => s + p.workflowsFailed, 0)} failed
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
