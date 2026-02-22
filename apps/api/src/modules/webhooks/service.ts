/**
 * Webhook service — manages webhook registrations and delivers events
 * to external systems with retry logic and HMAC-SHA256 signing.
 */
import { eq, and, sql, desc } from 'drizzle-orm';
import { createHmac, randomBytes } from 'crypto';
import type { Database } from '../../db/index.js';
import { webhooks, webhookDeliveries } from '../../db/schema/index.js';
import { ApiError } from '../../types/index.js';

// ── CRUD ────────────────────────────────────────────────────────────────

export interface SafeWebhook {
  webhookUuid: string;
  teamUuid: string;
  url: string;
  events: string[];
  active: boolean;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export async function createWebhook(
  db: Database,
  params: {
    teamUuid: string;
    url: string;
    events: string[];
    description?: string;
    createdByUserUuid: string;
  },
): Promise<SafeWebhook & { secret: string }> {
  const secret = randomBytes(32).toString('hex');

  const [created] = await db
    .insert(webhooks)
    .values({
      teamUuid: params.teamUuid,
      url: params.url,
      secret,
      events: params.events,
      description: params.description,
      createdByUserUuid: params.createdByUserUuid,
    })
    .returning();

  if (!created) throw ApiError.internal('Failed to create webhook');

  return {
    webhookUuid: created.webhookUuid,
    teamUuid: created.teamUuid,
    url: created.url,
    events: created.events,
    active: created.active,
    description: created.description ?? null,
    createdAt: created.createdAt,
    updatedAt: created.updatedAt,
    secret, // Only returned on creation
  };
}

export async function listWebhooks(
  db: Database,
  teamUuid: string,
): Promise<SafeWebhook[]> {
  const rows = await db
    .select()
    .from(webhooks)
    .where(eq(webhooks.teamUuid, teamUuid))
    .orderBy(desc(webhooks.createdAt));

  return rows.map((w) => ({
    webhookUuid: w.webhookUuid,
    teamUuid: w.teamUuid,
    url: w.url,
    events: w.events,
    active: w.active,
    description: w.description ?? null,
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
  }));
}

export async function updateWebhook(
  db: Database,
  webhookUuid: string,
  teamUuid: string,
  params: { url?: string; events?: string[]; active?: boolean; description?: string },
): Promise<SafeWebhook> {
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (params.url !== undefined) updates.url = params.url;
  if (params.events !== undefined) updates.events = params.events;
  if (params.active !== undefined) updates.active = params.active;
  if (params.description !== undefined) updates.description = params.description;

  const [updated] = await db
    .update(webhooks)
    .set(updates)
    .where(and(eq(webhooks.webhookUuid, webhookUuid), eq(webhooks.teamUuid, teamUuid)))
    .returning();

  if (!updated) throw ApiError.notFound('Webhook');

  return {
    webhookUuid: updated.webhookUuid,
    teamUuid: updated.teamUuid,
    url: updated.url,
    events: updated.events,
    active: updated.active,
    description: updated.description ?? null,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  };
}

export async function deleteWebhook(
  db: Database,
  webhookUuid: string,
  teamUuid: string,
): Promise<void> {
  const result = await db
    .delete(webhooks)
    .where(and(eq(webhooks.webhookUuid, webhookUuid), eq(webhooks.teamUuid, teamUuid)));

  // Drizzle doesn't return rowCount on delete — just proceed
}

// ── Delivery ────────────────────────────────────────────────────────────

/**
 * Signs a webhook payload with HMAC-SHA256.
 */
function signPayload(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Delivers a webhook event to all matching registered webhooks for a team.
 * Creates delivery records for tracking and retry.
 */
export async function deliverWebhookEvent(
  db: Database,
  teamUuid: string,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<number> {
  // Find all active webhooks for this team that subscribe to this event type
  const matchingWebhooks = await db
    .select()
    .from(webhooks)
    .where(and(
      eq(webhooks.teamUuid, teamUuid),
      eq(webhooks.active, true),
      sql`${webhooks.events} @> ARRAY[${eventType}]::text[]`,
    ));

  if (matchingWebhooks.length === 0) return 0;

  let deliveredCount = 0;

  for (const webhook of matchingWebhooks) {
    const body = JSON.stringify({
      event: eventType,
      timestamp: new Date().toISOString(),
      payload,
    });

    const signature = signPayload(body, webhook.secret);

    // Create delivery record
    const [delivery] = await db
      .insert(webhookDeliveries)
      .values({
        webhookUuid: webhook.webhookUuid,
        eventType,
        payload: { event: eventType, payload },
        status: 'pending',
        attempts: 0,
        maxAttempts: 5,
      })
      .returning();

    if (!delivery) continue;

    // Attempt immediate delivery
    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-MAOF-Signature': `sha256=${signature}`,
          'X-MAOF-Event': eventType,
          'X-MAOF-Delivery': delivery.deliveryUuid,
        },
        body,
        signal: AbortSignal.timeout(10000), // 10s timeout
      });

      if (response.ok) {
        await db
          .update(webhookDeliveries)
          .set({
            status: 'success',
            responseCode: response.status,
            attempts: 1,
            completedAt: new Date(),
          })
          .where(eq(webhookDeliveries.id, delivery.id));
        deliveredCount++;
      } else {
        // Schedule retry with exponential backoff
        const nextRetry = new Date(Date.now() + 60000); // 1 min
        await db
          .update(webhookDeliveries)
          .set({
            status: 'pending',
            responseCode: response.status,
            responseBody: (await response.text().catch(() => '')).slice(0, 1000),
            attempts: 1,
            nextRetryAt: nextRetry,
          })
          .where(eq(webhookDeliveries.id, delivery.id));
      }
    } catch (err) {
      // Network error — schedule retry
      const nextRetry = new Date(Date.now() + 60000);
      await db
        .update(webhookDeliveries)
        .set({
          status: 'pending',
          attempts: 1,
          nextRetryAt: nextRetry,
          responseBody: err instanceof Error ? err.message.slice(0, 500) : 'Unknown error',
        })
        .where(eq(webhookDeliveries.id, delivery.id));
    }
  }

  return deliveredCount;
}

