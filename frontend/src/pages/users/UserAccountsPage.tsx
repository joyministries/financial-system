import { useEffect, useState } from 'react';
import { usersApi } from '@/api/client';
import type { User } from '@/types';
import toast from 'react-hot-toast';
import {
  Loader2,
  Shield,
  ShieldCheck,
  Users,
  Search,
  Plus,
  Pencil,
  Trash2,
  KeyRound,
  X,
} from 'lucide-react';

type FormMode = 'create' | 'edit' | null;

interface FormData {
  email: string;
  password: string;
  full_name: string;
  phone: string;
  role: 'admin' | 'finance' | 'super_admin';
}

const EMPTY_FORM: FormData = {
  email: '',
  password: '',
  full_name: '',
  phone: '',
  role: 'admin',
};

export default function UserAccountsPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [formMode, setFormMode] = useState<FormMode>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [editId, setEditId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetSubmitting, setResetSubmitting] = useState(false);

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

  const openCreate = () => {
    setFormMode('create');
    setForm(EMPTY_FORM);
    setEditId(null);
  };

  const openEdit = (user: User) => {
    setFormMode('edit');
    setForm({
      email: user.email,
      password: '',
      full_name: user.full_name,
      phone: user.phone || '',
      role: user.role as 'admin' | 'finance' | 'super_admin',
    });
    setEditId(user.id);
  };

  const closeForm = () => {
    setFormMode(null);
    setForm(EMPTY_FORM);
    setEditId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (formMode === 'create') {
        await usersApi.create({
          email: form.email,
          password: form.password,
          full_name: form.full_name,
          phone: form.phone || undefined,
          role: form.role,
        });
        toast.success('Account created');
      } else if (formMode === 'edit' && editId) {
        await usersApi.update(editId, {
          email: form.email,
          full_name: form.full_name,
          phone: form.phone || undefined,
          role: form.role,
        });
        toast.success('Account updated');
      }
      closeForm();
      loadUsers();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeactivate = async (user: User) => {
    if (!confirm(`Deactivate ${user.full_name}'s account?`)) return;
    try {
      await usersApi.deactivate(user.id);
      toast.success(`Account ${user.email} deactivated`);
      loadUsers();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to deactivate');
    }
  };

  const handleReactivate = async (user: User) => {
    try {
      await usersApi.update(user.id, { is_active: true });
      toast.success(`Account ${user.email} reactivated`);
      loadUsers();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to reactivate');
    }
  };

  const openResetPassword = (userId: string) => {
    setResetUserId(userId);
    setNewPassword('');
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetUserId || !newPassword) return;
    setResetSubmitting(true);
    try {
      await usersApi.resetPassword(resetUserId, newPassword);
      toast.success('Password reset');
      setResetUserId(null);
      setNewPassword('');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to reset password');
    } finally {
      setResetSubmitting(false);
    }
  };

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
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Users className="h-4 w-4" />
            <span className="font-medium">{users.length}</span> accounts
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            <Plus className="h-4 w-4" />
            Create account
          </button>
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
          {superAdmins.length > 0 && (
            <UserSection
              title="Super Admins"
              icon={<ShieldCheck className="h-4 w-4 text-purple-500" />}
              color="purple"
              users={superAdmins}
              onEdit={openEdit}
              onDeactivate={handleDeactivate}
              onReactivate={handleReactivate}
              onResetPassword={openResetPassword}
            />
          )}
          {admins.length > 0 && (
            <UserSection
              title="Admins"
              icon={<Shield className="h-4 w-4 text-blue-500" />}
              color="blue"
              users={admins}
              onEdit={openEdit}
              onDeactivate={handleDeactivate}
              onReactivate={handleReactivate}
              onResetPassword={openResetPassword}
            />
          )}
          {financeUsers.length > 0 && (
            <UserSection
              title="Finance"
              icon={<Users className="h-4 w-4 text-emerald-500" />}
              color="emerald"
              users={financeUsers}
              onEdit={openEdit}
              onDeactivate={handleDeactivate}
              onReactivate={handleReactivate}
              onResetPassword={openResetPassword}
            />
          )}
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

      {/* Create / Edit modal */}
      {formMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                {formMode === 'create' ? 'Create account' : 'Edit account'}
              </h2>
              <button onClick={closeForm} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Full name</label>
                <input
                  type="text"
                  required
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Email</label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Phone (optional)</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Role</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as FormData['role'] })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="admin">Admin</option>
                  <option value="finance">Finance</option>
                  <option value="super_admin">Super Admin</option>
                </select>
              </div>
              {formMode === 'create' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700">Password</label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <p className="mt-1 text-xs text-slate-400">Minimum 8 characters</p>
                </div>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {formMode === 'create' ? 'Create account' : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset password modal */}
      {resetUserId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Reset password</h2>
              <button onClick={() => setResetUserId(null)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">New password</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <p className="mt-1 text-xs text-slate-400">Minimum 8 characters</p>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setResetUserId(null)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resetSubmitting}
                  className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {resetSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Reset password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function UserSection({
  title,
  icon,
  color,
  users,
  onEdit,
  onDeactivate,
  onReactivate,
  onResetPassword,
}: {
  title: string;
  icon: React.ReactNode;
  color: string;
  users: User[];
  onEdit: (user: User) => void;
  onDeactivate: (user: User) => void;
  onReactivate: (user: User) => void;
  onResetPassword: (userId: string) => void;
}) {
  const badgeColor =
    color === 'purple'
      ? 'bg-purple-100 text-purple-700'
      : color === 'blue'
        ? 'bg-blue-100 text-blue-700'
        : 'bg-emerald-100 text-emerald-700';

  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          {title}
        </h2>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badgeColor}`}>
          {users.length}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {users.map((u) => (
          <UserCard
            key={u.id}
            user={u}
            onEdit={() => onEdit(u)}
            onDeactivate={() => onDeactivate(u)}
            onReactivate={() => onReactivate(u)}
            onResetPassword={() => onResetPassword(u.id)}
          />
        ))}
      </div>
    </section>
  );
}

function UserCard({
  user,
  onEdit,
  onDeactivate,
  onReactivate,
  onResetPassword,
}: {
  user: User;
  onEdit: () => void;
  onDeactivate: () => void;
  onReactivate: () => void;
  onResetPassword: () => void;
}) {
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
          {user.phone && <p className="mt-0.5 text-xs text-slate-400">{user.phone}</p>}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span
            className={`h-1.5 w-1.5 rounded-full ${user.is_active ? 'bg-green-500' : 'bg-red-400'}`}
          />
          {user.is_active ? 'Active' : 'Inactive'}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onEdit}
            title="Edit account"
            className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onResetPassword}
            title="Reset password"
            className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <KeyRound className="h-3.5 w-3.5" />
          </button>
          {user.is_active ? (
            <button
              onClick={onDeactivate}
              title="Deactivate account"
              className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              onClick={onReactivate}
              title="Reactivate account"
              className="rounded p-1.5 text-slate-400 hover:bg-green-50 hover:text-green-600"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
