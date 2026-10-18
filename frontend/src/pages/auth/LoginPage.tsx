import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';
import { Eye, EyeOff } from 'lucide-react';
import AuthLayout from '@/components/auth/AuthLayout';

/**
 * Turn a sign-in failure into something the user can act on.
 *
 * A blocked request (offline, or the API rejecting this site's origin) has no
 * `response` at all — reporting that as "invalid credentials" sends people off
 * hunting for the wrong password. The same is true for the 429 the login rate
 * limiter returns, whose body is `{error}` rather than `{detail}`.
 */
export function loginErrorMessage(err: unknown): string {
  const e = err as {
    response?: { status?: number; data?: { detail?: unknown; error?: unknown } };
  };
  const res = e?.response;
  const status = res?.status ?? 0;
  if (!res) {
    return "Can't reach the server. Check your connection and try again.";
  }
  const { detail, error } = res.data ?? {};
  if (status === 429) {
    const limit = typeof error === 'string' ? error.replace(/^Rate limit exceeded:\s*/, '') : '';
    return `Too many sign-in attempts${limit ? ` (${limit})` : ''}. Please wait a minute and try again.`;
  }
  if (status === 401) {
    return typeof detail === 'string' && detail !== 'Invalid credentials'
      ? detail
      : 'Incorrect email/phone or password.';
  }
  if (status >= 500) {
    return 'The server had a problem. Please try again in a moment.';
  }
  return typeof detail === 'string' ? detail : 'Sign-in failed. Please try again.';
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email.trim(), password);
      toast.success('Logged in');
      navigate('/');
    } catch (err) {
      toast.error(loginErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-card">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Welcome back</h1>
        <p className="mt-1 text-sm text-slate-500">Sign in to manage school finances.</p>

        <form onSubmit={handleSubmit} className="mt-7 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">Email or phone number</label>
            <input
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
              placeholder="you@example.com or 082 123 4567"
              className="mt-1.5 block w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm shadow-sm transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Password</label>
            <div className="relative mt-1.5">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="block w-full rounded-xl border border-slate-300 px-3.5 py-2.5 pr-11 text-sm shadow-sm transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400 transition-colors hover:text-slate-600"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary w-full"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <div className="mt-5 flex items-center justify-between text-sm">
          <Link
            to="/forgot-password"
            className="font-medium text-primary-600 transition-colors hover:text-primary-700"
          >
            Forgot password?
          </Link>
          <Link
            to="/register"
            className="font-medium text-primary-600 transition-colors hover:text-primary-700"
          >
            Create a parent account
          </Link>
        </div>
      </div>
    </AuthLayout>
  );
}
