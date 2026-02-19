import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  getTeam,
  listTeamAgents,
  listAgents,
  addAgentToTeam,
  removeAgentFromTeam,
  type Team,
  type Agent,
} from '../lib/api';
import { useAuth } from '../lib/auth-context';

export function TeamDetailPage() {
  const { teamUuid } = useParams<{ teamUuid: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [team, setTeam] = useState<Team | null>(null);
  const [teamAgents, setTeamAgents] = useState<Agent[]>([]);
  const [allAgents, setAllAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddAgent, setShowAddAgent] = useState(false);
  const [tab, setTab] = useState<'agents' | 'settings'>('agents');

  const isOwner = team?.ownerUserUuid === user?.userUuid;

  const load = useCallback(async () => {
    if (!teamUuid) return;
    try {
      setLoading(true);
      const [t, agents] = await Promise.all([getTeam(teamUuid), listTeamAgents(teamUuid)]);
      setTeam(t);
      setTeamAgents(agents);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load team');
    } finally {
      setLoading(false);
    }
  }, [teamUuid]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleShowAdd() {
    setShowAddAgent(true);
    try {
      const res = await listAgents({ limit: 100 });
      const teamAgentIds = new Set(teamAgents.map((a) => a.agentUuid));
      setAllAgents(res.agents.filter((a) => !teamAgentIds.has(a.agentUuid)));
    } catch {
      setAllAgents([]);
    }
  }

  async function handleAddAgent(agentUuid: string) {
    if (!teamUuid) return;
    try {
      await addAgentToTeam(teamUuid, agentUuid);
      setShowAddAgent(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add agent');
    }
  }

  async function handleRemoveAgent(agentUuid: string) {
    if (!teamUuid) return;
    try {
      await removeAgentFromTeam(teamUuid, agentUuid);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove agent');
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse h-8 w-48 rounded bg-gray-200" />
        <div className="animate-pulse h-4 w-72 rounded bg-gray-100" />
        <div className="animate-pulse h-64 rounded-xl bg-gray-100" />
      </div>
    );
  }

  if (!team) {
    return <div className="text-center py-12 text-gray-500">Team not found</div>;
  }

  const statusColor: Record<string, string> = {
    online: 'bg-green-100 text-green-700',
    degraded: 'bg-yellow-100 text-yellow-700',
    offline: 'bg-gray-100 text-gray-500',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/teams')} className="text-gray-400 hover:text-gray-600 text-sm">&larr; Teams</button>
            <h1 className="text-2xl font-bold text-gray-900">{team.name}</h1>
            {isOwner && <span className="rounded-full bg-brand-100 text-brand-700 px-2 py-0.5 text-xs font-medium">Owner</span>}
          </div>
          <p className="mt-1 text-sm text-gray-500">{team.description || 'No description'}</p>
        </div>
        <div className="flex gap-2">
          <Link
            to={`/teams/${teamUuid}/kanban`}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Kanban Board
          </Link>
          <Link
            to={`/teams/${teamUuid}/chat`}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Team Chat
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          <button
            onClick={() => setTab('agents')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${tab === 'agents' ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            Agents ({teamAgents.length})
          </button>
          <button
            onClick={() => setTab('settings')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${tab === 'settings' ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            Settings
          </button>
        </nav>
      </div>

      {/* Agents Tab */}
      {tab === 'agents' && (
        <div className="space-y-4">
          {isOwner && (
            <button
              onClick={handleShowAdd}
              className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 transition-colors"
            >
              + Add Agent
            </button>
          )}

          {showAddAgent && (
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Select an agent to add</h3>
              {allAgents.length === 0 ? (
                <p className="text-sm text-gray-500">No available agents to add.</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {allAgents.map((agent) => (
                    <button
                      key={agent.agentUuid}
                      onClick={() => handleAddAgent(agent.agentUuid)}
                      className="flex items-center gap-3 rounded-lg border border-gray-200 p-3 hover:border-brand-300 hover:bg-brand-50 transition-all text-left"
                    >
                      <div className={`h-2.5 w-2.5 rounded-full ${agent.status === 'online' ? 'bg-green-400' : agent.status === 'degraded' ? 'bg-yellow-400' : 'bg-gray-300'}`} />
                      <div>
                        <div className="text-sm font-medium text-gray-900">{agent.name}</div>
                        <div className="text-xs text-gray-500">{agent.agentId}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              <button
                onClick={() => setShowAddAgent(false)}
                className="mt-3 text-sm text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
            </div>
          )}

          {teamAgents.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
              <div className="text-3xl mb-2">🤖</div>
              <p className="text-sm text-gray-500">No agents in this team yet. Add agents to start collaborating.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Agent</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Capabilities</th>
                    {isOwner && <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {teamAgents.map((agent) => (
                    <tr key={agent.agentUuid} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-gray-900">{agent.name}</div>
                        <div className="text-xs text-gray-400">{agent.agentId}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-gray-600">{(agent as Agent & { agentType?: string }).agentType || 'generic'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusColor[agent.status] ?? 'bg-gray-100 text-gray-500'}`}>
                          {agent.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {agent.capabilities.slice(0, 3).map((cap) => (
                            <span key={cap} className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-600">{cap}</span>
                          ))}
                          {agent.capabilities.length > 3 && (
                            <span className="text-xs text-gray-400">+{agent.capabilities.length - 3}</span>
                          )}
                        </div>
                      </td>
                      {isOwner && (
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => handleRemoveAgent(agent.agentUuid)}
                            className="text-xs text-red-500 hover:text-red-700"
                          >
                            Remove
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Settings Tab */}
      {tab === 'settings' && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Team Settings</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Team ID</label>
              <p className="text-sm text-gray-900 font-mono bg-gray-50 rounded px-3 py-2">{team.teamUuid}</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Created</label>
              <p className="text-sm text-gray-900">{new Date(team.createdAt).toLocaleString()}</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Max Agents</label>
              <p className="text-sm text-gray-900">{team.maxAgents}</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Current Agents</label>
              <p className="text-sm text-gray-900">{team.agentCount ?? teamAgents.length}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
