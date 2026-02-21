import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { listTemplates, useTemplate, type WorkflowTemplate } from '../lib/api.js';
import { useToast } from '../components/Toast.js';

const CATEGORY_COLORS: Record<string, string> = {
  data: 'bg-blue-100 text-blue-700',
  content: 'bg-purple-100 text-purple-700',
  development: 'bg-green-100 text-green-700',
  research: 'bg-amber-100 text-amber-700',
  general: 'bg-gray-100 text-gray-600',
};

const CATEGORY_ICONS: Record<string, string> = {
  data: 'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4',
  content: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
  development: 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4',
  research: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
  general: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z',
};

export function TemplatesPage() {
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [search, setSearch] = useState('');
  const [executing, setExecuting] = useState<string | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      try {
        const result = await listTemplates({
          category: categoryFilter || undefined,
          search: search || undefined,
        });
        setTemplates(result.templates);
      } catch {
        setError('Failed to load templates');
      } finally {
        setLoading(false);
      }
    };
    void fetch();
  }, [categoryFilter, search]);

  const handleUseTemplate = async (templateUuid: string, templateName: string) => {
    setExecuting(templateUuid);
    try {
      const result = await useTemplate(templateUuid);
      toast(`Workflow "${templateName}" started`, 'success');
      navigate('/workflows');
      void result;
    } catch {
      toast('Failed to start workflow from template', 'error');
    } finally {
      setExecuting(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Workflow Templates</h1>
          <p className="text-sm text-gray-500 mt-1">
            Pre-built workflow definitions you can clone and run
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <input
          type="text"
          placeholder="Search templates..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 max-w-xs px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">All categories</option>
          <option value="data">Data</option>
          <option value="content">Content</option>
          <option value="development">Development</option>
          <option value="research">Research</option>
          <option value="general">General</option>
        </select>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-sm text-gray-400">Loading templates...</div>
      ) : templates.length === 0 ? (
        <div className="text-center py-12">
          <div className="h-16 w-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
            <svg className="h-8 w-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-700">No templates found</p>
          <p className="text-xs text-gray-400 mt-1">
            {search || categoryFilter
              ? 'Try adjusting your search or category filter.'
              : 'Workflow templates will appear here once they are created.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((t) => (
            <div
              key={t.templateUuid}
              className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="h-10 w-10 rounded-lg bg-gray-50 flex items-center justify-center">
                  <svg className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={CATEGORY_ICONS[t.category] ?? CATEGORY_ICONS.general} />
                  </svg>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${CATEGORY_COLORS[t.category] ?? CATEGORY_COLORS.general}`}>
                  {t.category}
                </span>
              </div>

              <h3 className="text-sm font-semibold text-gray-900 mb-1">{t.name}</h3>
              <p className="text-xs text-gray-500 mb-3 line-clamp-2">{t.description}</p>

              {/* Tags */}
              {t.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {t.tags.map((tag) => (
                    <span key={tag} className="px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-[10px]">
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                <span className="text-[10px] text-gray-400">
                  {t.usageCount} {t.usageCount === 1 ? 'use' : 'uses'}
                </span>
                <button
                  onClick={() => handleUseTemplate(t.templateUuid, t.name)}
                  disabled={executing === t.templateUuid}
                  className="px-3 py-1.5 bg-brand-600 text-white text-xs font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors"
                >
                  {executing === t.templateUuid ? 'Starting...' : 'Use Template'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
