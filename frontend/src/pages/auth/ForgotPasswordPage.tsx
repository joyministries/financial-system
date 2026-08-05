import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authApi } from '@/api/client';
import toast from 'react-hot-toast';
import { KeyRound, Mail } from 'lucide-react';

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

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="rounded-xl bg-white p-8 shadow-lg">
          <h1 className="mb-2 text-2xl font-bold text-gray-900">Reset Password</h1>
          <p className="mb-6 text-sm text-gray-500">
            {step === 1
              ? 'Enter your account email and we will send a reset token.'
              : 'Enter the reset token from your email and your new password.'}
          </p>

          {step === 1 ? (
            <form onSubmit={requestReset} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Email</label>
                <div className="relative mt-1">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="block w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {loading ? 'Generating...' : 'Generate Reset Token'}
              </button>
            </form>
          ) : (
            <form onSubmit={resetPassword} className="space-y-4">
              {resetToken && (
                <div className="rounded-lg bg-green-50 p-3">
                  <p className="text-xs font-medium text-green-700">Reset token captured:</p>
                  <p className="mt-1 break-all font-mono text-sm text-green-800">{resetToken}</p>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700">Reset Token</label>
                <div className="relative mt-1">
                  <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={resetToken}
                    onChange={(e) => setResetToken(e.target.value)}
                    required
                    className="block w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Confirm New Password</label>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  minLength={8}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {loading ? 'Resetting...' : 'Reset Password'}
              </button>
            </form>
          )}

          <p className="mt-4 text-center text-sm text-gray-500">
            <Link to="/login" className="font-medium text-primary-600 hover:text-primary-700">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
