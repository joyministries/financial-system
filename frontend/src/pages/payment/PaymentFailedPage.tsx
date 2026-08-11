import { Link } from 'react-router-dom';
import { XCircle } from 'lucide-react';
import AuthLayout from '@/components/auth/AuthLayout';

export default function PaymentFailedPage() {
  const params = new URLSearchParams(window.location.search);
  const paymentId = params.get('payment_id') ?? '';

  return (
    <AuthLayout>
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-card">
        <XCircle className="mx-auto h-14 w-14 text-rose-500" />
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">Payment cancelled</h1>
        <p className="mt-2 text-sm text-slate-600">
          No money was taken. If you still want to pay, you can try again from your dashboard.
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
            to="/parent"
            className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Try paying again
          </Link>
        </div>
      </div>
    </AuthLayout>
  );
}
