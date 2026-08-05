import { useEffect, useState } from 'react';
import { authApi, settingsApi } from '@/api/client';
import { useAuth } from '@/contexts/AuthContext';
import type { EmailSettings, NotificationSettings, SmsSettings } from '@/types';
import toast from 'react-hot-toast';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Mail,
  MessageSquare,
  Save,
} from 'lucide-react';

const inputCls =
  'mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:bg-gray-50 disabled:text-gray-400';

function StatusPill({ ready }: { ready: boolean }) {
  return ready ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
      <CheckCircle2 className="h-3.5 w-3.5" /> Configured — ready to send
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
      <AlertCircle className="h-3.5 w-3.5" /> Awaiting credentials
    </span>
  );
}

function SecretField({
  label,
  value,
  onChange,
  setHint,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  setHint: boolean;
  placeholder: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700">
        {label}
        {setHint && <span className="ml-1 text-xs text-green-600">(saved)</span>}
      </label>
      <div className="relative mt-1">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={setHint ? 'Leave blank to keep saved value' : placeholder}
          autoComplete="new-password"
          className={`${inputCls} pr-10`}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
          tabIndex={-1}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  // ── change password (everyone) ──────────────────────────────
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  // ── notification channels (admin only) ──────────────────────
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [email, setEmail] = useState<EmailSettings | null>(null);
  const [sms, setSms] = useState<SmsSettings | null>(null);
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingSms, setSavingSms] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    setLoadingSettings(true);
    settingsApi
      .getNotifications()
      .then((res) => {
        const s: NotificationSettings = res.data;
        setEmail({ ...s.email, password: '' });
        setSms({ ...s.sms, api_key: '', api_secret: '' });
      })
      .catch(() => toast.error('Failed to load notification settings'))
      .finally(() => setLoadingSettings(false));
  }, [isAdmin]);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) return toast.error('New passwords do not match');
    if (newPassword.length < 8) return toast.error('Password must be at least 8 characters');
    setSavingPassword(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      toast.success('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch {
      toast.error('Failed to change password — is your current password correct?');
    } finally {
      setSavingPassword(false);
    }
  };

  const saveEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    if (email.enabled && (!email.host.trim() || !email.from_email.trim())) {
      return toast.error('Enter the SMTP host and From address before enabling email');
    }
    setSavingEmail(true);
    try {
      const res = await settingsApi.updateEmail({
        enabled: email.enabled,
        host: email.host.trim(),
        port: email.port,
        username: email.username.trim(),
        password: email.password || null,
        from_email: email.from_email.trim(),
        from_name: email.from_name.trim(),
        use_tls: email.use_tls,
      });
      setEmail({ ...res.data, password: '' });
      toast.success('Email settings saved');
    } catch {
      toast.error('Failed to save email settings');
    } finally {
      setSavingEmail(false);
    }
  };

  const saveSms = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sms) return;
    if (sms.enabled && !sms.provider.trim()) {
      return toast.error('Select an SMS provider before enabling SMS');
    }
    setSavingSms(true);
    try {
      const res = await settingsApi.updateSms({
        enabled: sms.enabled,
        provider: sms.provider.trim(),
        api_key: sms.api_key || null,
        api_secret: sms.api_secret || null,
        sender_id: sms.sender_id.trim(),
      });
      setSms({ ...res.data, api_key: '', api_secret: '' });
      toast.success('SMS settings saved');
    } catch {
      toast.error('Failed to save SMS settings');
    } finally {
      setSavingSms(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

      <div className="max-w-lg rounded-xl bg-white p-6 shadow-sm border border-gray-100">
        <h2 className="text-lg font-semibold text-gray-900">Change Password</h2>
        <form onSubmit={handlePasswordSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              className={inputCls}
            />
          </div>
          <button
            type="submit"
            disabled={savingPassword}
            className="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {savingPassword ? 'Saving...' : 'Change Password'}
          </button>
        </form>
      </div>

      {isAdmin && (
        <div className="space-y-6">
          <div className="flex items-center justify-between max-w-lg">
            <h2 className="text-lg font-semibold text-gray-900">Notification Channels</h2>
            {loadingSettings && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
          </div>

          {/* ── Email (SMTP) ─────────────────────────────────── */}
          <div className="max-w-lg rounded-xl bg-white p-6 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-primary-600" />
                <h3 className="text-base font-semibold text-gray-900">Email (SMTP)</h3>
              </div>
              {email && <StatusPill ready={email.enabled && !!email.host && !!email.from_email} />}
            </div>
            <p className="mt-1 text-sm text-gray-500">
              Used for sending fee receipts, statements and notifications. Provide your mail
              server (SMTP) credentials below — sending is switched on once saved.
            </p>

            {!email && !loadingSettings ? (
              <div className="mt-4 flex items-center gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700">
                <AlertCircle className="h-4 w-4" /> Unable to load email settings.
              </div>
            ) : (
              <form onSubmit={saveEmail} className="mt-4 space-y-4">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <input
                    type="checkbox"
                    checked={email?.enabled ?? false}
                    onChange={(e) => setEmail((p) => (p ? { ...p, enabled: e.target.checked } : p))}
                    className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  Enable email sending
                </label>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700">SMTP Host</label>
                    <input
                      value={email?.host ?? ''}
                      onChange={(e) => setEmail((p) => (p ? { ...p, host: e.target.value } : p))}
                      placeholder="smtp.gmail.com"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Port</label>
                    <input
                      type="number"
                      min={1}
                      max={65535}
                      value={email?.port ?? 587}
                      onChange={(e) =>
                        setEmail((p) => (p ? { ...p, port: Number(e.target.value) } : p))
                      }
                      className={inputCls}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Username</label>
                    <input
                      value={email?.username ?? ''}
                      onChange={(e) => setEmail((p) => (p ? { ...p, username: e.target.value } : p))}
                      placeholder="notify@school.com"
                      autoComplete="off"
                      className={inputCls}
                    />
                  </div>
                  <SecretField
                    label="Password"
                    value={email?.password ?? ''}
                    onChange={(v) => setEmail((p) => (p ? { ...p, password: v } : p))}
                    setHint={!!email?.password_set}
                    placeholder="SMTP password / app password"
                  />
                  <div>
                    <label className="block text-sm font-medium text-gray-700">From Email</label>
                    <input
                      value={email?.from_email ?? ''}
                      onChange={(e) => setEmail((p) => (p ? { ...p, from_email: e.target.value } : p))}
                      placeholder="no-reply@school.com"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">From Name</label>
                    <input
                      value={email?.from_name ?? ''}
                      onChange={(e) => setEmail((p) => (p ? { ...p, from_name: e.target.value } : p))}
                      placeholder="School Bursar"
                      className={inputCls}
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <input
                    type="checkbox"
                    checked={email?.use_tls ?? true}
                    onChange={(e) =>
                      setEmail((p) => (p ? { ...p, use_tls: e.target.checked } : p))
                    }
                    className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  Use TLS (STARTTLS)
                </label>

                <button
                  type="submit"
                  disabled={savingEmail}
                  className="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  {savingEmail ? 'Saving...' : 'Save Email Settings'}
                </button>
              </form>
            )}
          </div>

          {/* ── SMS ──────────────────────────────────────────── */}
          <div className="max-w-lg rounded-xl bg-white p-6 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-primary-600" />
                <h3 className="text-base font-semibold text-gray-900">SMS</h3>
              </div>
              {sms && (
                <StatusPill
                  ready={sms.enabled && !!sms.provider && (sms.api_key_set || sms.api_secret_set)}
                />
              )}
            </div>
            <p className="mt-1 text-sm text-gray-500">
              Used for payment reminders and fee notifications. Provide your SMS provider
              credentials below — sending is switched on once saved.
            </p>

            {!sms && !loadingSettings ? (
              <div className="mt-4 flex items-center gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700">
                <AlertCircle className="h-4 w-4" /> Unable to load SMS settings.
              </div>
            ) : (
              <form onSubmit={saveSms} className="mt-4 space-y-4">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <input
                    type="checkbox"
                    checked={sms?.enabled ?? false}
                    onChange={(e) => setSms((p) => (p ? { ...p, enabled: e.target.checked } : p))}
                    className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  Enable SMS sending
                </label>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Provider</label>
                  <select
                    value={sms?.provider ?? ''}
                    onChange={(e) => setSms((p) => (p ? { ...p, provider: e.target.value } : p))}
                    className={inputCls}
                  >
                    <option value="">Select a provider…</option>
                    <option value="Twilio">Twilio</option>
                    <option value="Africa's Talking">Africa's Talking</option>
                    <option value="Vonage">Vonage (Nexmo)</option>
                    <option value="Termii">Termii</option>
                    <option value="Custom HTTP">Custom HTTP</option>
                  </select>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <SecretField
                    label="API Key"
                    value={sms?.api_key ?? ''}
                    onChange={(v) => setSms((p) => (p ? { ...p, api_key: v } : p))}
                    setHint={!!sms?.api_key_set}
                    placeholder="Provider API key"
                  />
                  <SecretField
                    label="API Secret"
                    value={sms?.api_secret ?? ''}
                    onChange={(v) => setSms((p) => (p ? { ...p, api_secret: v } : p))}
                    setHint={!!sms?.api_secret_set}
                    placeholder="Provider API secret (if any)"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Sender ID</label>
                  <input
                    value={sms?.sender_id ?? ''}
                    onChange={(e) => setSms((p) => (p ? { ...p, sender_id: e.target.value } : p))}
                    placeholder="SchoolSMS"
                    className={inputCls}
                  />
                </div>

                <button
                  type="submit"
                  disabled={savingSms}
                  className="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  {savingSms ? 'Saving...' : 'Save SMS Settings'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
