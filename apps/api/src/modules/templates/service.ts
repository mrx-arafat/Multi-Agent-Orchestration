/**
 * Workflow template service — CRUD for reusable workflow definitions.
 * Templates can be public (shared gallery) or user-owned (private).
 */
import { eq, and, sql, desc, or, ilike } from 'drizzle-orm';
import type { Database } from '../../db/index.js';
import { workflowTemplates } from '../../db/schema/index.js';
import { ApiError } from '../../types/index.js';

export interface SafeTemplate {
  templateUuid: string;
  name: string;
  description: string | null;
  category: string;
  definition: unknown;
  isPublic: boolean;
  createdByUserUuid: string | null;
  usageCount: number;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

function toSafe(t: typeof workflowTemplates.$inferSelect): SafeTemplate {
  return {
    templateUuid: t.templateUuid,
    name: t.name,
    description: t.description ?? null,
    category: t.category,
    definition: t.definition,
    isPublic: t.isPublic,
    createdByUserUuid: t.createdByUserUuid ?? null,
    usageCount: t.usageCount,
    tags: t.tags,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

export async function listTemplates(
  db: Database,
  params: {
    category?: string;
    search?: string;
    userUuid?: string;
    page?: number;
    limit?: number;
  },
): Promise<{ templates: SafeTemplate[]; meta: { total: number; page: number; limit: number } }> {
  const page = params.page ?? 1;
  const limit = Math.min(params.limit ?? 20, 100);
  const offset = (page - 1) * limit;

  const conditions = [];

  // Show public templates + user's own private templates
  if (params.userUuid) {
    conditions.push(
      or(
        eq(workflowTemplates.isPublic, true),
        eq(workflowTemplates.createdByUserUuid, params.userUuid),
      ),
    );
  } else {
    conditions.push(eq(workflowTemplates.isPublic, true));
  }

  if (params.category) {
    conditions.push(eq(workflowTemplates.category, params.category));
  }
  if (params.search) {
    conditions.push(
      or(
        ilike(workflowTemplates.name, `%${params.search}%`),
        ilike(workflowTemplates.description, `%${params.search}%`),
      ),
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, countResult] = await Promise.all([
    db.select().from(workflowTemplates).where(whereClause)
      .orderBy(desc(workflowTemplates.usageCount), desc(workflowTemplates.createdAt))
      .limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(workflowTemplates).where(whereClause),
  ]);

  return {
    templates: rows.map(toSafe),
    meta: { total: countResult[0]?.count ?? 0, page, limit },
  };
}

export async function getTemplate(
  db: Database,
  templateUuid: string,
): Promise<SafeTemplate> {
  const [t] = await db
    .select()
    .from(workflowTemplates)
    .where(eq(workflowTemplates.templateUuid, templateUuid))
    .limit(1);

  if (!t) throw ApiError.notFound('Workflow template');
  return toSafe(t);
}

export async function createTemplate(
  db: Database,
  params: {
    name: string;
    description?: string;
    category?: string;
    definition: unknown;
    isPublic?: boolean;
    tags?: string[];
    createdByUserUuid: string;
  },
): Promise<SafeTemplate> {
  const [created] = await db
    .insert(workflowTemplates)
    .values({
      name: params.name,
      description: params.description,
      category: params.category ?? 'general',
      definition: params.definition as Record<string, unknown>,
      isPublic: params.isPublic ?? false,
      tags: params.tags ?? [],
      createdByUserUuid: params.createdByUserUuid,
    })
    .returning();

  if (!created) throw ApiError.internal('Failed to create template');
  return toSafe(created);
}

export async function updateTemplate(
  db: Database,
  templateUuid: string,
  userUuid: string,
  updates: {
    name?: string;
    description?: string;
    category?: string;
    definition?: unknown;
    isPublic?: boolean;
    tags?: string[];
  },
): Promise<SafeTemplate> {
  // Verify ownership
  const [existing] = await db
    .select()
    .from(workflowTemplates)
    .where(eq(workflowTemplates.templateUuid, templateUuid))
    .limit(1);

  if (!existing) throw ApiError.notFound('Workflow template');
  if (existing.createdByUserUuid !== userUuid) {
    throw ApiError.forbidden('Only the template creator can update it');
  }

  const setValues: Record<string, unknown> = { updatedAt: new Date() };
  if (updates.name !== undefined) setValues.name = updates.name;
  if (updates.description !== undefined) setValues.description = updates.description;
  if (updates.category !== undefined) setValues.category = updates.category;
  if (updates.definition !== undefined) setValues.definition = updates.definition;
  if (updates.isPublic !== undefined) setValues.isPublic = updates.isPublic;
  if (updates.tags !== undefined) setValues.tags = updates.tags;

  const [updated] = await db
    .update(workflowTemplates)
    .set(setValues)
    .where(eq(workflowTemplates.templateUuid, templateUuid))
    .returning();

  if (!updated) throw ApiError.internal('Failed to update template');
  return toSafe(updated);
}

export async function deleteTemplate(
  db: Database,
  templateUuid: string,
  userUuid: string,
  userRole: string,
): Promise<void> {
  const [existing] = await db
    .select()
    .from(workflowTemplates)
    .where(eq(workflowTemplates.templateUuid, templateUuid))
    .limit(1);

  if (!existing) throw ApiError.notFound('Workflow template');
  if (existing.createdByUserUuid !== userUuid && userRole !== 'admin') {
    throw ApiError.forbidden('Only the template creator or admin can delete it');
  }

  await db.delete(workflowTemplates).where(eq(workflowTemplates.templateUuid, templateUuid));
}

export async function incrementUsageCount(
  db: Database,
  templateUuid: string,
): Promise<void> {
  await db
    .update(workflowTemplates)
    .set({ usageCount: sql`${workflowTemplates.usageCount} + 1` })
    .where(eq(workflowTemplates.templateUuid, templateUuid));
}
