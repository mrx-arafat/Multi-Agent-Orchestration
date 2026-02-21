/**
 * In-process event bus for broadcasting real-time events.
 * Services emit events here; the WebSocket plugin subscribes and
 * forwards them to connected clients.
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

/** Convenience: emit to a specific user */
export function emitUserEvent(
  userUuid: string,
  type: string,
  payload: Record<string, unknown>,
): void {
  eventBus.emit({ channel: `user:${userUuid}`, type, payload });
}
