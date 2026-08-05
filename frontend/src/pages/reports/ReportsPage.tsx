import { useEffect, useState } from 'react';
import { reportsApi } from '@/api/client';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

export default function ReportsPage() {
  const year = new Date().getFullYear();
  const [tab, setTab] = useState<'trends' | 'outstanding' | 'payments'>('trends');

  const [trends, setTrends] = useState<{ month: number; total: number }[]>([]);
  const [outstanding, setOutstanding] = useState<{ students_with_outstanding: number; students: { name: string; outstanding: number }[] }>({ students_with_outstanding: 0, students: [] });
  const [payments, setPayments] = useState<{ total_received: number; by_method: Record<string, number> }>({ total_received: 0, by_method: {} });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      reportsApi.paymentTrends(year).then((r) => setTrends(r.data.trends)),
      reportsApi.outstanding(year).then((r) => setOutstanding(r.data)),
      reportsApi.paymentsReceived(year).then((r) => setPayments(r.data)),
    ]).finally(() => setLoading(false));
  }, [year]);

  const tabs = [
    { key: 'trends' as const, label: 'Payment Trends' },
    { key: 'outstanding' as const, label: 'Outstanding Fees' },
    { key: 'payments' as const, label: 'Payments by Method' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Reports</h1>

      <div className="flex gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${tab === t.key ? 'bg-primary-600 text-white' : 'border border-gray-300 text-gray-700 hover:bg-gray-50'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'trends' && (
        <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
          <h2 className="mb-4 text-lg font-semibold">Monthly Payment Trends ({year})</h2>
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
            </div>
          ) : (
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={trends.map((t) => ({ name: MONTHS[t.month - 1], total: t.total }))}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip formatter={(v: number) => `R ${v.toLocaleString()}`} />
              <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          )}
        </div>
      )}

      {tab === 'outstanding' && (
        <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
          <h2 className="mb-4 text-lg font-semibold">Outstanding Fees ({outstanding.students_with_outstanding} students)</h2>
          {outstanding.students.length > 0 && (
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={outstanding.students.map((s) => ({ name: s.name, outstanding: s.outstanding }))}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip formatter={(v: number) => `R ${v.toLocaleString()}`} />
                <Bar dataKey="outstanding" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
          {outstanding.students.length === 0 && <p className="py-8 text-center text-sm text-gray-500">No outstanding fees.</p>}
        </div>
      )}

      {tab === 'payments' && (
        <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
          <h2 className="mb-4 text-lg font-semibold">Payments by Method — R {payments.total_received.toLocaleString()} total</h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={Object.entries(payments.by_method).map(([name, value]) => ({ name, value }))}
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {Object.keys(payments.by_method).map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => `R ${v.toLocaleString()}`} />
              </PieChart>
            </ResponsiveContainer>

            <div className="space-y-3">
              {Object.entries(payments.by_method).map(([method, amount], i) => (
                <div key={method} className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span className="flex-1 text-sm text-gray-700">{method}</span>
                  <span className="text-sm font-medium text-gray-900">R {amount.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
