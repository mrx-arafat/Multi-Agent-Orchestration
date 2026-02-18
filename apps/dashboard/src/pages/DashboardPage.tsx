import { useState, useEffect } from 'react';
import { listAgents, listWorkflows, type AgentListResponse, type WorkflowListResponse } from '../lib/api.js';

interface StatCardProps {
  label: string;
  value: number | string;
  sub?: string;
  color?: string;
}

function StatCard({ label, value, sub, color = 'text-gray-900' }: StatCardProps){
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

export function DashboardPage(){
  const [agentData, setAgentData] = useState<AgentListResponse | null>(null);
  const [workflowData, setWorkflowData] = useState<WorkflowListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [agents, workflows] = await Promise.all([
          listAgents({ limit: 100 }),
          listWorkflows({ limit: 100 }),
        ]);
        setAgentData(agents);
        setWorkflowData(workflows);
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

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Overview</h1>
        <p className="text-sm text-gray-500 mt-1">MAOF Multi-Agent Orchestration Framework</p>
      </div>

      {error && (
        <div className="mb-6 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
              <div className="h-3 bg-gray-200 rounded w-24 mb-3" />
              <div className="h-8 bg-gray-200 rounded w-16" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard
            label="Total Agents"
            value={totalAgents}
            sub={`${onlineAgents} online`}
            color="text-brand-700"
          />
          <StatCard
            label="Online Agents"
            value={onlineAgents}
            sub={`${totalAgents - onlineAgents} offline`}
            color="text-green-600"
          />
          <StatCard
            label="Workflow Runs"
            value={totalWorkflows}
            sub={`${completedWorkflows} completed`}
            color="text-brand-700"
          />
          <StatCard
            label="Failed Workflows"
            value={failedWorkflows}
            sub={totalWorkflows > 0 ? `${Math.round((failedWorkflows / totalWorkflows) * 100)}% failure rate` : 'No runs yet'}
            color={failedWorkflows > 0 ? 'text-red-600' : 'text-green-600'}
          />
        </div>
      )}

      <div className="mt-8 bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-3">Quick Start</h2>
        <div className="space-y-2 text-sm text-gray-600">
          <p>1. Register an agent via <code className="bg-gray-100 px-1 rounded">POST /agents/register</code></p>
          <p>2. Submit a workflow via <code className="bg-gray-100 px-1 rounded">POST /workflows/execute</code></p>
          <p>3. Monitor execution in the Workflows tab</p>
          <p>4. Review audit trail via <code className="bg-gray-100 px-1 rounded">GET /workflows/:runId/audit</code></p>
        </div>
      </div>
    </div>
  );
}
