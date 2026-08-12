import { useEffect, useState } from 'react';
import { financialApi, studentsApi, gradesApi, downloadPdf } from '@/api/client';
import { getStudentNames } from '@/lib/studentNames';
import type { Receipt, Student, Grade } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';
import { Download } from 'lucide-react';
import Pagination from '@/components/Pagination';
import StudentSearchSelect from '@/components/StudentSearchSelect';

const DEFAULT_PAGE_SIZE = 50;

export default function ReceiptsPage() {
  const { user } = useAuth();
  const isParent = user?.role === 'parent';
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [students, setStudents] = useState<Student[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [selectedGrade, setSelectedGrade] = useState('');
  const [selectedStudent, setSelectedStudent] = useState('');
  const [loading, setLoading] = useState(true);
  const [nameMap, setNameMap] = useState<Map<string, { name: string; student_number: string }>>(new Map());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  useEffect(() => {
    setLoading(true);
    // Parents only ever see their own children (the backend enforces this too).
    Promise.all([
      studentsApi.list(isParent ? { parent_id: user!.id } : {}).then((r) => setStudents(r.data.items)),
      gradesApi.list().then((r) => setGrades(r.data)),
      financialApi
        .listReceipts({
          student_id: selectedStudent || undefined,
          grade_id: !selectedStudent ? selectedGrade || undefined : undefined,
          limit: pageSize,
          offset: (page - 1) * pageSize,
        })
        .then((r) => {
          setReceipts(r.data.items);
          setTotalCount(r.data.total);
        }),
      getStudentNames().then(setNameMap),
    ]).finally(() => setLoading(false));
  }, [selectedStudent, selectedGrade, page, pageSize]);

  const handleFilter = (studentId: string, gradeId: string) => {
    setSelectedStudent(studentId);
    setSelectedGrade(gradeId);
    setPage(1);
  };

  const getStudentName = (id: string) => {
    const entry = nameMap.get(id);
    if (entry) return entry.name;
    const s = students.find((s) => s.id === id);
    return s ? `${s.first_name} ${s.last_name}` : id;
  };

  const downloadReceipt = async (r: Receipt) => {
    try {
      await downloadPdf(
        financialApi.receiptDownloadUrl(r.receipt_number),
        `receipt-${r.receipt_number}.pdf`,
      );
    } catch {
      toast.error('Receipt download failed');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">{isParent ? 'My Receipts' : 'Receipts'}</h1>
        {!isParent && (
          <div className="flex gap-2">
            <select
              value={selectedGrade}
              onChange={(e) => handleFilter('', e.target.value)}
              className="input"
            >
              <option value="">All Grades</option>
              {grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <StudentSearchSelect
              value={selectedStudent}
              onChange={(id) => handleFilter(id, selectedGrade)}
              placeholder="Search student…"
            />
          </div>
        )}
        {isParent && (
          <StudentSearchSelect
            value={selectedStudent}
            onChange={(id) => handleFilter(id, '')}
            placeholder="Search my children…"
          />
        )}
      </div>

      {isParent && students.length === 0 && !loading && (
        <p className="text-sm text-slate-500">
          No children on your account yet. Once a child is registered you will see their receipts here.
        </p>
      )}

      <div className="rounded-xl bg-white shadow-sm border border-slate-100 overflow-x-auto">
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
          </div>
        ) : (
          <>
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Receipt #</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Student</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Amount</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Method</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Date</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {receipts.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-6 py-4 text-sm font-mono font-medium text-slate-900">{r.receipt_number}</td>
                <td className="px-6 py-4 text-sm text-slate-900">{getStudentName(r.student_id)}</td>
                <td className="px-6 py-4 text-sm font-medium text-slate-900">R {r.amount.toLocaleString()}</td>
                <td className="px-6 py-4 text-sm text-slate-500">{r.payment_method}</td>
                <td className="px-6 py-4 text-sm text-slate-500">{new Date(r.created_at).toLocaleDateString()}</td>
                <td className="px-6 py-4 text-right">
                  <button onClick={() => downloadReceipt(r)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                    <Download className="h-3.5 w-3.5" /> Download
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {receipts.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No receipts found.</p>}
        <Pagination
          page={page}
          totalPages={Math.max(1, Math.ceil(totalCount / pageSize))}
          total={totalCount}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
        />
          </>
        )}
      </div>
    </div>
  );
}
