/**
 * WebSocket client — connects to the MAOF real-time event stream.
 * Provides React context and hooks for consuming events in components.
 *
 * Auto-connects on auth, disconnects on logout.
 * Reconnects with exponential backoff on disconnection.
 */
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { getStoredAccessToken } from './api.js';

export interface WsEvent {
  type: string;
  payload: Record<string, unknown>;
}

type EventHandler = (event: WsEvent) => void;

interface WebSocketContextValue {
  /** Whether the WebSocket is currently connected */
  connected: boolean;
  /** Subscribe to team events */
  subscribe: (channels: string[]) => void;
  /** Unsubscribe from team events */
  unsubscribe: (channels: string[]) => void;
  /** Register a handler for a specific event type. Returns unsubscribe fn. */
  onEvent: (type: string, handler: EventHandler) => () => void;
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

const WS_BASE = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/api/ws`;
const MAX_RECONNECT_DELAY = 30000;

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<Map<string, Set<EventHandler>>>(new Map());
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelayRef = useRef(1000);
  const mountedRef = useRef(true);

  const dispatch = useCallback((event: WsEvent) => {
    const handlers = handlersRef.current.get(event.type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event);
        } catch {
          // Prevent handler errors from breaking the stream
        }
      }
    }
    // Also dispatch to wildcard listeners
    const wildcardHandlers = handlersRef.current.get('*');
    if (wildcardHandlers) {
      for (const handler of wildcardHandlers) {
        try {
          handler(event);
        } catch {
          // Prevent handler errors from breaking the stream
        }
      }
    }
  }, []);

  const connect = useCallback(() => {
    const token = getStoredAccessToken();
    if (!token || !mountedRef.current) return;

    // Close existing connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    const ws = new WebSocket(`${WS_BASE}?token=${token}`);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      setConnected(true);
      reconnectDelayRef.current = 1000; // Reset backoff
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string) as WsEvent;
        dispatch(data);
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setConnected(false);
      wsRef.current = null;

      // Reconnect with exponential backoff
      const delay = reconnectDelayRef.current;
      reconnectDelayRef.current = Math.min(delay * 2, MAX_RECONNECT_DELAY);
      reconnectTimerRef.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      // onclose will fire after onerror
    };
  }, [dispatch]);

  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current!);
      reconnectTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnected(false);
  }, []);

  // Connect when component mounts (token exists) and clean up on unmount
  useEffect(() => {
    mountedRef.current = true;
    const token = getStoredAccessToken();
    if (token) connect();

    return () => {
      mountedRef.current = false;
      disconnect();
    };
  }, [connect, disconnect]);

  const subscribe = useCallback((channels: string[]) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'subscribe', channels }));
    }
  }, []);

  const unsubscribe = useCallback((channels: string[]) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'unsubscribe', channels }));
    }
  }, []);

  const onEvent = useCallback((type: string, handler: EventHandler) => {
    if (!handlersRef.current.has(type)) {
      handlersRef.current.set(type, new Set());
    }
    handlersRef.current.get(type)!.add(handler);

    // Return cleanup function
    return () => {
      handlersRef.current.get(type)?.delete(handler);
    };
  }, []);

  return (
    <WebSocketContext.Provider value={{ connected, subscribe, unsubscribe, onEvent }}>
      {children}
    </WebSocketContext.Provider>
  );
}

/** Hook to access the WebSocket context */
export function useWebSocket(): WebSocketContextValue {
  const ctx = useContext(WebSocketContext);
  if (!ctx) throw new Error('useWebSocket must be used within WebSocketProvider');
  return ctx;
}

/**
 * Hook to subscribe to a team's real-time events.
 * Automatically subscribes on mount and unsubscribes on unmount.
 */
export function useTeamEvents(teamUuid: string | undefined): void {
  const { subscribe, unsubscribe } = useWebSocket();

  useEffect(() => {
    if (!teamUuid) return;
    const channel = `team:${teamUuid}`;
    subscribe([channel]);
    return () => unsubscribe([channel]);
  }, [teamUuid, subscribe, unsubscribe]);
}

/**
 * Hook to listen for a specific event type.
 * Calls the handler whenever the event fires.
 */
export function useRealtimeEvent(type: string, handler: EventHandler): void {
  const { onEvent } = useWebSocket();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    return onEvent(type, (event) => handlerRef.current(event));
  }, [type, onEvent]);
}
