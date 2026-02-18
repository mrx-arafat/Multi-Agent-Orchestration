import { useState, useEffect } from 'react';
import { listWorkflows, type WorkflowListResponse } from '../lib/api.js';

const STATUS_COLORS: Record<string, string> = {
  queued: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
};

export function WorkflowsPage(){
  const [data, setData] = useState<WorkflowListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    const fetchWorkflows = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await listWorkflows({
          status: statusFilter || undefined,
          limit: 50,
        });
        setData(result);
      } catch {
        setError('Failed to load workflow runs');
      } finally {
        setLoading(false);
      }
    };
    void fetchWorkflows();
  }, [statusFilter]);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Workflow Runs</h1>
          <p className="text-sm text-gray-500 mt-1">
            {data ? `${data.meta.total} workflow runs` : 'Loading...'}
          </p>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">All statuses</option>
          <option value="queued">Queued</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
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
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Run ID</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Started</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Completed</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">
                  Loading...
                </td>
              </tr>
            ) : !data || data.runs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">
                  No workflow runs yet. Submit one via POST /api/workflows/execute
                </td>
              </tr>
            ) : (
              data.runs.map((run) => (
                <tr key={run.workflowRunId} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-gray-900">{run.workflowName}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[run.status] ?? 'bg-gray-100 text-gray-600'}`}
                    >
                      {run.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs text-gray-500 font-mono truncate max-w-48">{run.workflowRunId}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {new Date(run.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {run.completedAt ? new Date(run.completedAt).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
