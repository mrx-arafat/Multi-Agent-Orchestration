import { useState } from 'react';
import { useAuth } from '../lib/auth-context';

export function SettingsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<'profile' | 'api'>('profile');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">Manage your account and API access</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          <button
            onClick={() => setTab('profile')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${tab === 'profile' ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            Profile
          </button>
          <button
            onClick={() => setTab('api')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${tab === 'api' ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            API Access
          </button>
        </nav>
      </div>

      {/* Profile Tab */}
      {tab === 'profile' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Account Information</h2>
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Name</label>
                <p className="text-sm text-gray-900 bg-gray-50 rounded-lg px-3 py-2.5 border border-gray-100">
                  {user?.name ?? 'N/A'}
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Email</label>
                <p className="text-sm text-gray-900 bg-gray-50 rounded-lg px-3 py-2.5 border border-gray-100">
                  {user?.email ?? 'N/A'}
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase mb-1">User ID</label>
                <p className="text-sm text-gray-900 font-mono bg-gray-50 rounded-lg px-3 py-2.5 border border-gray-100">
                  {user?.userUuid ?? 'N/A'}
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Role</label>
                <p className="text-sm text-gray-900 bg-gray-50 rounded-lg px-3 py-2.5 border border-gray-100 capitalize">
                  {user?.role ?? 'N/A'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* API Tab */}
      {tab === 'api' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">API Endpoints</h2>
            <p className="text-sm text-gray-500 mb-4">Use these endpoints to integrate with the MAOF platform.</p>
            <div className="space-y-3">
              {[
                { method: 'POST', path: '/api/auth/login', desc: 'Authenticate and get JWT tokens' },
                { method: 'POST', path: '/api/agents/register', desc: 'Register a new agent (supports createTeam)' },
                { method: 'GET', path: '/api/agents', desc: 'List all registered agents' },
                { method: 'GET', path: '/api/teams', desc: 'List your teams' },
                { method: 'POST', path: '/api/teams/:teamUuid/kanban/tasks', desc: 'Create a Kanban task' },
                { method: 'POST', path: '/api/teams/:teamUuid/messages', desc: 'Send a message in team chat' },
                { method: 'POST', path: '/api/workflows/execute', desc: 'Execute a multi-agent workflow' },
              ].map((ep) => (
                <div key={ep.path} className="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
                  <span className={`rounded px-2 py-0.5 text-xs font-bold ${ep.method === 'GET' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                    {ep.method}
                  </span>
                  <code className="text-sm text-gray-800 font-mono">{ep.path}</code>
                  <span className="ml-auto text-xs text-gray-400">{ep.desc}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Quick Start: Register an Agent</h2>
            <p className="text-sm text-gray-500 mb-3">Use this cURL command to register an agent with auto-team creation:</p>
            <pre className="rounded-lg bg-gray-900 text-green-400 p-4 text-xs overflow-x-auto">
{`curl -X POST http://localhost:3000/api/agents/register \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer <your-jwt-token>" \\
  -d '{
    "agentId": "my-agent-1",
    "name": "My AI Agent",
    "endpoint": "https://my-agent.example.com",
    "authToken": "agent-secret-token",
    "capabilities": ["code-generation", "testing"],
    "agentType": "openclaw",
    "createTeam": true,
    "teamName": "My Agent Team"
  }'`}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
