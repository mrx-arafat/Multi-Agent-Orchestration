import { useState, useEffect } from 'react';
import { listAgents, registerAgent, triggerHealthCheck, deleteAgent, type Agent } from '../lib/api.js';
import { useToast } from '../components/Toast.js';

const STATUS_STYLES: Record<string, { dot: string; bg: string; text: string }> = {
  online: { dot: 'bg-emerald-400', bg: 'bg-emerald-50', text: 'text-emerald-700' },
  degraded: { dot: 'bg-amber-400', bg: 'bg-amber-50', text: 'text-amber-700' },
  offline: { dot: 'bg-gray-300', bg: 'bg-gray-50', text: 'text-gray-500' },
};

function AgentCard({ agent, onHealthCheck, onDelete }: {
  agent: Agent;
  onHealthCheck: (uuid: string) => void;
  onDelete: (uuid: string) => void;
}) {
  const style = STATUS_STYLES[agent.status] ?? STATUS_STYLES.offline!;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 hover:shadow-md transition-all group">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shadow-sm">
            <span className="text-sm font-bold text-white">{agent.name.charAt(0).toUpperCase()}</span>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{agent.name}</h3>
            <p className="text-xs text-gray-400 font-mono">{agent.agentId}</p>
          </div>
        </div>
        <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 ${style.bg}`}>
          <div className={`h-2 w-2 rounded-full ${style.dot} ${agent.status === 'online' ? 'animate-pulse' : ''}`} />
          <span className={`text-xs font-medium ${style.text}`}>{agent.status}</span>
        </div>
      </div>

      {agent.description && (
        <p className="text-xs text-gray-500 mb-3 line-clamp-2">{agent.description}</p>
      )}

      {agent.capabilities.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {agent.capabilities.map((cap) => (
            <span key={cap} className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-600">{cap}</span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between pt-3 border-t border-gray-100">
        <div className="text-[10px] text-gray-400 space-y-0.5">
          <p className="font-mono truncate max-w-40">{agent.endpoint}</p>
          <p>Registered {new Date(agent.createdAt).toLocaleDateString()}</p>
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onHealthCheck(agent.agentUuid)}
            className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-[10px] font-medium text-gray-600 hover:bg-gray-50"
            title="Health check"
          >
            Ping
          </button>
          <button
            onClick={() => onDelete(agent.agentUuid)}
            className="rounded-lg border border-red-200 px-2.5 py-1.5 text-[10px] font-medium text-red-500 hover:bg-red-50"
            title="Delete agent"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export function AgentsPage(){
  const { toast } = useToast();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [showRegister, setShowRegister] = useState(false);
  const [regForm, setRegForm] = useState({
    agentId: '', name: '', endpoint: '', authToken: '', description: '',
    capabilities: '', agentType: 'generic', createTeam: false, teamName: '',
  });
  const [registering, setRegistering] = useState(false);

  async function loadAgents() {
    setLoading(true);
    setError(null);
    try {
      const result = await listAgents({ status: statusFilter || undefined, limit: 50 });
      setAgents(result.agents);
      setTotal(result.meta.total);
    } catch {
      setError('Failed to load agents');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadAgents(); }, [statusFilter]);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setRegistering(true);
    try {
      const caps = regForm.capabilities.split(',').map((c) => c.trim()).filter(Boolean);
      await registerAgent({
        agentId: regForm.agentId,
        name: regForm.name,
        endpoint: regForm.endpoint,
        authToken: regForm.authToken,
        description: regForm.description || undefined,
        capabilities: caps.length > 0 ? caps : undefined,
        agentType: regForm.agentType,
        createTeam: regForm.createTeam,
        teamName: regForm.teamName || undefined,
      });
      toast('Agent registered successfully!', 'success');
      setShowRegister(false);
      setRegForm({ agentId: '', name: '', endpoint: '', authToken: '', description: '', capabilities: '', agentType: 'generic', createTeam: false, teamName: '' });
      await loadAgents();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to register agent', 'error');
    } finally {
      setRegistering(false);
    }
  }

  async function handleHealthCheck(agentUuid: string) {
    try {
      const result = await triggerHealthCheck(agentUuid);
      toast(`Health check: ${result.status} (${result.latencyMs}ms)`, result.status === 'online' ? 'success' : 'info');
      await loadAgents();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Health check failed', 'error');
    }
  }

  async function handleDelete(agentUuid: string) {
    try {
      await deleteAgent(agentUuid);
      toast('Agent deleted', 'success');
      await loadAgents();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to delete agent', 'error');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agent Registry</h1>
          <p className="text-sm text-gray-500 mt-1">{total} registered agent{total !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">All statuses</option>
            <option value="online">Online</option>
            <option value="degraded">Degraded</option>
            <option value="offline">Offline</option>
          </select>
          <button
            onClick={() => setShowRegister(!showRegister)}
            className="rounded-lg bg-gradient-to-r from-brand-500 to-brand-600 px-4 py-2 text-sm font-medium text-white hover:from-brand-600 hover:to-brand-700 shadow-sm transition-all"
          >
            {showRegister ? 'Cancel' : '+ Register Agent'}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>
      )}

      {/* Registration form */}
      {showRegister && (
        <form onSubmit={handleRegister} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Register a New Agent</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Agent ID *</label>
              <input required value={regForm.agentId} onChange={(e) => setRegForm({ ...regForm, agentId: e.target.value })}
                placeholder="my-agent-1" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
              <input required value={regForm.name} onChange={(e) => setRegForm({ ...regForm, name: e.target.value })}
                placeholder="My AI Agent" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Endpoint URL *</label>
              <input required type="url" value={regForm.endpoint} onChange={(e) => setRegForm({ ...regForm, endpoint: e.target.value })}
                placeholder="https://agent.example.com" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Auth Token *</label>
              <input required type="password" value={regForm.authToken} onChange={(e) => setRegForm({ ...regForm, authToken: e.target.value })}
                placeholder="Agent secret token" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
              <input value={regForm.description} onChange={(e) => setRegForm({ ...regForm, description: e.target.value })}
                placeholder="What does this agent do?" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Capabilities (comma-separated)</label>
              <input value={regForm.capabilities} onChange={(e) => setRegForm({ ...regForm, capabilities: e.target.value })}
                placeholder="code-gen, testing, review" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Agent Type</label>
              <select value={regForm.agentType} onChange={(e) => setRegForm({ ...regForm, agentType: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 outline-none">
                <option value="generic">Generic (HTTP)</option>
                <option value="openclaw">OpenClaw (Webhook)</option>
              </select>
            </div>
          </div>
          <div className="border-t border-gray-100 pt-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={regForm.createTeam} onChange={(e) => setRegForm({ ...regForm, createTeam: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
              <span className="text-sm text-gray-700">Auto-create a team for this agent</span>
            </label>
            {regForm.createTeam && (
              <input value={regForm.teamName} onChange={(e) => setRegForm({ ...regForm, teamName: e.target.value })}
                placeholder="Custom team name (optional)" className="mt-2 w-full max-w-sm rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 outline-none" />
            )}
          </div>
          <button type="submit" disabled={registering}
            className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50 shadow-sm transition-colors">
            {registering ? 'Registering...' : 'Register Agent'}
          </button>
        </form>
      )}

      {/* Agent grid */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse rounded-xl border border-gray-200 bg-white p-5">
              <div className="flex gap-3 mb-3">
                <div className="h-10 w-10 rounded-lg bg-gray-200" />
                <div className="space-y-2 flex-1">
                  <div className="h-4 w-24 rounded bg-gray-200" />
                  <div className="h-3 w-16 rounded bg-gray-100" />
                </div>
              </div>
              <div className="h-4 w-32 rounded bg-gray-100" />
            </div>
          ))}
        </div>
      ) : agents.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <div className="text-4xl mb-3">🤖</div>
          <h3 className="text-lg font-medium text-gray-900 mb-1">No agents registered</h3>
          <p className="text-sm text-gray-500 mb-4">Register your first agent to get started with orchestration.</p>
          <button
            onClick={() => setShowRegister(true)}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
          >
            Register Agent
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <AgentCard key={agent.agentUuid} agent={agent} onHealthCheck={handleHealthCheck} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
