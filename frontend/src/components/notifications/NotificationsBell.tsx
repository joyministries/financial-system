import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck, Inbox, RefreshCw } from 'lucide-react';
import clsx from 'clsx';
import { notificationsApi } from '@/api/client';
import type { AppNotification } from '@/types';

const POLL_INTERVAL_MS = 30_000;

const categoryDot: Record<string, string> = {
  payment_received: 'bg-emerald-500',
  parent_registered: 'bg-blue-500',
  student_applied: 'bg-amber-500',
  payment_reversed: 'bg-rose-500',
  system: 'bg-slate-400',
};

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'yesterday' : `${days}d ago`;
}

export default function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const [listRes, unreadRes] = await Promise.all([
        notificationsApi.list({ limit: 15 }),
        notificationsApi.unreadCount(),
      ]);
      setItems(listRes.data.items);
      setUnread(unreadRes.data.count);
    } catch {
      // Silent — the bell must never break the header on transient errors.
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  // Close when clicking outside the panel.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const markOneRead = async (id: string) => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    setUnread((prev) => Math.max(0, prev - 1));
    try {
      await notificationsApi.markRead(id);
    } catch {
      refresh();
    }
  };

  const markAllRead = async () => {
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnread(0);
    try {
      await notificationsApi.markAllRead();
    } catch {
      refresh();
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-50 w-[22rem] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-900">Notifications</h3>
              {unread > 0 && (
                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-600">
                  {unread} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  setLoading(true);
                  refresh().finally(() => setLoading(false));
                }}
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                aria-label="Refresh"
                title="Refresh"
              >
                <RefreshCw className={clsx('h-4 w-4', loading && 'animate-spin')} />
              </button>
              {unread > 0 && (
                <button
                  onClick={markAllRead}
                  className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Mark all read
                </button>
              )}
            </div>
          </div>

          <div className="max-h-[24rem] overflow-y-auto">
            {items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <Inbox className="h-8 w-8 text-slate-300" />
                <p className="text-sm text-slate-500">No notifications yet.</p>
                <p className="text-xs text-slate-400">
                  Payments, registrations and reversals will show up here.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {items.map((n) => (
                  <li key={n.id}>
                    <button
                      onClick={() => !n.is_read && markOneRead(n.id)}
                      className={clsx(
                        'flex w-full gap-3 px-4 py-3 text-left transition-colors',
                        n.is_read ? 'bg-white' : 'bg-slate-50',
                        !n.is_read && 'hover:bg-slate-100'
                      )}
                    >
                      <span
                        className={clsx(
                          'mt-1.5 h-2 w-2 flex-shrink-0 rounded-full',
                          categoryDot[n.category] || categoryDot.system,
                          n.is_read && 'opacity-30'
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-slate-900">
                          {n.title}
                        </span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-slate-600">
                          {n.message}
                        </span>
                        <span className="mt-1 block text-[11px] text-slate-400">
                          {relativeTime(n.created_at)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
