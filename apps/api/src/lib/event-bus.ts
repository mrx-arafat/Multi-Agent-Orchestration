/**
 * In-process event bus for broadcasting real-time events.
 * Services emit events here; the WebSocket plugin subscribes and
 * forwards them to connected clients. Phase 9 adds webhook delivery.
 */
import { EventEmitter } from 'node:events';

export interface RealtimeEvent {
  /** Channel determines who receives: "user:<uuid>" or "team:<uuid>" */
  channel: string;
  /** Event type, e.g. "task:created", "message:new" */
  type: string;
  /** Arbitrary payload */
  payload: Record<string, unknown>;
}

const bus = new EventEmitter();
bus.setMaxListeners(200);

export const eventBus = {
  emit(event: RealtimeEvent): void {
    bus.emit('realtime', event);
  },
  on(listener: (event: RealtimeEvent) => void): void {
    bus.on('realtime', listener);
  },
  off(listener: (event: RealtimeEvent) => void): void {
    bus.removeListener('realtime', listener);
  },
};

/** Convenience: emit to a team channel */
export function emitTeamEvent(
  teamUuid: string,
  type: string,
  payload: Record<string, unknown>,
): void {
  eventBus.emit({ channel: `team:${teamUuid}`, type, payload });
}

/** Convenience: emit to a specific agent */
export function emitAgentEvent(
  agentUuid: string,
  type: string,
  payload: Record<string, unknown>,
): void {
  eventBus.emit({ channel: `agent:${agentUuid}`, type, payload });
}

/** Convenience: emit to a specific user */
export function emitUserEvent(
  userUuid: string,
  type: string,
  payload: Record<string, unknown>,
): void {
  eventBus.emit({ channel: `user:${userUuid}`, type, payload });
}

// ── Phase 9: Webhook delivery integration ─────────────────────────────

/**
 * Registers a webhook delivery handler that fires on team events.
 * Called once during app startup when database is available.
 */
export function registerWebhookDelivery(
  deliverFn: (teamUuid: string, eventType: string, payload: Record<string, unknown>) => Promise<void>,
): void {
  eventBus.on((event) => {
    // Only deliver webhooks for team-channel events
    if (event.channel.startsWith('team:')) {
      const teamUuid = event.channel.replace('team:', '');
      deliverFn(teamUuid, event.type, event.payload).catch(() => {
        // Best-effort webhook delivery — don't crash the event bus
      });
    }
  });
}
