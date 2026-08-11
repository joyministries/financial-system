import { useEffect, useState } from 'react';
import { authApi } from '@/api/client';
import { useAuth } from '@/contexts/AuthContext';
import type { User } from '@/types';
import toast from 'react-hot-toast';
import { Loader2, Mail, Phone, UserRound } from 'lucide-react';

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authApi
      .me()
      .then((r) => {
        const u = r.data as User;
        setFullName(u.full_name || '');
        setEmail(u.email || '');
        setPhone(u.phone || '');
      })
      .catch(() => toast.error('Failed to load your profile'))
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) return toast.error('Name cannot be empty');
    if (!email.trim()) return toast.error('Email cannot be empty');
    setSaving(true);
    try {
      await authApi.updateMe({
        full_name: fullName.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
      });
      toast.success('Profile updated');
      refreshUser?.();
    } catch {
      toast.error('Failed to update profile — is that email already in use?');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">My Profile</h1>

      <div className="rounded-xl bg-white p-6 shadow-sm border border-slate-100">
        <div className="mb-5 flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#131d3c] text-lg font-bold text-white">
            {(fullName || user?.full_name || '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()}
          </div>
          <div>
            <p className="text-lg font-semibold text-slate-900">{user?.full_name}</p>
            <p className="text-sm capitalize text-slate-500">{user?.role === 'super_admin' ? 'Administrator' : user?.role}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">Full name</label>
            <div className="relative mt-1">
              <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} required className="input pl-9" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Email address</label>
            <div className="relative mt-1">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="input pl-9" />
            </div>
            <p className="mt-1 text-xs text-slate-500">
              This is your login email. If you change it, use the new email to sign in next time.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Phone number</label>
            <div className="relative mt-1">
              <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+27 …" className="input pl-9" />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="submit" disabled={saving} className="btn btn-primary">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
