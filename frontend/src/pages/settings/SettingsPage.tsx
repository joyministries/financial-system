import { useEffect, useState } from 'react';
import { authApi, settingsApi, smsApi } from '@/api/client';
import type { SmsMessage } from '@/api/client';
import { useAuth } from '@/contexts/AuthContext';
import type {
  EmailSettings,
  NotificationSettings,
  ReminderSettings,
  SmsSettings,
  SmsTemplate,
} from '@/types';
import toast from 'react-hot-toast';
import {
  AlertCircle,
  BellRing,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Mail,
  MessageSquare,
  Pencil,
  Send,
  Users,
  Save,
  Wallet,
} from 'lucide-react';

const emailReady = (e: EmailSettings | null) =>
  !!e?.enabled && !!e?.host && !!e?.from_email && (e.password_set || !!e.password);

const inputCls =
  'input mt-1 disabled:text-slate-400';

function StatusPill({ ready }: { ready: boolean }) {
  return ready ? (
    <span className="badge badge-success">
      <CheckCircle2 className="h-3.5 w-3.5" /> Configured — ready to send
    </span>
  ) : (
    <span className="badge badge-warning">
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
      <label className="block text-sm font-medium text-slate-700">
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
          className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600"
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
  const isAdmin = user?.role === 'super_admin';

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
  const [reminders, setReminders] = useState<ReminderSettings | null>(null);
  const [savingReminders, setSavingReminders] = useState(false);
  const [sendingReminders, setSendingReminders] = useState(false);

  const [registrationFee, setRegistrationFee] = useState('');
  const [savingRegistrationFee, setSavingRegistrationFee] = useState(false);

  const [templates, setTemplates] = useState<SmsTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<SmsTemplate | null>(null);
  const [templateBody, setTemplateBody] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);

  const smsReady =
    !!sms?.enabled && !!sms?.provider && (sms.api_key_set || sms.api_secret_set);

  const loadTemplates = () => {
    setLoadingTemplates(true);
    smsApi
      .templates()
      .then((res) => setTemplates(res.data))
      .catch(() => toast.error('Failed to load message templates'))
      .finally(() => setLoadingTemplates(false));
  };

  const openTemplateEditor = (t: SmsTemplate) => {
    setEditingTemplate(t);
    setTemplateBody(t.body);
  };

  const saveTemplate = async () => {
    if (!editingTemplate) return;
    if (!templateBody.trim()) return toast.error('Template content cannot be empty');
    setSavingTemplate(true);
    try {
      await smsApi.updateTemplate(editingTemplate.key, {
        name: editingTemplate.name,
        body: templateBody,
        is_active: editingTemplate.is_active,
      });
      toast.success('Message template saved — new sends use it');
      setEditingTemplate(null);
      loadTemplates();
    } catch {
      toast.error('Failed to save message template');
    } finally {
      setSavingTemplate(false);
    }
  };

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
    settingsApi
      .getReminders()
      .then((res) => setReminders(res.data))
      .catch(() => toast.error('Failed to load reminder settings'));
    settingsApi
      .getRegistrationFee()
      .then((res) => setRegistrationFee(res.data.amount || ''))
      .catch(() => toast.error('Failed to load registration fee'));
    loadTemplates();
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

  const saveReminders = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reminders) return;
    if (reminders.enabled && !reminders.start_date.trim()) {
      return toast.error('Pick a start date before enabling reminders');
    }
    setSavingReminders(true);
    try {
      const res = await settingsApi.updateReminders({
        enabled: reminders.enabled,
        start_date: reminders.start_date,
        interval_days: reminders.interval_days,
        count: reminders.count,
      });
      setReminders(res.data);
      toast.success(
        reminders.enabled
          ? 'Reminder schedule saved — parents will receive payment links automatically'
          : 'Reminder schedule saved (disabled)',
      );
    } catch {
      toast.error('Failed to save reminder settings');
    } finally {
      setSavingReminders(false);
    }
  };

  const sendRemindersNow = async () => {
    setSendingReminders(true);
    try {
      const r = (await smsApi.payLinkReminders()).data;
      toast.success(
        `Sent ${r.sent} payment-link SMS${r.skipped_no_phone ? ` · ${r.skipped_no_phone} without a phone` : ''}`,
      );
      if (r.skipped_failed > 0) toast.error(`${r.skipped_failed} failed to send`);
      const updated = (await settingsApi.getReminders()).data;
      setReminders(updated);
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || 'Failed to send reminders');
    } finally {
      setSendingReminders(false);
    }
  };

  const saveRegistrationFee = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingRegistrationFee(true);
    try {
      const res = await settingsApi.updateRegistrationFee(registrationFee.trim());
      setRegistrationFee(res.data.amount || '');
      toast.success(
        res.data.amount
          ? 'Registration fee saved — used for new registrations'
          : 'Registration fee cleared — no fee will be charged on registration',
      );
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || 'Failed to save registration fee');
    } finally {
      setSavingRegistrationFee(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Settings</h1>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
      <div
        className={`rounded-xl bg-white p-6 shadow-sm border border-slate-100 ${
          !isAdmin ? 'max-w-lg' : ''
        }`}
      >
        <h2 className="text-lg font-semibold text-slate-900">Change Password</h2>
        <form onSubmit={handlePasswordSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">New Password</label>
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
            <label className="block text-sm font-medium text-slate-700">Confirm New Password</label>
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
            className="btn btn-primary"
          >
            <Save className="h-4 w-4" />
            {savingPassword ? 'Saving...' : 'Change Password'}
          </button>
        </form>
      </div>

      {isAdmin && (
        <>
          {/* ── Email (SMTP) ─────────────────────────────────── */}
          <div className="rounded-xl bg-white p-6 shadow-sm border border-slate-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-primary-600" />
                <h3 className="text-base font-semibold text-slate-900">Email (SMTP)</h3>
              </div>
              {email && <StatusPill ready={email.enabled && !!email.host && !!email.from_email} />}
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Used for sending fee receipts, statements and notifications. Provide your mail
              server (SMTP) credentials below — sending is switched on once saved.
            </p>

            {!email && !loadingSettings ? (
              <div className="mt-4 flex items-center gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700">
                <AlertCircle className="h-4 w-4" /> Unable to load email settings.
              </div>
            ) : (
              <form onSubmit={saveEmail} className="mt-4 space-y-4">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={email?.enabled ?? false}
                    onChange={(e) => setEmail((p) => (p ? { ...p, enabled: e.target.checked } : p))}
                    className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                  />
                  Enable email sending
                </label>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-slate-700">SMTP Host</label>
                    <input
                      value={email?.host ?? ''}
                      onChange={(e) => setEmail((p) => (p ? { ...p, host: e.target.value } : p))}
                      placeholder="smtp.gmail.com"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Port</label>
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
                    <label className="block text-sm font-medium text-slate-700">Username</label>
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
                    <label className="block text-sm font-medium text-slate-700">From Email</label>
                    <input
                      value={email?.from_email ?? ''}
                      onChange={(e) => setEmail((p) => (p ? { ...p, from_email: e.target.value } : p))}
                      placeholder="no-reply@school.com"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">From Name</label>
                    <input
                      value={email?.from_name ?? ''}
                      onChange={(e) => setEmail((p) => (p ? { ...p, from_name: e.target.value } : p))}
                      placeholder="School Bursar"
                      className={inputCls}
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={email?.use_tls ?? true}
                    onChange={(e) =>
                      setEmail((p) => (p ? { ...p, use_tls: e.target.checked } : p))
                    }
                    className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                  />
                  Use TLS (STARTTLS)
                </label>

                <button
                  type="submit"
                  disabled={savingEmail}
                  className="btn btn-primary"
                >
                  <Save className="h-4 w-4" />
                  {savingEmail ? 'Saving...' : 'Save Email Settings'}
                </button>
              </form>
            )}
            {email && <EmailTools ready={emailReady(email)} />}
          </div>

          {/* ── SMS ──────────────────────────────────────────── */}
          <div className="rounded-xl bg-white p-6 shadow-sm border border-slate-100 lg:col-span-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-primary-600" />
                <h3 className="text-base font-semibold text-slate-900">SMS</h3>
              </div>
              {sms && (
                <StatusPill
                  ready={sms.enabled && !!sms.provider && (sms.api_key_set || sms.api_secret_set)}
                />
              )}
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Used for payment reminders and fee notifications. Provide your SMS provider
              credentials below — sending is switched on once saved.
            </p>

            {!sms && !loadingSettings ? (
              <div className="mt-4 flex items-center gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700">
                <AlertCircle className="h-4 w-4" /> Unable to load SMS settings.
              </div>
            ) : (
              <form onSubmit={saveSms} className="mt-4 space-y-4">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={sms?.enabled ?? false}
                    onChange={(e) => setSms((p) => (p ? { ...p, enabled: e.target.checked } : p))}
                    className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                  />
                  Enable SMS sending
                </label>

                <div>
                  <label className="block text-sm font-medium text-slate-700">Provider</label>
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
                    <option value="SMSportal">SMSportal (recommended)</option>
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
                  <label className="block text-sm font-medium text-slate-700">Sender ID</label>
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
                  className="btn btn-primary"
                >
                  <Save className="h-4 w-4" />
                  {savingSms ? 'Saving...' : 'Save SMS Settings'}
                </button>
              </form>
            )}

            <SmsTools ready={smsReady} />
          </div>

          {/* ── Message Templates ────────────────────────────── */}
          <div className="rounded-xl bg-white p-6 shadow-sm border border-slate-100">
            <div className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-primary-600" />
              <h3 className="text-base font-semibold text-slate-900">Message Templates</h3>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Curate the SMS messages sent to parents. Edits apply to every future send —
              reminders, payment links and receipt notifications.
            </p>

            {loadingTemplates ? (
              <div className="mt-4 flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              </div>
            ) : (
              <ul className="mt-4 divide-y divide-slate-100">
                {templates.map((t) => (
                  <li key={t.key} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">{t.name}</p>
                      <p className="truncate text-xs text-slate-500">{t.body}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {!t.is_active && <span className="badge badge-warning">Disabled</span>}
                      <button
                        type="button"
                        onClick={() => openTemplateEditor(t)}
                        className="rounded p-1.5 text-slate-400 hover:text-primary-600 hover:bg-slate-100"
                        title={`Edit ${t.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                ))}
                {templates.length === 0 && (
                  <li className="py-6 text-center text-sm text-slate-400">
                    No message templates yet.
                  </li>
                )}
              </ul>
            )}

            {editingTemplate && (
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">{editingTemplate.name}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Use placeholders in {'{braces}'}: {'{parent}'}, {'{student}'}, {'{amount}'},
                  {'{balance}'}, {'{link}'}, {'{month}'}, {'{year}'}, {'{receipt}'}
                </p>
                <textarea
                  value={templateBody}
                  onChange={(e) => setTemplateBody(e.target.value)}
                  rows={4}
                  className="input mt-2"
                />
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={saveTemplate}
                    disabled={savingTemplate}
                    className="btn btn-primary"
                  >
                    {savingTemplate ? 'Saving…' : 'Save Template'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingTemplate(null)}
                    className="btn btn-secondary"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── Registration Fee ─────────────────────────────── */}
          <div className="rounded-xl bg-white p-6 shadow-sm border border-slate-100">
            <div className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary-600" />
              <h3 className="text-base font-semibold text-slate-900">Registration Fee</h3>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              One-time fee charged when a student is registered — SMSed to the guardian when an
              admin ticks "send payment link" on registration, or paid via the portal by a parent
              registering on their own. Leave blank to charge nothing.
            </p>
            <form onSubmit={saveRegistrationFee} className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Amount (R)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={registrationFee}
                  onChange={(e) => setRegistrationFee(e.target.value)}
                  placeholder="e.g. 500.00"
                  className={inputCls}
                />
              </div>
              <button
                type="submit"
                disabled={savingRegistrationFee}
                className="btn btn-primary"
              >
                <Save className="h-4 w-4" />
                {savingRegistrationFee ? 'Saving...' : 'Save Registration Fee'}
              </button>
            </form>
          </div>

          {/* ── Payment Link Reminders ───────────────────────── */}
          <div className="rounded-xl bg-white p-6 shadow-sm border border-slate-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BellRing className="h-5 w-5 text-primary-600" />
                <h3 className="text-base font-semibold text-slate-900">Payment Link Reminders</h3>
              </div>
              {reminders && <StatusPill ready={!!reminders.enabled} />}
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Automatically SMS every parent with an outstanding balance a secure payment
              link for exactly what they owe — the same link as "Pay Online". Reminder 1
              goes out on the start date, then every interval until the total count is sent.
            </p>

            {!reminders && !loadingSettings ? (
              <div className="mt-4 flex items-center gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700">
                <AlertCircle className="h-4 w-4" /> Unable to load reminder settings.
              </div>
            ) : (
              <form onSubmit={saveReminders} className="mt-4 space-y-4">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={reminders?.enabled ?? false}
                    onChange={(e) =>
                      setReminders((p) => (p ? { ...p, enabled: e.target.checked } : p))
                    }
                    className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                  />
                  Enable automated reminders
                </label>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Start date</label>
                    <input
                      type="date"
                      value={reminders?.start_date ?? ''}
                      onChange={(e) =>
                        setReminders((p) => (p ? { ...p, start_date: e.target.value } : p))
                      }
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Every (days)</label>
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={reminders?.interval_days ?? 7}
                      onChange={(e) =>
                        setReminders((p) =>
                          p ? { ...p, interval_days: Number(e.target.value) || 7 } : p,
                        )
                      }
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Reminders</label>
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={reminders?.count ?? 4}
                      onChange={(e) =>
                        setReminders((p) => (p ? { ...p, count: Number(e.target.value) || 4 } : p))
                      }
                      className={inputCls}
                    />
                  </div>
                </div>

                {(reminders?.last_run_date || reminders?.next_run_date) && (
                  <div className="space-y-1 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    {reminders.next_run_date && (
                      <p>
                        Next reminder:{' '}
                        <b>{new Date(`${reminders.next_run_date}T00:00:00`).toLocaleDateString()}</b>
                      </p>
                    )}
                    {reminders.last_run_date && (
                      <p>
                        Last run:{' '}
                        {new Date(`${reminders.last_run_date}T00:00:00`).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <button type="submit" disabled={savingReminders} className="btn btn-primary">
                    <Save className="h-4 w-4" />
                    {savingReminders ? 'Saving...' : 'Save Schedule'}
                  </button>
                  <button
                    type="button"
                    onClick={sendRemindersNow}
                    disabled={sendingReminders || !smsReady}
                    className="btn btn-secondary"
                    title={
                      !smsReady
                        ? 'Configure the SMS channel above first'
                        : 'Send a payment link SMS now to every parent currently owing'
                    }
                  >
                    <Send className="h-4 w-4" />
                    {sendingReminders ? 'Sending...' : 'Send Now'}
                  </button>
                </div>
                <p className="text-xs text-slate-400">
                  "Send Now" ignores the schedule and immediately SMSes every parent with an
                  outstanding balance. Each parent receives a link for only what they owe.
                </p>
              </form>
            )}
          </div>
        </>
      )}
      </div>
    </div>
  );
}

function EmailTools({ ready }: { ready: boolean }) {
  const [testEmail, setTestEmail] = useState('');
  const [testing, setTesting] = useState(false);

  const runTest = async () => {
    if (!testEmail.trim()) {
      toast.error('Enter the email address to receive the test email');
      return;
    }
    setTesting(true);
    try {
      const res = await settingsApi.testEmail(testEmail.trim());
      toast.success(res.data.detail);
    } catch (err: any) {
      const detail = err?.response?.data?.detail ?? 'Test email failed';
      toast.error(detail, { duration: 6000 });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="mt-6 border-t border-slate-100 pt-5">
      <h4 className="text-sm font-semibold text-slate-900">Email tools</h4>
      <p className="mt-1 text-xs text-slate-500">
        Verify the SMTP channel by sending a test email.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <div className="min-w-[260px] flex-1">
          <label className="block text-sm font-medium text-slate-700">Email address</label>
          <input
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            placeholder="admin@school.com"
            className={inputCls}
            disabled={!ready}
          />
        </div>
        <button
          type="button"
          onClick={runTest}
          disabled={testing || !ready}
          className="btn btn-primary"
        >
          <Send className="h-4 w-4" />
          {testing ? 'Sending…' : 'Send test email'}
        </button>
      </div>

      {!ready && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <AlertCircle className="h-4 w-4" />
          Configure and save SMTP credentials above before testing.
        </div>
      )}
    </div>
  );
}

function SmsTools({ ready }: { ready: boolean }) {
  const [testPhone, setTestPhone] = useState('');
  const [testing, setTesting] = useState(false);
  const [reminding, setReminding] = useState(false);
  const [log, setLog] = useState<SmsMessage[] | null>(null);
  const [loadingLog, setLoadingLog] = useState(false);
  const [showLog, setShowLog] = useState(false);

  const now = new Date();

  const runTest = async () => {
    if (!testPhone.trim()) {
      toast.error('Enter the mobile number to receive the test SMS');
      return;
    }
    setTesting(true);
    try {
      const res = await smsApi.test(testPhone.trim());
      toast.success(res.data.detail);
      loadLog();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'Test SMS failed');
    } finally {
      setTesting(false);
    }
  };

  const runReminders = async () => {
    setReminding(true);
    try {
      const res = await smsApi.reminders(now.getFullYear(), now.getMonth() + 1);
      const { sent, skipped_no_phone, skipped_failed } = res.data;
      toast.success(`Reminders sent to ${sent} parent(s)`);
      if (skipped_no_phone || skipped_failed) {
        toast(
          `${skipped_no_phone} parent(s) have no phone, ${skipped_failed} send(s) failed — see SMS log`,
          { icon: '⚠️' },
        );
      }
      loadLog();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'Could not send reminders');
    } finally {
      setReminding(false);
    }
  };

  const loadLog = async () => {
    setLoadingLog(true);
    try {
      const res = await smsApi.log({ limit: 15 });
      setLog(res.data.items);
    } catch {
      /* log is non-blocking */
    } finally {
      setLoadingLog(false);
    }
  };

  const toggleLog = () => {
    if (!showLog) loadLog();
    setShowLog((s) => !s);
  };

  return (
    <div className="mt-6 border-t border-slate-100 pt-5">
      <h4 className="text-sm font-semibold text-slate-900">SMS tools</h4>
      <p className="mt-1 text-xs text-slate-500">
        Verify the channel, remind parents with outstanding balances, and review the send log.
      </p>

      <div className="mt-4 space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[220px] flex-1">
            <label className="block text-sm font-medium text-slate-700">Mobile number</label>
            <input
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              placeholder="082 123 4567"
              className={inputCls}
              disabled={!ready}
            />
          </div>
          <button
            type="button"
            onClick={runTest}
            disabled={testing || !ready}
            className="btn btn-primary"
          >
            <Send className="h-4 w-4" />
            {testing ? 'Sending…' : 'Send test SMS'}
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={runReminders}
            disabled={reminding || !ready}
            className="flex items-center gap-2 rounded-lg border border-primary-600 px-4 py-2 text-sm font-medium text-primary-700 hover:bg-primary-50 disabled:opacity-50"
          >
            <Users className="h-4 w-4" />
            {reminding ? 'Sending…' : 'Remind everyone owing'}
          </button>
          <button
            type="button"
            onClick={toggleLog}
            className="btn btn-secondary"
          >
            <MessageSquare className="h-4 w-4" />
            {showLog ? 'Hide SMS log' : 'Show SMS log'}
          </button>
        </div>

        {!ready && (
          <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700">
            <AlertCircle className="h-4 w-4" />
            Save SMSportal credentials above before testing or sending reminders.
          </div>
        )}

        {showLog && (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-500">
              {loadingLog ? 'Loading…' : `Latest SMS (${log?.length ?? 0})`}
            </div>
            {log && log.length > 0 ? (
              <div className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
                {log.map((m) => (
                  <div key={m.id} className="px-4 py-2.5 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-slate-500">{m.to_phone}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                          m.status === 'sent'
                            ? 'badge badge-success'
                            : m.status === 'failed'
                              ? 'badge badge-danger'
                              : 'badge badge-warning'
                        }`}
                      >
                        {m.status}
                        {m.cost != null ? ` · R${Number(m.cost).toFixed(2)}` : ''}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-slate-600" title={m.content}>
                      {m.content}
                    </p>
                    {m.error && <p className="mt-0.5 text-xs text-red-500">{m.error}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-4 py-6 text-center text-sm text-slate-500">
                No SMS sent yet.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
