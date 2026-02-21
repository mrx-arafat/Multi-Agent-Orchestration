import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { listWorkflows, getWorkflowStatus, type WorkflowListResponse, type WorkflowRun } from '../lib/api.js';

const STATUS_COLORS: Record<string, string> = {
  queued: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
};

const STATUS_ICONS: Record<string, string> = {
  queued: 'M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  in_progress: 'M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99',
  completed: 'M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  failed: 'M9.75 9.75l4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
};

function WorkflowDetailModal({ runId, onClose }: { runId: string; onClose: () => void }) {
  const [detail, setDetail] = useState<WorkflowRun | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getWorkflowStatus(runId)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [runId]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-xl bg-white shadow-xl mx-4 max-h-[80vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">Workflow Details</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-4">
          {loading ? (
            <div className="space-y-3 animate-pulse">
              <div className="h-5 bg-gray-100 rounded w-3/4" />
              <div className="h-4 bg-gray-100 rounded w-1/2" />
              <div className="h-20 bg-gray-100 rounded" />
            </div>
          ) : detail ? (
            <>
              <div>
                <h4 className="text-lg font-semibold text-gray-900">{detail.workflowName}</h4>
                <p className="text-xs text-gray-400 font-mono mt-1">{detail.workflowRunId}</p>
              </div>

              <div className="flex items-center gap-3">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${STATUS_COLORS[detail.status] ?? 'bg-gray-100 text-gray-600'}`}>
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d={STATUS_ICONS[detail.status] ?? STATUS_ICONS.queued} />
                  </svg>
                  {detail.status.replace('_', ' ')}
                </span>
                {detail.status === 'in_progress' && detail.progress.currentStages && detail.progress.currentStages.length > 0 && (
                  <span className="text-xs text-gray-500">
                    Running: {detail.progress.currentStages.join(', ')}
                  </span>
                )}
              </div>

              {/* Progress Bar */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-gray-600">Progress</span>
                  <span className="text-xs text-gray-500">
                    {detail.progress.completed}/{detail.progress.total} stages
                  </span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-gray-100 overflow-hidden">
                  {detail.progress.total > 0 && (
                    <div className="flex h-full">
                      <div
                        className="bg-emerald-500 transition-all"
                        style={{ width: `${(detail.progress.completed / detail.progress.total) * 100}%` }}
                      />
                      {detail.progress.failed > 0 && (
                        <div
                          className="bg-red-400"
                          style={{ width: `${(detail.progress.failed / detail.progress.total) * 100}%` }}
                        />
                      )}
                      {(detail.progress.inProgress ?? 0) > 0 && (
                        <div
                          className="bg-yellow-400 animate-pulse"
                          style={{ width: `${((detail.progress.inProgress ?? 0) / detail.progress.total) * 100}%` }}
                        />
                      )}
                    </div>
                  )}
                </div>
                <div className="flex gap-4 mt-2">
                  <span className="text-[10px] text-emerald-600 flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" /> {detail.progress.completed} completed
                  </span>
                  {detail.progress.failed > 0 && (
                    <span className="text-[10px] text-red-600 flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-red-400" /> {detail.progress.failed} failed
                    </span>
                  )}
                  {(detail.progress.inProgress ?? 0) > 0 && (
                    <span className="text-[10px] text-yellow-600 flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-yellow-400" /> {detail.progress.inProgress} in progress
                    </span>
                  )}
                </div>
              </div>

              {/* Timestamps */}
              <div className="grid grid-cols-2 gap-4 rounded-lg bg-gray-50 p-4">
                <div>
                  <p className="text-[10px] font-medium text-gray-500 uppercase">Started</p>
                  <p className="text-xs text-gray-900 mt-0.5">{new Date(detail.createdAt).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[10px] font-medium text-gray-500 uppercase">Completed</p>
                  <p className="text-xs text-gray-900 mt-0.5">{detail.completedAt ? new Date(detail.completedAt).toLocaleString() : '—'}</p>
                </div>
              </div>

              {detail.errorMessage && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3">
                  <p className="text-xs font-medium text-red-700 mb-1">Error</p>
                  <p className="text-xs text-red-600 font-mono">{detail.errorMessage}</p>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8">
              <p className="text-sm text-gray-500">Failed to load workflow details.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function WorkflowsPage(){
  const [data, setData] = useState<WorkflowListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [selectedRun, setSelectedRun] = useState<string | null>(null);

  const ITEMS_PER_PAGE = 15;

  useEffect(() => {
    const fetchWorkflows = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await listWorkflows({
          status: statusFilter || undefined,
          page,
          limit: ITEMS_PER_PAGE,
        });
        setData(result);
      } catch {
        setError('Failed to load workflow runs');
      } finally {
        setLoading(false);
      }
    };
    void fetchWorkflows();
  }, [statusFilter, page]);

  const totalPages = data?.meta.pages ?? 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Workflow Runs</h1>
          <p className="text-sm text-gray-500 mt-1">
            {data ? `${data.meta.total} workflow run${data.meta.total !== 1 ? 's' : ''}` : 'Loading...'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">All statuses</option>
            <option value="queued">Queued</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>
          <Link
            to="/workflow-editor"
            className="rounded-lg bg-gradient-to-r from-brand-500 to-brand-600 px-4 py-2 text-sm font-medium text-white hover:from-brand-600 hover:to-brand-700 shadow-sm transition-all"
          >
            + New Workflow
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 flex items-center gap-2">
          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
          </svg>
          {error}
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="animate-pulse p-4 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="h-4 bg-gray-100 rounded w-1/4" />
                <div className="h-4 bg-gray-100 rounded w-16" />
                <div className="h-4 bg-gray-100 rounded w-1/3" />
                <div className="h-4 bg-gray-100 rounded w-24 ml-auto" />
              </div>
            ))}
          </div>
        </div>
      ) : !data || data.runs.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-brand-50 flex items-center justify-center">
            <svg className="h-8 w-8 text-brand-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-1">No workflow runs yet</h3>
          <p className="text-sm text-gray-500 mb-4">Create a workflow using the editor or start from a template.</p>
          <div className="flex justify-center gap-3">
            <Link
              to="/workflow-editor"
              className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
            >
              Open Workflow Editor
            </Link>
            <Link
              to="/templates"
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Browse Templates
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Workflow</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Run ID</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Started</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Completed</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.runs.map((run) => (
                  <tr key={run.workflowRunId} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900">{run.workflowName}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[run.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d={STATUS_ICONS[run.status] ?? STATUS_ICONS.queued} />
                        </svg>
                        {run.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs text-gray-500 font-mono truncate max-w-48">{run.workflowRunId}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {new Date(run.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {run.completedAt ? new Date(run.completedAt).toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setSelectedRun(run.workflowRunId)}
                        className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500">
                Page {page} of {totalPages} ({data.meta.total} total)
              </p>
              <div className="flex gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Detail Modal */}
      {selectedRun && (
        <WorkflowDetailModal runId={selectedRun} onClose={() => setSelectedRun(null)} />
      )}
    </div>
  );
}
