import { Link } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import AuthLayout from '@/components/auth/AuthLayout';

export default function PaymentSuccessPage() {
  const params = new URLSearchParams(window.location.search);
  const paymentId = params.get('payment_id') ?? '';

  return (
    <AuthLayout>
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-card">
        <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">Payment successful</h1>
        <p className="mt-2 text-sm text-slate-600">
          Your payment was received. A receipt, confirmation email and SMS will follow shortly.
        </p>
        {paymentId && (
          <p className="mt-3 rounded-lg bg-slate-50 px-4 py-2 text-xs text-slate-500">
            Payment reference: <span className="font-mono">{paymentId}</span>
          </p>
        )}
        <div className="mt-6 flex flex-col gap-3">
          <Link
            to="/parent"
            className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            Back to my dashboard
          </Link>
          <Link
            to="/receipts"
            className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            View receipts
          </Link>
        </div>
      </div>
    </AuthLayout>
  );
}
