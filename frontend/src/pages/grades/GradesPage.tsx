import { useEffect, useState } from 'react';
import { gradesApi } from '@/api/client';
import type { Grade } from '@/types';
import toast from 'react-hot-toast';
import { Plus, Pencil, Archive, CheckCircle, Trash2, Loader2 } from 'lucide-react';
import Modal from '@/components/Modal';

export default function GradesPage() {
  const [grades, setGrades] = useState<Grade[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState('');

  const load = () => {
    setLoading(true);
    gradesApi.list().then((r) => setGrades(r.data)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editingId) {
        await gradesApi.update(editingId, { name });
        toast.success('Grade updated');
      } else {
        await gradesApi.create({ name });
        toast.success('Grade created');
      }
      closeForm();
      load();
    } catch {
      toast.error('Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setName('');
  };

  const handleEdit = (g: Grade) => {
    setEditingId(g.id);
    setName(g.name);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deactivate this grade?')) return;
    await gradesApi.delete(id);
    toast.success('Grade deactivated');
    load();
  };

  const handleArchive = async (id: string) => {
    await gradesApi.archive(id);
    toast.success('Grade archived');
    load();
  };

  const handleActivate = async (id: string) => {
    await gradesApi.activate(id);
    toast.success('Grade activated');
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Grades</h1>
        <button onClick={() => setShowForm(true)} className="btn btn-primary">
          <Plus className="h-4 w-4" /> Add Grade
        </button>
      </div>

      <Modal open={showForm} onClose={closeForm} title={editingId ? 'Edit Grade' : 'New Grade'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required className="input mt-1" />
          </div>
          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={submitting} className="btn btn-primary">
              {submitting ? 'Saving...' : editingId ? 'Update' : 'Create'}
            </button>
            <button type="button" onClick={closeForm} className="btn btn-secondary">Cancel</button>
          </div>
        </form>
      </Modal>

      <div className="table-wrap">
        {loading ? (
          <div className="flex h-32 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-ledger-muted" /></div>
        ) : (
          <>
            <table className="ledger-table">
              <thead className="bg-ledger-bg">
                <tr>
                  <th className="th">Name</th>
                  <th className="th">Status</th>
                  <th className="th th-num">Actions</th>
                </tr>
              </thead>
              <tbody className="">
                {grades.map((g) => (
                  <tr key={g.id} className="hover:bg-ledger-bg">
                    <td className="td font-medium">{g.name}</td>
                    <td className="td">
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${g.is_active ? 'badge badge-success' : g.is_archived ? 'badge badge-neutral' : 'badge badge-danger'}`}>
                        {g.is_active ? 'Active' : g.is_archived ? 'Archived' : 'Inactive'}
                      </span>
                    </td>
                    <td className="td text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => handleEdit(g)} className="rounded p-1 text-ledger-muted hover:text-ledger-ink" title="Edit"><Pencil className="h-4 w-4" /></button>
                        {g.is_active ? (
                          <button onClick={() => handleArchive(g.id)} className="rounded p-1 text-ledger-muted hover:text-ledger-ink" title="Archive"><Archive className="h-4 w-4" /></button>
                        ) : (
                          <button onClick={() => handleActivate(g.id)} className="rounded p-1 text-ledger-muted hover:text-ledger-ink" title="Activate"><CheckCircle className="h-4 w-4" /></button>
                        )}
                        <button onClick={() => handleDelete(g.id)} className="rounded p-1 text-ledger-muted hover:text-ledger-ink" title="Delete"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {grades.length === 0 && <p className="py-8 text-center text-sm text-ledger-muted">No grades found.</p>}
          </>
        )}
      </div>
    </div>
  );
}
