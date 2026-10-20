import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Loader2, Trash2, ShieldCheck, FileText } from 'lucide-react';
import AuthLayout from '@/components/auth/AuthLayout';
import { useAuth } from '@/contexts/AuthContext';
import { deletionApi } from '@/api/client';

/**
 * PUBLIC page (no auth required) — the POPIA erasure channel.
 *
 * Anyone can ask for a data subject's account to be deleted without logging
 * in (a parent may have lost access to the account). The server returns the
 * SAME acknowledgement whether or not the email exists, and this page shows a
 * fixed message too — so the form can never be used to confirm account
 * existence.
 */
export default function DataDeletionPage() {
  const { user } = useAuth();
  const [email, setEmail] = useState(user?.email || '');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return toast.error('Enter the email you want deleted');
    setLoading(true);
    try {
      await deletionApi.submitRequest({ email: email, reason: reason || undefined });
      setSubmitted(true);
      // The confirmation is intentionally the same in every case.
    } catch {
      toast.error('Something went wrong. Please try again or contact the school office.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <div className="rounded-xl border border-line bg-white p-8 shadow-card">
        <div className="mb-1 flex items-center gap-2 text-accent-600">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">
          Request deletion of your information
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Under the Protection of Personal Information Act (POPIA) you may ask the
          school to erase your account and personal details from the parent portal.
        </p>

        {submitted ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-xl border border-[#cfe3d8] bg-[#eef6f1] p-4">
              <p className="text-sm font-medium text-[#176641]">Your request has been received.</p>
              <p className="mt-1 text-sm leading-relaxed text-[#1c7a4f]">
                The school will process it within 10 working days. If approved, your
                login, name, contact details and any other personal information will
                be removed from the portal.
              </p>
            </div>
            <ol className="list-inside list-decimal space-y-1.5 text-sm text-muted">
              <li>The request is reviewed by the school office.</li>
              <li>
                If approved, your account and personal data are deleted — you will no
                longer be able to sign in.
              </li>
              <li>
                Financial records (payments, receipts and statements) are kept, as the
                law requires the school to retain them for audit and accounting purposes.
              </li>
            </ol>
            <div className="flex flex-wrap gap-3 pt-2">
              <Link to="/login" className="btn btn-primary">Back to sign in</Link>
              <Link to="/privacy" className="btn btn-outline">Read our Privacy Policy</Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-body">Email address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder={user?.email ? user.email : 'you@example.co.za'}
                className="mt-1.5 block w-full rounded-xl border border-[#d8d2c4] px-3.5 py-2.5 text-sm shadow-sm transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              />
              <p className="mt-1 text-xs text-muted">
                The email on the account you want removed.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-body">
                Reason <span className="font-normal text-faint">(optional)</span>
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="e.g. My child has left the school."
                className="mt-1.5 block w-full rounded-xl border border-[#d8d2c4] px-3.5 py-2.5 text-sm shadow-sm transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              />
            </div>
            <button type="submit" disabled={loading} className="btn btn-primary w-full">
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Submit deletion request
            </button>
            <p className="flex items-center gap-1.5 text-xs text-faint">
              <FileText className="h-3.5 w-3.5" />
              Read the{' '}
              <Link to="/privacy" className="font-medium text-primary-800 hover:text-primary-800">
                privacy policy
              </Link>{' '}
              to see what we keep and why.
            </p>
          </form>
        )}
      </div>
    </AuthLayout>
  );
}