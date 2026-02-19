import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { listTeams, createTeam, type Team } from '../lib/api';

export function TeamsPage() {
  const navigate = useNavigate();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', maxAgents: 10 });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadTeams();
  }, []);

  async function loadTeams() {
    try {
      setLoading(true);
      const data = await listTeams();
      setTeams(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load teams');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError('');
    try {
      await createTeam(form);
      setShowCreate(false);
      setForm({ name: '', description: '', maxAgents: 10 });
      await loadTeams();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create team');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Teams</h1>
          <p className="mt-1 text-sm text-gray-500">Manage your AI agent teams and collaboration spaces</p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 transition-colors"
        >
          {showCreate ? 'Cancel' : '+ New Team'}
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>
      )}

      {showCreate && (
        <form onSubmit={handleCreate} className="rounded-xl border border-gray-200 bg-white p-6 space-y-4 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Create a New Team</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Team Name</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
              placeholder="e.g. Code Review Squad"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
              rows={2}
              placeholder="What does this team do?"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Max Agents</label>
            <input
              type="number"
              min={1}
              max={50}
              value={form.maxAgents}
              onChange={(e) => setForm({ ...form, maxAgents: Number(e.target.value) })}
              className="w-32 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={creating}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50 transition-colors"
          >
            {creating ? 'Creating...' : 'Create Team'}
          </button>
        </form>
      )}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse rounded-xl border border-gray-200 bg-white p-6">
              <div className="h-5 w-32 rounded bg-gray-200 mb-3" />
              <div className="h-4 w-48 rounded bg-gray-100 mb-4" />
              <div className="h-8 w-20 rounded bg-gray-100" />
            </div>
          ))}
        </div>
      ) : teams.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <div className="text-4xl mb-3">👥</div>
          <h3 className="text-lg font-medium text-gray-900 mb-1">No teams yet</h3>
          <p className="text-sm text-gray-500">Create your first team to start collaborating with AI agents.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((team) => (
            <div
              key={team.teamUuid}
              onClick={() => navigate(`/teams/${team.teamUuid}`)}
              className="cursor-pointer rounded-xl border border-gray-200 bg-white p-6 hover:border-brand-300 hover:shadow-md transition-all"
            >
              <h3 className="text-lg font-semibold text-gray-900 mb-1">{team.name}</h3>
              <p className="text-sm text-gray-500 mb-4 line-clamp-2">{team.description || 'No description'}</p>
              <div className="flex items-center gap-4 text-xs text-gray-400">
                <span className="flex items-center gap-1">
                  <span className="font-medium text-gray-600">{team.agentCount ?? 0}</span> / {team.maxAgents} agents
                </span>
                <span>{new Date(team.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
