import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { listAgents, listWorkflows, listTeams, type AgentListResponse, type WorkflowListResponse, type Team } from '../lib/api.js';

interface StatCardProps {
  label: string;
  value: number | string;
  sub?: string;
  color?: string;
}

function StatCard({ label, value, sub, color = 'text-gray-900' }: StatCardProps){
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

export function DashboardPage(){
  const [agentData, setAgentData] = useState<AgentListResponse | null>(null);
  const [workflowData, setWorkflowData] = useState<WorkflowListResponse | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [agents, workflows, teamList] = await Promise.all([
          listAgents({ limit: 100 }),
          listWorkflows({ limit: 100 }),
          listTeams(),
        ]);
        setAgentData(agents);
        setWorkflowData(workflows);
        setTeams(teamList);
      } catch {
        setError('Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    };
    void fetchData();
  }, []);

  const onlineAgents = agentData?.agents.filter((a) => a.status === 'online').length ?? 0;
  const totalAgents = agentData?.meta.total ?? 0;
  const totalWorkflows = workflowData?.meta.total ?? 0;
  const completedWorkflows = workflowData?.runs.filter((r) => r.status === 'completed').length ?? 0;
  const failedWorkflows = workflowData?.runs.filter((r) => r.status === 'failed').length ?? 0;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Overview</h1>
        <p className="text-sm text-gray-500 mt-1">MAOF Multi-Agent Orchestration Framework</p>
      </div>

      {error && (
        <div className="mb-6 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
              <div className="h-3 bg-gray-200 rounded w-24 mb-3" />
              <div className="h-8 bg-gray-200 rounded w-16" />
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatCard
              label="Total Agents"
              value={totalAgents}
              sub={`${onlineAgents} online`}
              color="text-brand-700"
            />
            <StatCard
              label="Online Agents"
              value={onlineAgents}
              sub={`${totalAgents - onlineAgents} offline`}
              color="text-green-600"
            />
            <StatCard
              label="Workflow Runs"
              value={totalWorkflows}
              sub={`${completedWorkflows} completed`}
              color="text-brand-700"
            />
            <StatCard
              label="Teams"
              value={teams.length}
              sub={`${teams.reduce((sum, t) => sum + (t.agentCount ?? 0), 0)} total agents`}
              color="text-purple-600"
            />
          </div>

          {/* Your Teams */}
          {teams.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-semibold text-gray-900">Your Teams</h2>
                <Link to="/teams" className="text-sm text-brand-600 hover:text-brand-700">View all</Link>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {teams.slice(0, 3).map((team) => (
                  <Link
                    key={team.teamUuid}
                    to={`/teams/${team.teamUuid}`}
                    className="bg-white rounded-xl border border-gray-200 p-5 hover:border-brand-300 hover:shadow-md transition-all"
                  >
                    <h3 className="text-sm font-semibold text-gray-900 mb-1">{team.name}</h3>
                    <p className="text-xs text-gray-500 mb-3 line-clamp-1">{team.description || 'No description'}</p>
                    <div className="flex gap-3">
                      <span className="text-xs text-gray-400">{team.agentCount ?? 0} agents</span>
                      <Link
                        to={`/teams/${team.teamUuid}/kanban`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs text-brand-500 hover:text-brand-700"
                      >
                        Kanban
                      </Link>
                      <Link
                        to={`/teams/${team.teamUuid}/chat`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs text-brand-500 hover:text-brand-700"
                      >
                        Chat
                      </Link>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Recent Workflows */}
          {workflowData && workflowData.runs.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-semibold text-gray-900">Recent Workflows</h2>
                <Link to="/workflows" className="text-sm text-brand-600 hover:text-brand-700">View all</Link>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/50">
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Workflow</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Status</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Started</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {workflowData.runs.slice(0, 5).map((run) => {
                      const statusColors: Record<string, string> = {
                        completed: 'bg-green-100 text-green-700',
                        failed: 'bg-red-100 text-red-700',
                        in_progress: 'bg-yellow-100 text-yellow-700',
                        queued: 'bg-blue-100 text-blue-700',
                      };
                      return (
                        <tr key={run.workflowRunId} className="hover:bg-gray-50/50">
                          <td className="px-4 py-2.5 text-sm text-gray-900">{run.workflowName}</td>
                          <td className="px-4 py-2.5">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[run.status] ?? 'bg-gray-100 text-gray-500'}`}>
                              {run.status}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-gray-500">{new Date(run.createdAt).toLocaleString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Failed Workflows Callout */}
          {failedWorkflows > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 mb-8">
              <h3 className="text-sm font-semibold text-red-700">{failedWorkflows} Failed Workflow{failedWorkflows > 1 ? 's' : ''}</h3>
              <p className="text-xs text-red-600 mt-1">
                {Math.round((failedWorkflows / totalWorkflows) * 100)}% failure rate. Check the Workflows tab for details.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
