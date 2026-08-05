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
        <h1 className="text-2xl font-bold text-gray-900">Grades</h1>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">
          <Plus className="h-4 w-4" /> Add Grade
        </button>
      </div>

      <Modal open={showForm} onClose={closeForm} title={editingId ? 'Edit Grade' : 'New Grade'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={submitting} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
              {submitting ? 'Saving...' : editingId ? 'Update' : 'Create'}
            </button>
            <button type="button" onClick={closeForm} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
          </div>
        </form>
      </Modal>

      <div className="rounded-xl bg-white shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex h-32 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
        ) : (
          <>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {grades.map((g) => (
                  <tr key={g.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{g.name}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${g.is_active ? 'bg-green-100 text-green-700' : g.is_archived ? 'bg-gray-100 text-gray-500' : 'bg-red-100 text-red-700'}`}>
                        {g.is_active ? 'Active' : g.is_archived ? 'Archived' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => handleEdit(g)} className="rounded p-1 text-gray-400 hover:text-blue-600" title="Edit"><Pencil className="h-4 w-4" /></button>
                        {g.is_active ? (
                          <button onClick={() => handleArchive(g.id)} className="rounded p-1 text-gray-400 hover:text-yellow-600" title="Archive"><Archive className="h-4 w-4" /></button>
                        ) : (
                          <button onClick={() => handleActivate(g.id)} className="rounded p-1 text-gray-400 hover:text-green-600" title="Activate"><CheckCircle className="h-4 w-4" /></button>
                        )}
                        <button onClick={() => handleDelete(g.id)} className="rounded p-1 text-gray-400 hover:text-red-600" title="Delete"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {grades.length === 0 && <p className="py-8 text-center text-sm text-gray-500">No grades found.</p>}
          </>
        )}
      </div>
    </div>
  );
}
