import { useEffect, useState } from 'react';
import { usersApi } from '@/api/client';
import type { User } from '@/types';
import toast from 'react-hot-toast';
import { Loader2, Shield, ShieldCheck, Users, Search } from 'lucide-react';

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  finance: 'Finance',
};

const ROLE_COLORS: Record<string, string> = {
  super_admin: 'bg-purple-100 text-purple-700',
  admin: 'bg-blue-100 text-blue-700',
  finance: 'bg-emerald-100 text-emerald-700',
};

export default function UserAccountsPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const { data } = await usersApi.listStaff();
      setUsers(data);
    } catch {
      toast.error('Failed to load user accounts');
    } finally {
      setLoading(false);
    }
  };

  const filtered = users.filter(
    (u) =>
      u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.role.toLowerCase().includes(search.toLowerCase()),
  );

  const superAdmins = filtered.filter((u) => u.role === 'super_admin');
  const admins = filtered.filter((u) => u.role === 'admin');
  const financeUsers = filtered.filter((u) => u.role === 'finance');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Staff Accounts
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Admin and finance users who manage the platform
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Users className="h-4 w-4" />
          <span className="font-medium">{users.length}</span> accounts
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Search by name, email, or role..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          <span className="ml-2 text-sm text-slate-500">Loading accounts...</span>
        </div>
      )}

      {/* User cards */}
      {!loading && (
        <div className="space-y-8">
          {/* Super Admins */}
          {superAdmins.length > 0 && (
            <section>
              <div className="mb-3 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-purple-500" />
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Super Admins
                </h2>
                <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                  {superAdmins.length}
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {superAdmins.map((u) => (
                  <UserCard key={u.id} user={u} />
                ))}
              </div>
            </section>
          )}

          {/* Admins */}
          {admins.length > 0 && (
            <section>
              <div className="mb-3 flex items-center gap-2">
                <Shield className="h-4 w-4 text-blue-500" />
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Admins
                </h2>
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                  {admins.length}
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {admins.map((u) => (
                  <UserCard key={u.id} user={u} />
                ))}
              </div>
            </section>
          )}

          {/* Finance */}
          {financeUsers.length > 0 && (
            <section>
              <div className="mb-3 flex items-center gap-2">
                <Users className="h-4 w-4 text-emerald-500" />
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Finance
                </h2>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  {financeUsers.length}
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {financeUsers.map((u) => (
                  <UserCard key={u.id} user={u} />
                ))}
              </div>
            </section>
          )}

          {/* Empty state */}
          {filtered.length === 0 && (
            <div className="rounded-lg border border-slate-200 bg-white py-12 text-center">
              <Users className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-2 text-sm text-slate-500">
                {search
                  ? 'No accounts match your search.'
                  : 'No staff accounts found.'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function UserCard({ user }: { user: User }) {
  const initials = user.full_name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 transition-colors hover:bg-slate-50">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-900">{user.full_name}</p>
          <p className="truncate text-xs text-slate-500">{user.email}</p>
          {user.phone && (
            <p className="mt-0.5 text-xs text-slate-400">{user.phone}</p>
          )}
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[user.role] || 'bg-slate-100 text-slate-600'}`}
        >
          {ROLE_LABELS[user.role] || user.role}
        </span>
      </div>
      <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3 text-xs text-slate-400">
        <span
          className={`h-1.5 w-1.5 rounded-full ${user.is_active ? 'bg-green-500' : 'bg-red-400'}`}
        />
        {user.is_active ? 'Active' : 'Inactive'}
      </div>
    </div>
  );
}
