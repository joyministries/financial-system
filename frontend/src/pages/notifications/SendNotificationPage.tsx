import { useState } from 'react';
import { Send, Bell, Users, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { notificationsApi } from '@/api/client';

export default function SendNotificationPage() {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ in_app_count: number; push_sent: number } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) {
      toast.error('Please fill in both title and message.');
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await notificationsApi.broadcast({ title: title.trim(), message: message.trim() });
      setResult(res.data);
      toast.success(`Notification sent to ${res.data.in_app_count} parent(s) (${res.data.push_sent} push delivered).`);
      setTitle('');
      setMessage('');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to send notification.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Send Notification</h1>
        <p className="mt-1 text-sm text-slate-500">
          Send an in-app notification and push alert to all registered parents.
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="rounded-2xl bg-white p-6 shadow-card space-y-5">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. School fees reminder"
            maxLength={255}
            className="input"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Message</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Write the notification message parents will see..."
            rows={5}
            maxLength={2000}
            className="input resize-none"
            required
          />
          <p className="mt-1 text-xs text-slate-400">{message.length}/2000 characters</p>
        </div>

        <button
          type="submit"
          disabled={loading || !title.trim() || !message.trim()}
          className="btn btn-primary flex items-center gap-2"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          {loading ? 'Sending...' : 'Send to all parents'}
        </button>
      </form>

      {/* Result */}
      {result && (
        <div className="rounded-2xl border border-green-200 bg-green-50 p-6">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-600" />
            <div>
              <h3 className="text-sm font-semibold text-green-900">Notification sent successfully</h3>
              <div className="mt-2 grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-green-600" />
                  <div>
                    <p className="text-lg font-bold text-green-900">{result.in_app_count}</p>
                    <p className="text-xs text-green-700">In-app notifications</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-green-600" />
                  <div>
                    <p className="text-lg font-bold text-green-900">{result.push_sent}</p>
                    <p className="text-xs text-green-700">Push notifications delivered</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Info card */}
      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-600" />
          <div className="text-sm text-blue-800">
            <p className="font-semibold">How it works</p>
            <ul className="mt-2 space-y-1 list-disc list-inside text-blue-700">
              <li>An in-app notification appears in each parent's notification bell.</li>
              <li>A push notification is sent to every parent who has the mobile app installed.</li>
              <li>Parents without push tokens still see the notification in-app.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