/**
 * Retries failed webhook deliveries.
 * Called periodically by a BullMQ recurring job or health check worker.
 */
export async function retryFailedDeliveries(db: Database): Promise<number> {
  const pendingDeliveries = await db
    .select({
      delivery: webhookDeliveries,
      webhookUrl: webhooks.url,
      webhookSecret: webhooks.secret,
      webhookActive: webhooks.active,
    })
    .from(webhookDeliveries)
    .innerJoin(webhooks, eq(webhookDeliveries.webhookUuid, webhooks.webhookUuid))
    .where(and(
      eq(webhookDeliveries.status, 'pending'),
      sql`${webhookDeliveries.attempts} < ${webhookDeliveries.maxAttempts}`,
      sql`${webhookDeliveries.nextRetryAt} <= NOW()`,
    ))
    .limit(50);

  let retriedCount = 0;

  for (const { delivery, webhookUrl, webhookSecret, webhookActive } of pendingDeliveries) {
    if (!webhookActive) {
      await db
        .update(webhookDeliveries)
        .set({ status: 'dead_letter' })
        .where(eq(webhookDeliveries.id, delivery.id));
      continue;
    }

    const body = JSON.stringify(delivery.payload);
    const signature = signPayload(body, webhookSecret);

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-MAOF-Signature': `sha256=${signature}`,
          'X-MAOF-Event': delivery.eventType,
          'X-MAOF-Delivery': delivery.deliveryUuid,
        },
        body,
        signal: AbortSignal.timeout(10000),
      });

      if (response.ok) {
        await db
          .update(webhookDeliveries)
          .set({
            status: 'success',
            responseCode: response.status,
            attempts: delivery.attempts + 1,
            completedAt: new Date(),
          })
          .where(eq(webhookDeliveries.id, delivery.id));
        retriedCount++;
      } else {
        const newAttempts = delivery.attempts + 1;
        const isExhausted = newAttempts >= delivery.maxAttempts;
        const backoffMs = Math.min(60000 * Math.pow(2, newAttempts - 1), 3600000); // max 1 hour

        await db
          .update(webhookDeliveries)
          .set({
            status: isExhausted ? 'dead_letter' : 'pending',
            responseCode: response.status,
            attempts: newAttempts,
            nextRetryAt: isExhausted ? null : new Date(Date.now() + backoffMs),
          })
          .where(eq(webhookDeliveries.id, delivery.id));
      }
    } catch {
      const newAttempts = delivery.attempts + 1;
      const isExhausted = newAttempts >= delivery.maxAttempts;
      const backoffMs = Math.min(60000 * Math.pow(2, newAttempts - 1), 3600000);

      await db
        .update(webhookDeliveries)
        .set({
          status: isExhausted ? 'dead_letter' : 'pending',
          attempts: newAttempts,
          nextRetryAt: isExhausted ? null : new Date(Date.now() + backoffMs),
        })
        .where(eq(webhookDeliveries.id, delivery.id));
    }
  }

  return retriedCount;
}

/**
 * Lists recent deliveries for a webhook (for debugging).
 */
export async function listDeliveries(
  db: Database,
  webhookUuid: string,
  limit = 20,
): Promise<Array<{
  deliveryUuid: string;
  eventType: string;
  status: string;
  responseCode: number | null;
  attempts: number;
  createdAt: Date;
  completedAt: Date | null;
}>> {
  const rows = await db
    .select({
      deliveryUuid: webhookDeliveries.deliveryUuid,
      eventType: webhookDeliveries.eventType,
      status: webhookDeliveries.status,
      responseCode: webhookDeliveries.responseCode,
      attempts: webhookDeliveries.attempts,
      createdAt: webhookDeliveries.createdAt,
      completedAt: webhookDeliveries.completedAt,
    })
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.webhookUuid, webhookUuid))
    .orderBy(desc(webhookDeliveries.createdAt))
    .limit(limit);

  return rows.map(r => ({
    ...r,
    completedAt: r.completedAt ?? null,
    responseCode: r.responseCode ?? null,
  }));
}
