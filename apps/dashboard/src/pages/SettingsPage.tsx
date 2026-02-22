import { useState, useEffect } from 'react';
import { useAuth } from '../lib/auth-context.js';
import { useToast } from '../components/Toast.js';
import { ConfirmDialog } from '../components/ConfirmDialog.js';
import { getAIStatus, updateProfile, createApiToken, listApiTokens, revokeApiToken, type AIStatus, type ApiToken } from '../lib/api.js';

const PROVIDER_INFO: Record<string, { label: string; color: string; docs: string }> = {
  openai: { label: 'OpenAI', color: 'bg-emerald-500', docs: 'MAOF_OPENAI_API_KEY' },
  anthropic: { label: 'Anthropic', color: 'bg-orange-500', docs: 'MAOF_ANTHROPIC_API_KEY' },
  google: { label: 'Google Gemini', color: 'bg-blue-500', docs: 'MAOF_GOOGLE_AI_API_KEY' },
};

const MODE_INFO: Record<string, { label: string; desc: string; color: string }> = {
  mock: { label: 'Mock', desc: 'Workflows return simulated responses (no AI calls)', color: 'text-amber-600 bg-amber-50' },
  builtin: { label: 'Built-in AI', desc: 'Workflows use real AI APIs via configured providers', color: 'text-emerald-600 bg-emerald-50' },
  real: { label: 'External Agents', desc: 'Workflows dispatch to registered HTTP agent endpoints', color: 'text-blue-600 bg-blue-50' },
};

