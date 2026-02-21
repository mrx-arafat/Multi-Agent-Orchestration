import { useState, useEffect, useRef } from 'react';
import {
  listNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
  type Notification,
} from '../lib/api.js';
import { useRealtimeEvent } from '../lib/websocket.js';

const TYPE_ICONS: Record<string, string> = {
  workflow_completed: 'text-green-500',
  workflow_failed: 'text-red-500',
  task_assigned: 'text-blue-500',
  team_invite: 'text-purple-500',
  agent_offline: 'text-amber-500',
  message_received: 'text-gray-500',
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Fetch unread count on mount
  useEffect(() => {
    getUnreadNotificationCount()
      .then((data) => setUnreadCount(data.count))
      .catch(() => {});
  }, []);

  // Listen for new notifications via WebSocket
  useRealtimeEvent('notification:new', (event) => {
    const notif = event.payload as unknown as Notification;
    setNotifications((prev) => [notif, ...prev]);
    setUnreadCount((c) => c + 1);
  });

  // Close panel on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const togglePanel = async () => {
    if (!open) {
      setLoading(true);
      try {
        const result = await listNotifications({ limit: 10 });
        setNotifications(result.notifications);
      } catch {
        // Ignore
      } finally {
        setLoading(false);
      }
    }
    setOpen(!open);
  };

  const handleMarkRead = async (notificationUuid: string) => {
    try {
      await markNotificationRead(notificationUuid);
      setNotifications((prev) =>
        prev.map((n) =>
          n.notificationUuid === notificationUuid
            ? { ...n, readAt: new Date().toISOString() }
            : n,
        ),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // Ignore
    }
  };

  const handleMarkAllRead = async () => {
    try {
      const result = await markAllNotificationsRead();
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })),
      );
      setUnreadCount(0);
      void result;
    } catch {
      // Ignore
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={togglePanel}
        className="relative p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
        title="Notifications"
      >
        <svg className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-4 w-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-[10px] text-brand-600 hover:text-brand-700 font-medium"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className="px-4 py-8 text-center text-xs text-gray-400">Loading...</div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-gray-400">No notifications</div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.notificationUuid}
                  onClick={() => !n.readAt && handleMarkRead(n.notificationUuid)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                    !n.readAt ? 'bg-brand-50/30' : ''
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className={`mt-0.5 h-2 w-2 rounded-full flex-shrink-0 ${
                      !n.readAt ? 'bg-brand-500' : 'bg-transparent'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium ${!n.readAt ? 'text-gray-900' : 'text-gray-600'}`}>
                        {n.title}
                      </p>
                      {n.body && (
                        <p className="text-[10px] text-gray-400 mt-0.5 truncate">{n.body}</p>
                      )}
                      <p className="text-[10px] text-gray-300 mt-1">
                        {new Date(n.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
