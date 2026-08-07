import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authApi } from '@/api/client';
import toast from 'react-hot-toast';
import { KeyRound, Mail } from 'lucide-react';
import AuthLayout from '@/components/auth/AuthLayout';

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const requestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await authApi.forgotPassword(email);
      toast.success(res.data.detail);
      // The reset token is never returned by the API. It is delivered out of
      // band (email in production). We keep step 2 so the user can paste the
      // token they received.
      setStep(2);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirm) return toast.error('Passwords do not match');
    setLoading(true);
    try {
      await authApi.resetPassword(resetToken, newPassword);
      toast.success('Password reset — sign in with your new password');
      navigate('/login');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Reset failed');
    } finally {
      setLoading(false);
    }
  };

  const inputCls =
    'block w-full rounded-xl border border-slate-300 py-2.5 text-sm shadow-sm transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20';
  const btnCls =
    'btn btn-primary w-full';

  return (
    <AuthLayout>
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-card">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Reset Password</h1>
        <p className="mt-1 text-sm text-slate-500">
          {step === 1
            ? 'Enter your account email and we will send a reset token.'
            : 'Enter the reset token from your email and your new password.'}
        </p>

        {step === 1 ? (
          <form onSubmit={requestReset} className="mt-7 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">Email</label>
              <div className="relative mt-1.5">
                <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className={`${inputCls} pl-10`}
                />
              </div>
            </div>
            <button type="submit" disabled={loading} className={btnCls}>
              {loading ? 'Generating…' : 'Generate Reset Token'}
            </button>
          </form>
        ) : (
          <form onSubmit={resetPassword} className="mt-7 space-y-4">
            {resetToken && (
              <div className="rounded-lg bg-green-50 p-3">
                <p className="text-xs font-medium text-green-700">Reset token captured:</p>
                <p className="mt-1 break-all font-mono text-sm text-green-800">{resetToken}</p>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-700">Reset Token</label>
              <div className="relative mt-1.5">
                <KeyRound className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={resetToken}
                  onChange={(e) => setResetToken(e.target.value)}
                  required
                  className={`${inputCls} pl-10`}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                className={`${inputCls} mt-1.5`}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Confirm New Password</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={8}
                className={`${inputCls} mt-1.5`}
              />
            </div>
            <button type="submit" disabled={loading} className={btnCls}>
              {loading ? 'Resetting…' : 'Reset Password'}
            </button>
          </form>
        )}

        <p className="mt-5 text-center text-sm text-slate-500">
          <Link to="/login" className="font-medium text-primary-600 transition-colors hover:text-primary-700">
            Back to sign in
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
