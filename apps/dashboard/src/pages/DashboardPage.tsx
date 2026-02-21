import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { listAgents, listWorkflows, listTeams, type AgentListResponse, type WorkflowListResponse, type Team } from '../lib/api.js';

interface StatCardProps {
  label: string;
  value: number | string;
  sub?: string;
  color?: string;
  icon: React.ReactNode;
}

function StatCard({ label, value, sub, color = 'text-gray-900', icon }: StatCardProps){
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-sm transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
        <div className="h-8 w-8 rounded-lg bg-gray-50 flex items-center justify-center">
          {icon}
        </div>
      </div>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
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
  const inProgressWorkflows = workflowData?.runs.filter((r) => r.status === 'in_progress').length ?? 0;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Overview</h1>
          <p className="text-sm text-gray-500 mt-1">MAOF Multi-Agent Orchestration Framework</p>
        </div>
        {!loading && (
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            {onlineAgents} agent{onlineAgents !== 1 ? 's' : ''} online
          </div>
        )}
      </div>

      {error && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
          </svg>
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
              <div className="h-3 bg-gray-200 rounded w-24 mb-3" />
              <div className="h-7 bg-gray-200 rounded w-16" />
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Total Agents"
              value={totalAgents}
              sub={`${onlineAgents} online, ${totalAgents - onlineAgents} offline`}
              color="text-brand-700"
              icon={<svg className="h-4 w-4 text-brand-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" /></svg>}
            />
            <StatCard
              label="Workflow Runs"
              value={totalWorkflows}
              sub={inProgressWorkflows > 0 ? `${inProgressWorkflows} running now` : `${completedWorkflows} completed`}
              color="text-brand-700"
              icon={<svg className="h-4 w-4 text-brand-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" /></svg>}
            />
            <StatCard
              label="Success Rate"
              value={totalWorkflows > 0 ? `${Math.round((completedWorkflows / totalWorkflows) * 100)}%` : '—'}
              sub={failedWorkflows > 0 ? `${failedWorkflows} failed` : 'No failures'}
              color={failedWorkflows > 0 ? 'text-amber-600' : 'text-emerald-600'}
              icon={<svg className="h-4 w-4 text-emerald-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>}
            />
            <StatCard
              label="Teams"
              value={teams.length}
              sub={`${teams.reduce((sum, t) => sum + (t.agentCount ?? 0), 0)} total agents in teams`}
              color="text-purple-600"
              icon={<svg className="h-4 w-4 text-purple-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" /></svg>}
            />
          </div>

          {/* Quick Actions */}
          <div>
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Quick Actions</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Link
                to="/workflow-editor"
                className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 hover:border-brand-300 hover:shadow-sm transition-all group"
              >
                <div className="h-9 w-9 rounded-lg bg-brand-50 flex items-center justify-center group-hover:bg-brand-100 transition-colors">
                  <svg className="h-4.5 w-4.5 text-brand-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">New Workflow</p>
                  <p className="text-[10px] text-gray-400">Build from scratch</p>
                </div>
              </Link>
              <Link
                to="/templates"
                className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 hover:border-brand-300 hover:shadow-sm transition-all group"
              >
                <div className="h-9 w-9 rounded-lg bg-violet-50 flex items-center justify-center group-hover:bg-violet-100 transition-colors">
                  <svg className="h-4.5 w-4.5 text-violet-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Templates</p>
                  <p className="text-[10px] text-gray-400">Start from template</p>
                </div>
              </Link>
              <Link
                to="/agents"
                className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 hover:border-brand-300 hover:shadow-sm transition-all group"
              >
                <div className="h-9 w-9 rounded-lg bg-emerald-50 flex items-center justify-center group-hover:bg-emerald-100 transition-colors">
                  <svg className="h-4.5 w-4.5 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM4 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 10.374 21c-2.331 0-4.512-.645-6.374-1.766Z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Register Agent</p>
                  <p className="text-[10px] text-gray-400">Add new agent</p>
                </div>
              </Link>
              <Link
                to="/teams"
                className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 hover:border-brand-300 hover:shadow-sm transition-all group"
              >
                <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                  <svg className="h-4.5 w-4.5 text-blue-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Create Team</p>
                  <p className="text-[10px] text-gray-400">Organize agents</p>
                </div>
              </Link>
            </div>
          </div>

          {/* Your Teams */}
          {teams.length > 0 ? (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-900">Your Teams</h2>
                <Link to="/teams" className="text-xs text-brand-600 hover:text-brand-700 font-medium">View all</Link>
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
          ) : (
            <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/50 p-8 text-center">
              <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center">
                <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
                </svg>
              </div>
              <h3 className="text-sm font-medium text-gray-700 mb-1">No teams yet</h3>
              <p className="text-xs text-gray-500 mb-3">Create a team to organize your agents and start collaborating.</p>
              <Link to="/teams" className="inline-flex rounded-lg bg-brand-500 px-4 py-2 text-xs font-medium text-white hover:bg-brand-600">
                Create Your First Team
              </Link>
            </div>
          )}

          {/* Recent Workflows */}
          {workflowData && workflowData.runs.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-900">Recent Workflows</h2>
                <Link to="/workflows" className="text-xs text-brand-600 hover:text-brand-700 font-medium">View all</Link>
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
                              {run.status.replace('_', ' ')}
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
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex items-start gap-3">
              <svg className="h-5 w-5 text-red-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
              <div>
                <h3 className="text-sm font-semibold text-red-700">{failedWorkflows} Failed Workflow{failedWorkflows > 1 ? 's' : ''}</h3>
                <p className="text-xs text-red-600 mt-0.5">
                  {Math.round((failedWorkflows / totalWorkflows) * 100)}% failure rate.{' '}
                  <Link to="/workflows" className="underline hover:text-red-800">View details</Link>
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
