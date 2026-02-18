import { useState, useEffect } from 'react';
import { listAgents, type Agent } from '../lib/api.js';

const STATUS_COLORS: Record<string, string> = {
  online: 'bg-green-100 text-green-700',
  degraded: 'bg-yellow-100 text-yellow-700',
  offline: 'bg-gray-100 text-gray-600',
};

function AgentRow({ agent }: { agent: Agent }){
  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3">
        <p className="text-sm font-medium text-gray-900">{agent.name}</p>
        <p className="text-xs text-gray-400">{agent.agentId}</p>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {agent.capabilities.map((cap) => (
            <span
              key={cap}
              className="px-2 py-0.5 bg-brand-50 text-brand-700 text-xs rounded-full"
            >
              {cap}
            </span>
          ))}
          {agent.capabilities.length === 0 && (
            <span className="text-xs text-gray-400">—</span>
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        <span
          className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[agent.status] ?? 'bg-gray-100 text-gray-600'}`}
        >
          {agent.status}
        </span>
      </td>
      <td className="px-4 py-3">
        <p className="text-xs text-gray-500 font-mono truncate max-w-48">{agent.endpoint}</p>
      </td>
      <td className="px-4 py-3 text-xs text-gray-500">
        {new Date(agent.createdAt).toLocaleDateString()}
      </td>
    </tr>
  );
}

export function AgentsPage(){
  const [agents, setAgents] = useState<Agent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    const fetchAgents = async () => {
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
    };
    void fetchAgents();
  }, [statusFilter]);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agent Registry</h1>
          <p className="text-sm text-gray-500 mt-1">{total} registered agents</p>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">All statuses</option>
          <option value="online">Online</option>
          <option value="degraded">Degraded</option>
          <option value="offline">Offline</option>
        </select>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Capabilities</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Endpoint</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Registered</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">
                  Loading…
                </td>
              </tr>
            ) : agents.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">
                  No agents registered yet.
                </td>
              </tr>
            ) : (
              agents.map((agent) => <AgentRow key={agent.agentUuid} agent={agent} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
