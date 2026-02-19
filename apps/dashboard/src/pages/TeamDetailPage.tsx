import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  getTeam,
  listTeamAgents,
  listAgents,
  addAgentToTeam,
  removeAgentFromTeam,
  createInvitation,
  listInvitations,
  revokeInvitation,
  type Team,
  type Agent,
  type Invitation,
} from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { useToast } from '../components/Toast';

export function TeamDetailPage() {
  const { teamUuid } = useParams<{ teamUuid: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [team, setTeam] = useState<Team | null>(null);
  const [teamAgents, setTeamAgents] = useState<Agent[]>([]);
  const [allAgents, setAllAgents] = useState<Agent[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddAgent, setShowAddAgent] = useState(false);
  const [tab, setTab] = useState<'agents' | 'invitations' | 'settings'>('agents');
  const [inviteForm, setInviteForm] = useState({ maxUses: 10, expiresInHours: 168 });
  const [creatingInvite, setCreatingInvite] = useState(false);

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

  useEffect(() => { load(); }, [load]);

  // Load invitations when tab changes
  useEffect(() => {
    if (tab === 'invitations' && teamUuid && isOwner) {
      listInvitations(teamUuid).then(setInvitations).catch(() => {});
    }
  }, [tab, teamUuid, isOwner]);

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
      toast('Agent added to team', 'success');
      setShowAddAgent(false);
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to add agent', 'error');
    }
  }

  async function handleRemoveAgent(agentUuid: string) {
    if (!teamUuid) return;
    try {
      await removeAgentFromTeam(teamUuid, agentUuid);
      toast('Agent removed', 'success');
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to remove agent', 'error');
    }
  }

  async function handleCreateInvite() {
    if (!teamUuid) return;
    setCreatingInvite(true);
    try {
      const inv = await createInvitation(teamUuid, inviteForm);
      toast(`Invite code created: ${inv.inviteCode}`, 'success');
      setInvitations((prev) => [inv, ...prev]);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to create invite', 'error');
    } finally {
      setCreatingInvite(false);
    }
  }

  async function handleRevokeInvite(invitationUuid: string) {
    if (!teamUuid) return;
    try {
      await revokeInvitation(teamUuid, invitationUuid);
      setInvitations((prev) => prev.filter((i) => i.invitationUuid !== invitationUuid));
      toast('Invitation revoked', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to revoke', 'error');
    }
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code);
    toast('Invite code copied!', 'info');
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
    online: 'bg-emerald-100 text-emerald-700',
    degraded: 'bg-amber-100 text-amber-700',
    offline: 'bg-gray-100 text-gray-500',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/teams')} className="text-gray-400 hover:text-gray-600 text-sm">&larr; Teams</button>
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-sm">
              <span className="text-sm font-bold text-white">{team.name.charAt(0).toUpperCase()}</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{team.name}</h1>
              <p className="text-xs text-gray-500">{team.description || 'No description'}</p>
            </div>
            {isOwner && <span className="rounded-full bg-purple-100 text-purple-700 px-2.5 py-0.5 text-xs font-semibold">Owner</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <Link to={`/teams/${teamUuid}/kanban`} className="rounded-lg bg-white border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm transition-all">
            Kanban Board
          </Link>
          <Link to={`/teams/${teamUuid}/chat`} className="rounded-lg bg-gradient-to-r from-brand-500 to-brand-600 px-3 py-2 text-sm font-medium text-white hover:from-brand-600 hover:to-brand-700 shadow-sm transition-all">
            Team Chat
          </Link>
        </div>
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          {(['agents', 'invitations', 'settings'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors capitalize ${tab === t ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              {t === 'agents' ? `Agents (${teamAgents.length})` : t}
            </button>
          ))}
        </nav>
      </div>

      {/* ── Agents Tab ────────────────────────────────────────────────────── */}
      {tab === 'agents' && (
        <div className="space-y-4">
          {isOwner && (
            <button onClick={handleShowAdd} className="rounded-lg bg-gradient-to-r from-brand-500 to-brand-600 px-4 py-2 text-sm font-medium text-white hover:from-brand-600 hover:to-brand-700 shadow-sm transition-all">
              + Add Agent
            </button>
          )}

          {showAddAgent && (
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Select an agent to add</h3>
              {allAgents.length === 0 ? (
                <p className="text-sm text-gray-500">No available agents to add. Register agents first.</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {allAgents.map((agent) => (
                    <button key={agent.agentUuid} onClick={() => handleAddAgent(agent.agentUuid)}
                      className="flex items-center gap-3 rounded-lg border border-gray-200 p-3 hover:border-brand-300 hover:bg-brand-50 transition-all text-left">
                      <div className={`h-8 w-8 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center`}>
                        <span className="text-xs font-bold text-white">{agent.name.charAt(0).toUpperCase()}</span>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900">{agent.name}</div>
                        <div className="text-xs text-gray-400">{agent.agentId}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              <button onClick={() => setShowAddAgent(false)} className="mt-3 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
            </div>
          )}

          {teamAgents.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white p-10 text-center">
              <div className="text-3xl mb-2">🤖</div>
              <p className="text-sm text-gray-500">No agents in this team yet.</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {teamAgents.map((agent) => (
                <div key={agent.agentUuid} className="rounded-xl border border-gray-200 bg-white p-4 hover:shadow-md transition-all group">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2.5">
                      <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shadow-sm">
                        <span className="text-xs font-bold text-white">{agent.name.charAt(0).toUpperCase()}</span>
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-gray-900">{agent.name}</div>
                        <div className="text-[10px] text-gray-400 font-mono">{agent.agentId}</div>
                      </div>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusColor[agent.status] ?? 'bg-gray-100 text-gray-500'}`}>
                      {agent.status}
                    </span>
                  </div>
                  {agent.capabilities.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {agent.capabilities.slice(0, 3).map((cap) => (
                        <span key={cap} className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] text-brand-600">{cap}</span>
                      ))}
                    </div>
                  )}
                  {isOwner && (
                    <button onClick={() => handleRemoveAgent(agent.agentUuid)}
                      className="text-xs text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity">
                      Remove from team
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Invitations Tab ──────────────────────────────────────────────── */}
      {tab === 'invitations' && (
        <div className="space-y-4">
          {isOwner ? (
            <>
              <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
                <h3 className="text-sm font-semibold text-gray-900">Generate Invite Link</h3>
                <p className="text-xs text-gray-500">Create a code that others can use to join your team.</p>
                <div className="flex items-center gap-3">
                  <div>
                    <label className="block text-[10px] font-medium text-gray-500 uppercase mb-1">Max Uses</label>
                    <input type="number" min={1} max={1000} value={inviteForm.maxUses}
                      onChange={(e) => setInviteForm({ ...inviteForm, maxUses: Number(e.target.value) })}
                      className="w-24 rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm outline-none focus:border-brand-500" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-gray-500 uppercase mb-1">Expires In (hours)</label>
                    <input type="number" min={1} max={8760} value={inviteForm.expiresInHours}
                      onChange={(e) => setInviteForm({ ...inviteForm, expiresInHours: Number(e.target.value) })}
                      className="w-28 rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm outline-none focus:border-brand-500" />
                  </div>
                  <button onClick={handleCreateInvite} disabled={creatingInvite}
                    className="mt-4 rounded-lg bg-gradient-to-r from-brand-500 to-brand-600 px-4 py-2 text-sm font-medium text-white hover:from-brand-600 hover:to-brand-700 disabled:opacity-50 shadow-sm transition-all">
                    {creatingInvite ? 'Creating...' : 'Generate Code'}
                  </button>
                </div>
              </div>

              {invitations.length === 0 ? (
                <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
                  <p className="text-sm text-gray-500">No active invitations. Generate one above.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {invitations.map((inv) => {
                    const isExpired = inv.expiresAt && new Date(inv.expiresAt) < new Date();
                    const isMaxed = inv.useCount >= inv.maxUses;
                    return (
                      <div key={inv.invitationUuid} className="rounded-xl border border-gray-200 bg-white p-4 flex items-center gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <code className="rounded-lg bg-gray-900 text-emerald-400 px-3 py-1.5 text-sm font-mono font-bold tracking-wider">
                              {inv.inviteCode}
                            </code>
                            <button onClick={() => copyCode(inv.inviteCode)}
                              className="rounded border border-gray-200 px-2 py-1 text-[10px] text-gray-500 hover:bg-gray-50">
                              Copy
                            </button>
                            {isExpired && <span className="rounded bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-600">Expired</span>}
                            {isMaxed && <span className="rounded bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-600">Maxed</span>}
                          </div>
                          <div className="flex gap-4 mt-1.5 text-[10px] text-gray-400">
                            <span>Role: <strong className="text-gray-600">{inv.role}</strong></span>
                            <span>Used: <strong className="text-gray-600">{inv.useCount}/{inv.maxUses}</strong></span>
                            {inv.expiresAt && <span>Expires: {new Date(inv.expiresAt).toLocaleDateString()}</span>}
                          </div>
                        </div>
                        <button onClick={() => handleRevokeInvite(inv.invitationUuid)}
                          className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 transition-colors">
                          Revoke
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
              <p className="text-sm text-gray-500">Only team owners can manage invitations.</p>
            </div>
          )}
        </div>
      )}

      {/* ── Settings Tab ─────────────────────────────────────────────────── */}
      {tab === 'settings' && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Team Settings</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Team ID</label>
              <p className="text-sm text-gray-900 font-mono bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">{team.teamUuid}</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Created</label>
              <p className="text-sm text-gray-900 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">{new Date(team.createdAt).toLocaleString()}</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Max Agents</label>
              <p className="text-sm text-gray-900 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">{team.maxAgents}</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Current Agents</label>
              <p className="text-sm text-gray-900 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">{team.agentCount ?? teamAgents.length}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
