import { useEffect, useState } from 'react';
import { reportsApi } from '@/api/client';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { DollarSign, AlertTriangle, Users, TrendingUp, ArrowRightCircle } from 'lucide-react';
import type { CarryForwardReport } from '@/types';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function DashboardPage() {
  const year = new Date().getFullYear();
  const [trends, setTrends] = useState<{ month: number; total: number }[]>([]);
  const [outstanding, setOutstanding] = useState({ students_with_outstanding: 0, students: [] as { outstanding: number }[] });
  const [income, setIncome] = useState({ total_income: 0, payment_count: 0 });
  const [carryForward, setCarryForward] = useState<CarryForwardReport | null>(null);
  const [cfYear, setCfYear] = useState(year);
  const [cfMonth, setCfMonth] = useState(new Date().getMonth() + 1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const loadDashboard = async () => {
      try {
        const [trendsRes, outstandingRes, ...monthlyRes] = await Promise.all([
          reportsApi.paymentTrends(year),
          reportsApi.outstanding(year),
          ...Array.from({ length: 12 }, (_, i) => reportsApi.monthlyIncome(year, i + 1)),
        ]);

        if (cancelled) return;

        setTrends(trendsRes.data.trends);
        setOutstanding(outstandingRes.data);

        const totalIncome = monthlyRes.reduce((sum, r) => sum + (r.data?.total_income ?? 0), 0);
        const totalCount = monthlyRes.reduce((sum, r) => sum + (r.data?.payment_count ?? 0), 0);
        setIncome({ total_income: totalIncome, payment_count: totalCount });
      } catch {
        // handled by axios interceptor
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadDashboard();
    return () => { cancelled = true; };
  }, [year]);

  useEffect(() => {
    let cancelled = false;
    reportsApi.carryForward(cfYear, cfMonth)
      .then((r: { data: CarryForwardReport }) => { if (!cancelled) setCarryForward(r.data); })
      .catch(() => { if (!cancelled) setCarryForward(null); });
    return () => { cancelled = true; };
  }, [cfYear, cfMonth]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  const totalOutstanding = outstanding.students.reduce((s, x) => s + x.outstanding, 0);
  const cfTotal = carryForward?.outstanding.reduce((s, x) => s + x.balance, 0) ?? 0;

  const stats = [
    { label: 'Total Income', value: `R ${income.total_income.toLocaleString()}`, icon: DollarSign, color: 'bg-green-500' },
    { label: 'Outstanding', value: `R ${totalOutstanding.toLocaleString()}`, icon: AlertTriangle, color: 'bg-red-500' },
    { label: 'Students Owing', value: outstanding.students_with_outstanding, icon: Users, color: 'bg-yellow-500' },
    { label: 'Payments Made', value: income.payment_count, icon: TrendingUp, color: 'bg-blue-500' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
            <div className="flex items-center gap-4">
              <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${s.color} text-white`}>
                <s.icon className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm text-gray-500">{s.label}</p>
                <p className="text-2xl font-bold text-gray-900">{s.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-gray-900">Carry-Forward ({MONTHS[cfMonth - 1]} {cfYear})</h2>
          <div className="flex gap-2">
            <select value={cfMonth} onChange={(e) => setCfMonth(parseInt(e.target.value))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
              {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
            <select value={cfYear} onChange={(e) => setCfYear(parseInt(e.target.value))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
              {[year - 1, year, year + 1].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
        {carryForward ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-lg bg-red-50 p-4">
                <p className="text-sm text-red-600">Not Paid (students with no verified payment this month)</p>
                <p className="text-2xl font-bold text-red-700">{carryForward.not_paid.length}</p>
              </div>
              <div className="rounded-lg bg-amber-50 p-4">
                <p className="text-sm text-amber-600">Outstanding Balance (carried forward)</p>
                <p className="text-2xl font-bold text-amber-700">R {cfTotal.toLocaleString()}</p>
              </div>
            </div>
            {carryForward.not_paid.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {carryForward.not_paid.slice(0, 10).map((s) => (
                  <span key={s.student_id} className="inline-flex items-center gap-1 rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700">
                    <ArrowRightCircle className="h-3 w-3" /> {s.name} ({s.student_number})
                  </span>
                ))}
                {carryForward.not_paid.length > 10 && (
                  <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-500">
                    +{carryForward.not_paid.length - 10} more
                  </span>
                )}
              </div>
            )}
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-gray-500">No carry-forward data for this period.</p>
        )}
      </div>

      <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Payment Trends ({year})</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={trends.map((t) => ({ name: MONTHS[t.month - 1], total: t.total }))}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip formatter={(v: number) => `R ${v.toLocaleString()}`} />
            <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
