import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { authApi } from '@/api/client';
import BrandMark from '@/components/Brand';
import toast from 'react-hot-toast';

export default function ForcePasswordChangePage() {
  const { logout, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    setLoading(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      await refreshUser();
      toast.success('Password changed successfully!');
      navigate('/', { replace: true });
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Failed to change password';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen justify-center bg-paper px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-7 flex items-center gap-3">
          <BrandMark className="h-10 w-10 text-lg" />
          <div>
            <p className="text-[13.5px] font-bold leading-tight text-ink">Lambton Christian School</p>
            <p className="mt-0.5 font-mono text-[9.5px] uppercase tracking-[0.18em] text-muted">
              Finance Portal
            </p>
          </div>
        </div>

        <div className="card p-6 sm:p-7">
          <p className="eyebrow">Account security</p>
          <h1 className="page-title mt-1 text-[22px]">Change your password</h1>
          <p className="page-subtitle">
            For security, you must replace your temporary password before continuing.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="label mb-1.5" htmlFor="current-password">Current password</label>
              <input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="input"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="label mb-1.5" htmlFor="new-password">New password</label>
              <input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="input"
                required
                minLength={8}
              />
              <p className="hint mt-1">At least 8 characters.</p>
            </div>
            <div>
              <label className="label mb-1.5" htmlFor="confirm-password">Confirm new password</label>
              <input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="input"
                required
                minLength={8}
              />
            </div>
            <button type="submit" disabled={loading} className="btn btn-primary w-full">
              {loading ? 'Changing…' : 'Change password'}
            </button>
          </form>

          <button
            onClick={logout}
            className="mt-3 w-full py-2 text-[12.5px] text-muted transition-colors hover:text-ink"
          >
            Sign out instead
          </button>
        </div>
      </div>
    </div>
  );
}