export function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState<'profile' | 'ai' | 'api'>('profile');
  const [aiStatus, setAiStatus] = useState<AIStatus | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Profile editing
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(user?.name ?? '');
  const [savingName, setSavingName] = useState(false);

  // API Tokens
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [tokensLoading, setTokensLoading] = useState(false);
  const [showCreateToken, setShowCreateToken] = useState(false);
  const [tokenForm, setTokenForm] = useState({ name: '', expiresInDays: 90 });
  const [creatingToken, setCreatingToken] = useState(false);
  const [newTokenValue, setNewTokenValue] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if (tab === 'ai') {
      setAiLoading(true);
      getAIStatus()
        .then(setAiStatus)
        .catch(() => setAiStatus(null))
        .finally(() => setAiLoading(false));
    }
    if (tab === 'api') {
      loadTokens();
    }
  }, [tab]);

  async function loadTokens() {
    setTokensLoading(true);
    try {
      const data = await listApiTokens();
      setTokens(data);
    } catch {
      toast('Failed to load API tokens', 'error');
    } finally {
      setTokensLoading(false);
    }
  }

  async function handleSaveName() {
    if (!nameInput.trim()) return;
    setSavingName(true);
    try {
      await updateProfile({ name: nameInput.trim() });
      toast('Profile updated', 'success');
      setEditingName(false);
      if (refreshUser) await refreshUser();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to update profile', 'error');
    } finally {
      setSavingName(false);
    }
  }

  async function handleCreateToken(e: React.FormEvent) {
    e.preventDefault();
    if (!tokenForm.name.trim()) return;
    setCreatingToken(true);
    try {
      const result = await createApiToken({
        name: tokenForm.name.trim(),
        expiresInDays: tokenForm.expiresInDays,
      });
      setNewTokenValue(result.token);
      setTokenForm({ name: '', expiresInDays: 90 });
      setShowCreateToken(false);
      await loadTokens();
      toast('API token created', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to create token', 'error');
    } finally {
      setCreatingToken(false);
    }
  }

  async function handleRevokeToken() {
    if (!confirmRevoke) return;
    try {
      await revokeApiToken(confirmRevoke.id);
      toast('Token revoked', 'success');
      setConfirmRevoke(null);
      await loadTokens();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to revoke token', 'error');
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">Manage your account, AI providers, and API access</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          {[
            { key: 'profile' as const, label: 'Profile' },
            { key: 'ai' as const, label: 'AI Providers' },
            { key: 'api' as const, label: 'API Access' },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${tab === t.key ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              {t.label}
            </button>
          ))}
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
                {editingName ? (
                  <div className="flex gap-2">
                    <input
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                      autoFocus
                      onKeyDown={(e) => { if (e.key === 'Enter') void handleSaveName(); if (e.key === 'Escape') { setEditingName(false); setNameInput(user?.name ?? ''); } }}
                    />
                    <button
                      onClick={() => void handleSaveName()}
                      disabled={savingName || !nameInput.trim()}
                      className="rounded-lg bg-brand-500 px-3 py-2 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-50"
                    >
                      {savingName ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      onClick={() => { setEditingName(false); setNameInput(user?.name ?? ''); }}
                      className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-gray-900 bg-gray-50 rounded-lg px-3 py-2.5 border border-gray-100 flex-1">
                      {user?.name ?? 'N/A'}
                    </p>
                    <button
                      onClick={() => { setNameInput(user?.name ?? ''); setEditingName(true); }}
                      className="rounded-lg border border-gray-200 px-2.5 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50"
                    >
                      Edit
                    </button>
                  </div>
                )}
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

      {/* AI Providers Tab */}
      {tab === 'ai' && (
        <div className="space-y-6">
          {aiLoading ? (
            <div className="animate-pulse space-y-4">
              <div className="h-32 rounded-xl bg-gray-100" />
              <div className="h-48 rounded-xl bg-gray-100" />
            </div>
          ) : aiStatus ? (
            <>
              {/* Dispatch Mode */}
              <div className="rounded-xl border border-gray-200 bg-white p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Dispatch Mode</h2>
                <div className="flex items-center gap-3 mb-4">
                  <span className={`rounded-full px-3 py-1 text-sm font-medium ${MODE_INFO[aiStatus.dispatchMode]?.color ?? 'text-gray-600 bg-gray-50'}`}>
                    {MODE_INFO[aiStatus.dispatchMode]?.label ?? aiStatus.dispatchMode}
                  </span>
                  {aiStatus.builtinReady && (
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">Ready</span>
                  )}
                </div>
                <p className="text-sm text-gray-500">
                  {MODE_INFO[aiStatus.dispatchMode]?.desc ?? 'Unknown dispatch mode'}
                </p>
                {aiStatus.dispatchMode === 'mock' && aiStatus.hasAnyProvider && (
                  <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 p-3">
                    <p className="text-sm text-amber-800">
                      You have AI providers configured but dispatch mode is set to <code className="font-mono bg-amber-100 px-1 rounded">mock</code>.
                      Set <code className="font-mono bg-amber-100 px-1 rounded">MAOF_AGENT_DISPATCH_MODE=builtin</code> in your <code className="font-mono bg-amber-100 px-1 rounded">.env</code> to use real AI.
                    </p>
                  </div>
                )}
                {aiStatus.dispatchMode === 'builtin' && !aiStatus.hasAnyProvider && (
                  <div className="mt-4 rounded-lg bg-red-50 border border-red-200 p-3">
                    <p className="text-sm text-red-800">
                      Dispatch mode is <code className="font-mono bg-red-100 px-1 rounded">builtin</code> but no AI provider is configured.
                      Add at least one API key to your <code className="font-mono bg-red-100 px-1 rounded">.env</code> file.
                    </p>
                  </div>
                )}
              </div>

              {/* Providers */}
              <div className="rounded-xl border border-gray-200 bg-white p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">AI Providers</h2>
                <div className="grid gap-4 sm:grid-cols-3">
                  {(['openai', 'anthropic', 'google'] as const).map((name) => {
                    const info = PROVIDER_INFO[name]!;
                    const configured = aiStatus.providers.some((p) => p.name === name);
                    const isDefault = aiStatus.defaultProvider === name;
                    return (
                      <div key={name} className={`rounded-xl border p-4 ${configured ? 'border-emerald-200 bg-emerald-50/30' : 'border-gray-200 bg-gray-50/50'}`}>
                        <div className="flex items-center gap-3 mb-3">
                          <div className={`h-8 w-8 rounded-lg ${info.color} flex items-center justify-center`}>
                            <span className="text-xs font-bold text-white">{name.charAt(0).toUpperCase()}</span>
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold text-gray-900">{info.label}</h3>
                            {isDefault && <span className="text-[10px] font-medium text-emerald-600">Default</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className={`h-2 w-2 rounded-full ${configured ? 'bg-emerald-400' : 'bg-gray-300'}`} />
                          <span className={`text-xs font-medium ${configured ? 'text-emerald-700' : 'text-gray-400'}`}>
                            {configured ? 'Configured' : 'Not configured'}
                          </span>
                        </div>
                        {!configured && (
                          <p className="text-[10px] text-gray-400 mt-2 font-mono">{info.docs}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Capabilities */}
              <div className="rounded-xl border border-gray-200 bg-white p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-2">Built-in Capabilities</h2>
                <p className="text-sm text-gray-500 mb-4">{aiStatus.capabilities.length} capabilities available through built-in AI agents</p>
                <div className="flex flex-wrap gap-2">
                  {aiStatus.capabilities.map((cap) => (
                    <span key={cap} className="rounded-full bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700 border border-violet-200">
                      {cap}
                    </span>
                  ))}
                </div>
              </div>

              {/* Setup Guide */}
              <div className="rounded-xl border border-gray-200 bg-white p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-2">Setup Guide</h2>
                <p className="text-sm text-gray-500 mb-4">Add these to your <code className="font-mono bg-gray-100 px-1 rounded">.env</code> file to enable real AI:</p>
                <pre className="rounded-lg bg-gray-900 text-green-400 p-4 text-xs overflow-x-auto">
{`# Enable built-in AI dispatch
MAOF_AGENT_DISPATCH_MODE=builtin

# Add at least one provider API key:
MAOF_OPENAI_API_KEY=sk-...
MAOF_ANTHROPIC_API_KEY=sk-ant-...
MAOF_GOOGLE_AI_API_KEY=AI...

# Optional: set preferred provider
MAOF_DEFAULT_AI_PROVIDER=openai`}
                </pre>
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
              <p className="text-sm text-red-700">Failed to load AI status. Make sure the API server is running.</p>
            </div>
          )}
        </div>
      )}

      {/* API Tab */}
      {tab === 'api' && (
        <div className="space-y-6">
          {/* API Tokens Management */}
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">API Tokens</h2>
                <p className="text-xs text-gray-500 mt-0.5">Create tokens for machine-to-machine authentication</p>
              </div>
              <button
                onClick={() => setShowCreateToken(!showCreateToken)}
                className="rounded-lg bg-brand-500 px-3 py-2 text-xs font-medium text-white hover:bg-brand-600 transition-colors"
              >
                {showCreateToken ? 'Cancel' : '+ Create Token'}
              </button>
            </div>

            {/* New token notice */}
            {newTokenValue && (
              <div className="mb-4 rounded-lg bg-emerald-50 border border-emerald-200 p-4">
                <div className="flex items-start gap-2">
                  <svg className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-emerald-800">Token created successfully</p>
                    <p className="text-xs text-emerald-600 mt-1">Copy this token now. You won't be able to see it again.</p>
                    <div className="mt-2 flex items-center gap-2">
                      <code className="flex-1 rounded bg-white border border-emerald-200 px-3 py-2 text-xs font-mono text-gray-900 select-all">
                        {newTokenValue}
                      </code>
                      <button
                        onClick={() => { void navigator.clipboard.writeText(newTokenValue); toast('Token copied to clipboard', 'success'); }}
                        className="rounded-lg border border-emerald-300 px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                  <button onClick={() => setNewTokenValue(null)} className="text-emerald-400 hover:text-emerald-600">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            )}

            {/* Create token form */}
            {showCreateToken && (
              <form onSubmit={handleCreateToken} className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Token Name *</label>
                  <input
                    required
                    value={tokenForm.name}
                    onChange={(e) => setTokenForm({ ...tokenForm, name: e.target.value })}
                    placeholder="e.g., CI/CD Pipeline"
                    className="w-full max-w-sm rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Expires In (days)</label>
                  <select
                    value={tokenForm.expiresInDays}
                    onChange={(e) => setTokenForm({ ...tokenForm, expiresInDays: Number(e.target.value) })}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 outline-none"
                  >
                    <option value={30}>30 days</option>
                    <option value={90}>90 days</option>
                    <option value={180}>180 days</option>
                    <option value={365}>1 year</option>
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={creatingToken || !tokenForm.name.trim()}
                  className="rounded-lg bg-brand-500 px-4 py-2 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-50"
                >
                  {creatingToken ? 'Creating...' : 'Create Token'}
                </button>
              </form>
            )}

            {/* Token list */}
            {tokensLoading ? (
              <div className="animate-pulse space-y-2">
                {[1, 2].map((i) => <div key={i} className="h-14 bg-gray-100 rounded-lg" />)}
              </div>
            ) : tokens.length === 0 ? (
              <div className="text-center py-8 text-sm text-gray-400">
                No API tokens created yet. Create one to authenticate API requests.
              </div>
            ) : (
              <div className="space-y-2">
                {tokens.map((token) => (
                  <div key={token.tokenId} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`h-2 w-2 rounded-full shrink-0 ${token.revokedAt ? 'bg-red-400' : 'bg-emerald-400'}`} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-gray-900 truncate">{token.name}</p>
                          {token.revokedAt && (
                            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-600">Revoked</span>
                          )}
                        </div>
                        <p className="text-[10px] text-gray-400 font-mono">{token.tokenPrefix}...</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-right">
                        <p className="text-[10px] text-gray-400">
                          Created {new Date(token.createdAt).toLocaleDateString()}
                        </p>
                        {token.expiresAt && (
                          <p className="text-[10px] text-gray-400">
                            Expires {new Date(token.expiresAt).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                      {!token.revokedAt && (
                        <button
                          onClick={() => setConfirmRevoke({ id: token.tokenId, name: token.name })}
                          className="rounded-lg border border-red-200 px-2.5 py-1.5 text-[10px] font-medium text-red-500 hover:bg-red-50"
                        >
                          Revoke
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* API Endpoints Reference */}
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">API Endpoints</h2>
            <p className="text-sm text-gray-500 mb-4">Use these endpoints to integrate with the MAOF platform.</p>
            <div className="space-y-3">
              {[
                { method: 'POST', path: '/api/auth/login', desc: 'Authenticate and get JWT tokens' },
                { method: 'POST', path: '/api/agents/register', desc: 'Register a new agent (supports createTeam)' },
                { method: 'GET', path: '/api/agents', desc: 'List all registered agents' },
                { method: 'GET', path: '/api/teams', desc: 'List your teams' },
                { method: 'POST', path: '/api/templates/:uuid/use', desc: 'Instantiate a workflow template' },
                { method: 'POST', path: '/api/workflows/execute', desc: 'Execute a multi-agent workflow' },
                { method: 'GET', path: '/api/agent-ops/protocol', desc: 'Agent operating protocol (no auth)' },
                { method: 'GET', path: '/api/ai/status', desc: 'AI provider configuration status' },
                { method: 'GET', path: '/api/notifications', desc: 'List your notifications' },
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
        </div>
      )}

      {/* Revoke Token Confirmation */}
      <ConfirmDialog
        open={!!confirmRevoke}
        title="Revoke API Token"
        message={`Are you sure you want to revoke "${confirmRevoke?.name}"? Any applications using this token will immediately lose access.`}
        confirmLabel="Revoke Token"
        variant="danger"
        onConfirm={handleRevokeToken}
        onCancel={() => setConfirmRevoke(null)}
      />
    </div>
  );
}
