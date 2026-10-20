import { useCallback, useEffect, useState } from 'react';
import { notificationsApi } from '@/api/client';
import { useAuth } from '@/contexts/AuthContext';
import type { NotificationHistoryItem } from '@/types';
import { toast } from 'react-hot-toast';
import {
  Bell,
  Search,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock,
  Mail,
  User,
  GraduationCap,
  CreditCard,
  AlertTriangle,
  Cog,
} from 'lucide-react';

const CATEGORY_CONFIG: Record<string, { label: string; icon: typeof Bell; color: string }> = {
  payment_received: { label: 'Payment', icon: CreditCard, color: 'text-[#1c7a4f] bg-[#eef6f1]' },
  parent_registered: { label: 'Registration', icon: User, color: 'text-primary-600 bg-[#f4f6f9]' },
  student_applied: { label: 'Application', icon: GraduationCap, color: 'text-[#8a6f13] bg-[#fbf4e2]' },
  payment_reversed: { label: 'Reversal', icon: AlertTriangle, color: 'text-[#a8382c] bg-[#fbeeec]' },
  system: { label: 'System', icon: Cog, color: 'text-muted bg-[#faf8f2]' },
};

const ROLE_OPTIONS = [
  { value: '', label: 'All roles' },
  { value: 'parent', label: 'Parents' },
  { value: 'admin', label: 'Admins' },
  { value: 'finance', label: 'Finance' },
];

const CATEGORY_OPTIONS = [
  { value: '', label: 'All categories' },
  { value: 'payment_received', label: 'Payments' },
  { value: 'parent_registered', label: 'Registrations' },
  { value: 'student_applied', label: 'Applications' },
  { value: 'payment_reversed', label: 'Reversals' },
  { value: 'system', label: 'System' },
];

const PAGE_SIZE = 20;

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function NotificationHistoryPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'finance';

  const [items, setItems] = useState<NotificationHistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  // Debounced search
  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Reset page on filter change
  useEffect(() => { setPage(0); }, [category, roleFilter, search]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await notificationsApi.history({
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        category: category || undefined,
        recipient_role: roleFilter || undefined,
        search: search || undefined,
      });
      setItems(res.data.items);
      setTotal(res.data.total);
    } catch {
      toast.error('Failed to load notification history');
    } finally {
      setLoading(false);
    }
  }, [page, category, roleFilter, search]);

  useEffect(() => { loadData(); }, [loadData]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-ink">Notification History</h1>
        <p className="text-sm text-muted">
          {isAdmin
            ? 'All notifications sent across the system'
            : 'Notifications you have received'}
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 rounded-xl border border-line bg-white p-4 shadow-sm sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input
            type="text"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Search title, message, or recipient..."
            className="input pl-9 py-2 text-sm w-full"
          />
        </div>
        <select value={category} onChange={e => setCategory(e.target.value)} className="input py-2 text-sm w-full sm:w-44">
          {CATEGORY_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {isAdmin && (
          <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} className="input py-2 text-sm w-full sm:w-40">
            {ROLE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        )}
      </div>

      {/* List */}
      <div className="rounded-xl border border-line bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-faint">
            <Bell className="mb-3 h-10 w-10 text-line" />
            <p className="font-medium">No notifications found</p>
            <p className="mt-1 text-sm">Try adjusting your filters</p>
          </div>
        ) : (
          <div className="divide-y divide-line-soft">
            {items.map(item => {
              const config = CATEGORY_CONFIG[item.category] || CATEGORY_CONFIG.system;
              const Icon = config.icon;
              return (
                <div key={item.id} className="flex items-start gap-4 px-6 py-4 hover:bg-[#fdfbf5]">
                  <div className={`mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${config.color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink">{item.title}</p>
                        <p className="mt-0.5 text-sm text-muted line-clamp-2">{item.message}</p>
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-2">
                        {!item.is_read && (
                          <span className="inline-flex items-center rounded-full bg-[#fbf4e2] px-2 py-0.5 text-xs font-medium text-[#8a6f13]">
                            Unread
                          </span>
                        )}
                        {item.is_read && (
                          <CheckCircle2 className="h-4 w-4 text-[#1c7a4f]" />
                        )}
                      </div>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-faint">
                      {isAdmin && item.recipient_name && (
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {item.recipient_name}
                          {item.recipient_role && (
                            <span className="rounded bg-[#f3efe6] px-1.5 py-0.5 text-[10px] font-medium text-muted">
                              {item.recipient_role}
                            </span>
                          )}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {timeAgo(item.created_at)}
                      </span>
                      {item.read_at && (
                        <span className="flex items-center gap-1 text-[#1c7a4f]">
                          <Mail className="h-3 w-3" />
                          Read {timeAgo(item.read_at)}
                        </span>
                      )}
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${config.color}`}>
                        {config.label}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-line px-6 py-3">
            <p className="text-sm text-muted">
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
            </p>
            <div className="flex gap-1">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted hover:bg-[#f3efe6] disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const start = Math.max(0, Math.min(page - 2, totalPages - 5));
                const p = start + i;
                if (p >= totalPages) return null;
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                      p === page
                        ? 'bg-primary-500 text-white'
                        : 'text-muted hover:bg-[#f3efe6]'
                    }`}
                  >
                    {p + 1}
                  </button>
                );
              })}
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted hover:bg-[#f3efe6] disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
