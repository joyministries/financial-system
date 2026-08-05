import { useEffect, useState } from 'react';
import { financialApi, studentsApi } from '@/api/client';
import type { Receipt, Student } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { Download } from 'lucide-react';

export default function ReceiptsPage() {
  const { user } = useAuth();
  const isParent = user?.role === 'parent';
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    // Parents only ever see their own children (the backend enforces this too).
    Promise.all([
      studentsApi.list(isParent ? { parent_id: user!.id } : {}).then((r) => setStudents(r.data)),
      financialApi.listReceipts().then((r) => setReceipts(r.data)),
    ]).finally(() => setLoading(false));
  }, []);

  const handleFilter = (studentId: string) => {
    setSelectedStudent(studentId);
    setLoading(true);
    financialApi.listReceipts(studentId || undefined).then((r) => setReceipts(r.data)).finally(() => setLoading(false));
  };

  const getStudentName = (id: string) => {
    const s = students.find((s) => s.id === id);
    return s ? `${s.first_name} ${s.last_name}` : id;
  };

  const downloadReceipt = (r: Receipt) => {
    const student = students.find((s) => s.id === r.student_id);
    const studentName = student ? `${student.first_name} ${student.last_name}` : r.student_id;
    const date = new Date(r.created_at);
    // Escape every interpolated value — this HTML is written via
    // document.write (not JSX), so React's auto-escaping does not apply.
    const esc = (v: unknown) =>
      String(v ?? '').replace(/[&<>"']/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string),
      );
    const win = window.open('', '_blank', 'width=800,height=600');
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Receipt ${r.receipt_number}</title>
        <style>
          body { font-family: Georgia, 'Times New Roman', serif; max-width: 640px; margin: 40px auto; padding: 0 24px; color: #111; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px double #111; padding-bottom: 16px; margin-bottom: 24px; }
          h1 { font-size: 22px; margin: 0; }
          .school { color: #555; font-size: 13px; margin-top: 4px; }
          .receipt-no { text-align: right; font-family: monospace; font-size: 15px; }
          table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          td { padding: 8px 4px; border-bottom: 1px solid #ddd; font-size: 14px; }
          td:last-child { text-align: right; font-family: monospace; }
          .total td { font-weight: bold; font-size: 16px; border-top: 2px solid #111; border-bottom: none; }
          .footer { margin-top: 48px; font-size: 12px; color: #555; text-align: center; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1>School Finance</h1>
            <div class="school">Official Payment Receipt</div>
          </div>
          <div class="receipt-no">${esc(r.receipt_number)}</div>
        </div>
        <table>
          <tr><td>Student</td><td>${esc(studentName)}</td></tr>
          <tr><td>Amount Paid</td><td>R ${r.amount.toLocaleString()}</td></tr>
          <tr><td>Payment Method</td><td>${esc(r.payment_method)}</td></tr>
          <tr><td>Date</td><td>${date.toLocaleDateString()}</td></tr>
          <tr><td>Time</td><td>${date.toLocaleTimeString()}</td></tr>
          <tr class="total"><td>Received By</td><td>${esc(r.allocated_by)}</td></tr>
        </table>
        <div class="footer">
          This receipt confirms payment received by School Finance.<br/>
          Generated on ${date.toLocaleString()}
        </div>
        <script>
          window.onload = function() {
            document.title = 'Receipt ${esc(r.receipt_number)}';
            window.print();
          };
        <\/script>
      </body>
      </html>
    `);
    win.document.close();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{isParent ? 'My Receipts' : 'Receipts'}</h1>
        {isParent ? (
          <select value={selectedStudent} onChange={(e) => handleFilter(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
            <option value="">All My Children</option>
            {students.map((s) => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
          </select>
        ) : (
          <select value={selectedStudent} onChange={(e) => handleFilter(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
            <option value="">All Students</option>
            {students.map((s) => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
          </select>
        )}
      </div>

      {isParent && students.length === 0 && !loading && (
        <p className="text-sm text-gray-500">
          No children on your account yet. Once a child is registered you will see their receipts here.
        </p>
      )}

      <div className="rounded-xl bg-white shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
          </div>
        ) : (
          <>
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Receipt #</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Student</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Method</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {receipts.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 text-sm font-mono font-medium text-gray-900">{r.receipt_number}</td>
                <td className="px-6 py-4 text-sm text-gray-900">{getStudentName(r.student_id)}</td>
                <td className="px-6 py-4 text-sm font-medium text-gray-900">R {r.amount.toLocaleString()}</td>
                <td className="px-6 py-4 text-sm text-gray-500">{r.payment_method}</td>
                <td className="px-6 py-4 text-sm text-gray-500">{new Date(r.created_at).toLocaleDateString()}</td>
                <td className="px-6 py-4 text-right">
                  <button onClick={() => downloadReceipt(r)} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
                    <Download className="h-3.5 w-3.5" /> Download
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {receipts.length === 0 && <p className="py-8 text-center text-sm text-gray-500">No receipts found.</p>}
          </>
        )}
      </div>
    </div>
  );
}
