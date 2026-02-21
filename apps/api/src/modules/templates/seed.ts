/**
 * Built-in workflow templates — pre-seeded into the database.
 * These are public templates visible to all users.
 */
import type { Database } from '../../db/index.js';
import { workflowTemplates } from '../../db/schema/index.js';
import { eq } from 'drizzle-orm';

const BUILT_IN_TEMPLATES = [
  {
    name: 'Data Processing Pipeline',
    description: 'Extract, transform, and load data through a multi-stage pipeline. Includes data validation, transformation, and storage stages.',
    category: 'data',
    tags: ['etl', 'data', 'pipeline'],
    definition: {
      name: 'data-processing-pipeline',
      stages: [
        {
          id: 'extract',
          name: 'Data Extraction',
          agentCapability: 'data-extraction',
          input: { source: '${workflow.input.dataSource}', format: '${workflow.input.format}' },
        },
        {
          id: 'validate',
          name: 'Data Validation',
          agentCapability: 'data-validation',
          input: { data: '${extract.output.data}', rules: '${workflow.input.validationRules}' },
          dependencies: ['extract'],
        },
        {
          id: 'transform',
          name: 'Data Transformation',
          agentCapability: 'data-transformation',
          input: { data: '${validate.output.validData}', transformations: '${workflow.input.transformations}' },
          dependencies: ['validate'],
        },
        {
          id: 'load',
          name: 'Data Loading',
          agentCapability: 'data-storage',
          input: { data: '${transform.output.transformedData}', destination: '${workflow.input.destination}' },
          dependencies: ['transform'],
        },
      ],
    },
  },
  {
    name: 'Content Generation',
    description: 'Generate content through research, drafting, and review stages. Produces polished articles, reports, or documentation.',
    category: 'content',
    tags: ['ai', 'writing', 'content'],
    definition: {
      name: 'content-generation',
      stages: [
        {
          id: 'research',
          name: 'Research',
          agentCapability: 'research',
          input: { topic: '${workflow.input.topic}', depth: '${workflow.input.researchDepth}' },
        },
        {
          id: 'outline',
          name: 'Create Outline',
          agentCapability: 'content-planning',
          input: { research: '${research.output.findings}', format: '${workflow.input.contentType}' },
          dependencies: ['research'],
        },
        {
          id: 'draft',
          name: 'Write Draft',
          agentCapability: 'content-writing',
          input: { outline: '${outline.output.outline}', style: '${workflow.input.style}', tone: '${workflow.input.tone}' },
          dependencies: ['outline'],
        },
        {
          id: 'review',
          name: 'Review & Polish',
          agentCapability: 'content-review',
          input: { draft: '${draft.output.content}', criteria: '${workflow.input.qualityCriteria}' },
          dependencies: ['draft'],
        },
      ],
    },
  },
  {
    name: 'Code Review Pipeline',
    description: 'Automated code review with static analysis, security scanning, and quality assessment. Get comprehensive feedback on code changes.',
    category: 'development',
    tags: ['code', 'review', 'quality', 'security'],
    definition: {
      name: 'code-review-pipeline',
      stages: [
        {
          id: 'static-analysis',
          name: 'Static Analysis',
          agentCapability: 'static-analysis',
          input: { code: '${workflow.input.code}', language: '${workflow.input.language}' },
        },
        {
          id: 'security-scan',
          name: 'Security Scan',
          agentCapability: 'security-scanning',
          input: { code: '${workflow.input.code}', language: '${workflow.input.language}' },
        },
        {
          id: 'quality-review',
          name: 'Quality Assessment',
          agentCapability: 'code-review',
          input: {
            code: '${workflow.input.code}',
            staticAnalysis: '${static-analysis.output.issues}',
            securityFindings: '${security-scan.output.vulnerabilities}',
          },
          dependencies: ['static-analysis', 'security-scan'],
        },
      ],
    },
  },
  {
    name: 'Research & Summarize',
    description: 'Multi-source research with summarization and fact-checking. Ideal for due diligence, market research, or literature reviews.',
    category: 'research',
    tags: ['research', 'summary', 'analysis'],
    definition: {
      name: 'research-summarize',
      stages: [
        {
          id: 'gather',
          name: 'Gather Sources',
          agentCapability: 'web-research',
          input: { query: '${workflow.input.query}', maxSources: '${workflow.input.maxSources}' },
        },
        {
          id: 'analyze',
          name: 'Analyze & Extract',
          agentCapability: 'text-analysis',
          input: { sources: '${gather.output.sources}', focusAreas: '${workflow.input.focusAreas}' },
          dependencies: ['gather'],
        },
        {
          id: 'summarize',
          name: 'Synthesize Summary',
          agentCapability: 'summarization',
          input: { analysis: '${analyze.output.analysis}', format: '${workflow.input.outputFormat}' },
          dependencies: ['analyze'],
        },
      ],
    },
  },
];

/**
 * Seeds built-in workflow templates if they don't exist.
 * Safe to call on every startup — uses upsert logic.
 */
export async function seedTemplates(db: Database): Promise<number> {
  let seeded = 0;

  for (const template of BUILT_IN_TEMPLATES) {
    // Check if template already exists by name
    const [existing] = await db
      .select({ id: workflowTemplates.id })
      .from(workflowTemplates)
      .where(eq(workflowTemplates.name, template.name))
      .limit(1);

    if (!existing) {
      await db.insert(workflowTemplates).values({
        name: template.name,
        description: template.description,
        category: template.category,
        definition: template.definition as Record<string, unknown>,
        isPublic: true,
        tags: template.tags,
        createdByUserUuid: null,
      });
      seeded++;
    }
  }

  return seeded;
}
