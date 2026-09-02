import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { financialApi, invoicesApi, studentsApi, creditNotesApi } from '../../api/client';
import LoadingScreen from '../../components/LoadingScreen';
import { colors, spacing, radii, fonts } from '../../theme';
import { Student, StudentSummary, Invoice, CreditNote } from '../../types';
import { downloadFile } from '../../utils/download';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

type RouteParams = {
  student: Student;
  gradeId: string;
};

function money(amount: number): string {
  return `R ${Number(amount || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function FinancialDetailsScreen({ route }: any) {
  const { student, gradeId } = route.params;
  const currentYear = new Date().getFullYear();
  const currentMonthIdx = new Date().getMonth();

  const [tab, setTab] = useState<'schedule' | 'invoices' | 'preference'>('schedule');
  const [data, setData] = useState<{
    summary: StudentSummary | null;
    receipts: any[];
    statements: any[];
    invoices: Invoice[];
    creditNotes: CreditNote[];
  }>({
    summary: null,
    receipts: [],
    statements: [],
    invoices: [],
    creditNotes: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [prefChoice, setPrefChoice] = useState<'monthly' | 'cumulative'>('monthly');
  const [savingPref, setSavingPref] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      setError(null);
      const [summaryRes, statementsRes, invoicesRes, creditsRes] = await Promise.all([
        financialApi.getStudentSummary(student.id, currentYear),
        financialApi.listStatements(student.id, currentYear),
        invoicesApi.list({ student_id: student.id, limit: 100 }).catch(() => ({ data: { items: [] } })),
        creditNotesApi.listForStudent(student.id).catch(() => ({ data: [] })),
      ]);
      setData({
        summary: summaryRes.data,
        receipts: [],
        statements: Array.isArray(statementsRes.data) ? statementsRes.data : [],
        invoices: invoicesRes.data.items || [],
        creditNotes: Array.isArray(creditsRes.data) ? creditsRes.data : [],
      });
    } catch (err: any) {
      console.error('Failed to load financial details:', err);
      setError(err?.response?.data?.detail || 'Failed to load financial data. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function savePreference() {
    try {
      setSavingPref(true);
      await studentsApi.setPaymentPreference(student.id, prefChoice);
      Alert.alert('Saved', 'Payment preference updated successfully.');
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.detail || 'Failed to save preference.');
    } finally {
      setSavingPref(false);
    }
  }

  if (loading) {
    return <LoadingScreen />;
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.danger} />
        <Text style={styles.errorTitle}>Something went wrong</Text>
        <Text style={styles.errorMessage}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={loadData}>
          <Ionicons name="refresh" size={18} color={colors.white} />
          <Text style={styles.retryBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const summary = data.summary;
  const totalRequired = summary?.total_required ?? 0;
  const totalPaid = summary?.total_paid ?? 0;
  const outstanding = totalRequired - totalPaid;

  const TABS = [
    { key: 'schedule' as const, label: 'Schedule', icon: 'calendar-outline' as const },
    { key: 'invoices' as const, label: 'Invoices', icon: 'document-text-outline' as const },
    { key: 'preference' as const, label: 'Preference', icon: 'card-outline' as const },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.tabBar}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tabItem, tab === t.key && styles.tabItemActive]}
            onPress={() => setTab(t.key)}
          >
            <Ionicons
              name={t.icon}
              size={16}
              color={tab === t.key ? colors.accent : colors.textMuted}
            />
            <Text
              style={[styles.tabLabel, tab === t.key && styles.tabLabelActive]}
              numberOfLines={1}
            >
              {t.label}
            </Text>
            {tab === t.key && <View style={styles.tabIndicator} />}
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {tab === 'schedule' && (
          <>
            <View style={styles.cardRow}>
              <View style={styles.summaryCard}>
                <Ionicons name="wallet-outline" size={18} color={colors.icon} />
                <Text style={styles.summaryLabel}>Required</Text>
                <Text style={[styles.summaryValue, { color: colors.warning }]}>
                  {money(totalRequired)}
                </Text>
              </View>
              <View style={styles.summaryCard}>
                <Ionicons name="checkmark-circle-outline" size={18} color={colors.icon} />
                <Text style={styles.summaryLabel}>Paid</Text>
                <Text style={[styles.summaryValue, { color: colors.success }]}>
                  {money(totalPaid)}
                </Text>
              </View>
              <View style={styles.summaryCard}>
                <Ionicons name="alert-circle-outline" size={18} color={colors.icon} />
                <Text style={styles.summaryLabel}>Outstanding</Text>
                <Text style={[styles.summaryValue, { color: colors.danger }]}>
                  {money(outstanding)}
                </Text>
              </View>
            </View>

            {data.creditNotes.length > 0 && (
              <View style={styles.creditSection}>
                <View style={styles.creditHeader}>
                  <Ionicons name="pricetag-outline" size={16} color={colors.accent} />
                  <Text style={styles.creditTitle}>Credit Notes</Text>
                </View>
                {data.creditNotes
                  .filter((c) => c.status !== 'voided')
                  .map((c) => (
                    <View key={c.id} style={styles.creditCard}>
                      <View style={styles.creditRow}>
                        <Text style={styles.creditType}>{c.credit_type}</Text>
                        <Text style={styles.creditAmount}>
                          −{money(Number(c.amount))}
                        </Text>
                      </View>
                      <Text style={styles.creditDesc}>{c.description}</Text>
                      <Text style={styles.creditMeta}>
                        {c.credit_number} · {new Date(c.created_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })} ·{' '}
                        {c.status === 'applied' ? 'Applied to fees' : c.status === 'partial' ? 'Partially applied' : 'Issued'}
                      </Text>
                    </View>
                  ))}
                {data.creditNotes.filter((c) => c.status !== 'voided').length === 0 && null}
              </View>
            )}

            {(summary?.months ?? []).map((row: any, idx: number) => {
              const monthIdx = row.month - 1;
              const isCurrentMonth = currentMonthIdx === monthIdx;
              const fees = row.amount_required;
              const paid = row.amount_paid;
              const balance = fees - paid;
              const status = balance <= 0 ? 'PAID' : balance < fees ? 'PARTIAL' : 'DUE';
              const statusColor =
                status === 'PAID' ? colors.success : status === 'PARTIAL' ? colors.warning : colors.danger;

              return (
                <View
                  key={idx}
                  style={[styles.monthCard, isCurrentMonth && styles.monthCardCurrent]}
                >
                  <View style={styles.monthHeader}>
                    <Ionicons
                      name={
                        status === 'PAID'
                          ? 'checkmark-circle'
                          : status === 'PARTIAL'
                            ? 'time'
                            : 'alert-circle'
                      }
                      size={20}
                      color={statusColor}
                    />
                    <Text style={styles.monthName}>{MONTHS[monthIdx]}</Text>
                    {isCurrentMonth && (
                      <View style={styles.nowBadge}>
                        <View style={styles.nowDot} />
                        <Text style={styles.nowBadgeText}>Now</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.monthBody}>
                    <View style={styles.monthCol}>
                      <Text style={styles.monthColLabel}>Fees</Text>
                      <Text style={styles.monthColValue}>{money(fees)}</Text>
                    </View>
                    <View style={styles.monthDivider} />
                    <View style={styles.monthCol}>
                      <Text style={styles.monthColLabel}>Paid</Text>
                      <Text style={styles.monthColValue}>{money(paid)}</Text>
                    </View>
                    <View style={styles.monthDivider} />
                    <View style={styles.monthCol}>
                      <Text style={styles.monthColLabel}>Balance</Text>
                      <Text style={[styles.monthColValue, { color: statusColor }]}>
                        {money(balance)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.monthFooter}>
                    <View style={[styles.monthDot, { backgroundColor: statusColor }]} />
                    <Text style={[styles.monthStatus, { color: statusColor }]}>{status}</Text>
                  </View>
                </View>
              );
            })}
          </>
        )}

        {tab === 'invoices' && (
          <>
            {data.invoices.length === 0 && (
              <View style={styles.emptyState}>
                <Ionicons name="document-text-outline" size={48} color={colors.textMuted} />
                <Text style={styles.emptyText}>No invoices found for {currentYear}.</Text>
              </View>
            )}
            {data.invoices.map((inv) => (
              <View key={inv.id} style={styles.invoiceCard}>
                <View style={styles.invoiceHeader}>
                  <Text style={styles.invoiceNumber}>Invoice #{inv.invoice_number}</Text>
                  <View style={styles.statusBadge}>
                    <View
                      style={[
                        styles.statusDot,
                        {
                          backgroundColor:
                            inv.status === 'paid'
                              ? colors.success
                              : inv.status === 'void'
                                ? colors.danger
                                : colors.warning,
                        },
                      ]}
                    />
                    <Text
                      style={[
                        styles.statusText,
                        inv.status === 'paid'
                          ? styles.statusTextPaid
                          : inv.status === 'void'
                            ? styles.statusTextOverdue
                            : styles.statusTextPending,
                      ]}
                    >
                      {inv.status.toUpperCase()}
                    </Text>
                  </View>
                </View>
                <View style={styles.invoiceBody}>
                  <View style={styles.invoiceRow}>
                    <Text style={styles.invoiceLabel}>Period</Text>
                    <Text style={styles.invoiceValue}>{MONTHS[inv.month - 1]}</Text>
                  </View>
                  <View style={styles.invoiceRow}>
                    <Text style={styles.invoiceLabel}>Due Date</Text>
                    <Text style={styles.invoiceValue}>{inv.due_date}</Text>
                  </View>
                  <View style={styles.invoiceRow}>
                    <Text style={styles.invoiceLabel}>Balance</Text>
                    <Text style={[styles.invoiceValue, styles.invoiceBalance]}>
                      {money(inv.balance_due)}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.downloadBtn}
                  onPress={() => {
                    downloadFile(
                      invoicesApi.downloadUrl(inv.id),
                      `${inv.invoice_number}.pdf`,
                    );
                  }}
                >
                  <Ionicons name="download-outline" size={16} color={colors.accent} />
                  <Text style={styles.downloadText}>Download</Text>
                </TouchableOpacity>
              </View>
            ))}
          </>
        )}

        {tab === 'preference' && (
          <>
            <Text style={styles.preferenceTitle}>Choose your payment preference</Text>
            <Text style={styles.preferenceSubtitle}>
              Select how you'd like to pay for {student.first_name}'s fees in {currentYear}.
            </Text>

            <TouchableOpacity
              style={[styles.prefOption, prefChoice === 'monthly' && styles.prefOptionActive]}
              onPress={() => setPrefChoice('monthly')}
            >
              <View style={[styles.prefRadio, prefChoice === 'monthly' && styles.prefRadioActive]}>
                {prefChoice === 'monthly' && <View style={styles.prefRadioDot} />}
              </View>
              <View style={styles.prefOptionContent}>
                <Ionicons
                  name="calendar-outline"
                  size={24}
                  color={prefChoice === 'monthly' ? colors.accent : colors.textMuted}
                />
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.prefOptionTitle,
                      prefChoice === 'monthly' && styles.prefOptionTitleActive,
                    ]}
                  >
                    Monthly
                  </Text>
                  <Text style={styles.prefOptionDesc}>
                    Pay fees on a month-by-month basis. Each month's fees become due at the start
                    of that month.
                  </Text>
                </View>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.prefOption, prefChoice === 'cumulative' && styles.prefOptionActive]}
              onPress={() => setPrefChoice('cumulative')}
            >
              <View
                style={[styles.prefRadio, prefChoice === 'cumulative' && styles.prefRadioActive]}
              >
                {prefChoice === 'cumulative' && <View style={styles.prefRadioDot} />}
              </View>
              <View style={styles.prefOptionContent}>
                <Ionicons
                  name="layers-outline"
                  size={24}
                  color={prefChoice === 'cumulative' ? colors.accent : colors.textMuted}
                />
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.prefOptionTitle,
                      prefChoice === 'cumulative' && styles.prefOptionTitleActive,
                    ]}
                  >
                    Cumulative
                  </Text>
                  <Text style={styles.prefOptionDesc}>
                    Fees accumulate over time. All fees are tracked together with a single
                    outstanding balance.
                  </Text>
                </View>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.saveBtn, savingPref && styles.saveBtnDisabled]}
              onPress={savePreference}
              disabled={savingPref}
            >
              {savingPref ? (
                <Text style={styles.saveBtnText}>Saving...</Text>
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={18} color="#FFF" />
                  <Text style={styles.saveBtnText}>Save Preference</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  tabBar: { flexDirection: 'row', backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
  tabItem: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, gap: 2 },
  tabItemActive: {},
  tabLabel: { fontSize: 11, color: colors.textMuted, fontWeight: '500' },
  tabLabelActive: { color: colors.accent, fontWeight: '700' },
  tabIndicator: { position: 'absolute', bottom: 0, left: '20%', right: '20%', height: 2, borderRadius: 2, backgroundColor: colors.accent },
  content: { flex: 1 },
  contentContainer: { padding: spacing.md, gap: spacing.sm },
  cardRow: { flexDirection: 'row', gap: spacing.sm },
  summaryCard: { flex: 1, alignItems: 'center', padding: spacing.sm, borderRadius: radii.md, gap: 2, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  summaryLabel: { fontSize: 10, color: colors.textMuted, fontWeight: '500' },
  summaryValue: { fontSize: 13, fontWeight: '700' },
  creditSection: { marginTop: spacing.md, gap: spacing.sm },
  creditHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  creditTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  creditCard: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: spacing.md, gap: 4 },
  creditRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  creditType: { fontSize: 14, fontWeight: '700', color: colors.text },
  creditAmount: { fontSize: 14, fontWeight: '700', color: colors.success },
  creditDesc: { fontSize: 13, color: colors.textMuted },
  creditMeta: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  monthCard: { backgroundColor: colors.white, borderRadius: radii.md, overflow: 'hidden', shadowColor: colors.black, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 2 },
  monthCardCurrent: { borderColor: colors.accent, borderWidth: 1.5 },
  monthHeader: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: spacing.sm },
  monthName: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.text },
  nowBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  nowDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent },
  nowBadgeText: { fontSize: 10, fontWeight: '700', color: colors.accent },
  monthBody: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  monthCol: { flex: 1, alignItems: 'center' },
  monthColLabel: { fontSize: 10, color: colors.textMuted, fontWeight: '500', marginBottom: 2 },
  monthColValue: { fontSize: 13, fontWeight: '600', color: colors.text },
  monthDivider: { width: 1, height: 28, backgroundColor: colors.border },
  monthFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: spacing.xs },
  monthDot: { width: 6, height: 6, borderRadius: 3 },
  monthStatus: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  emptyState: { alignItems: 'center', paddingVertical: spacing.xl * 2, gap: spacing.sm },
  emptyText: { fontSize: 14, color: colors.textMuted },
  invoiceCard: { backgroundColor: colors.white, borderRadius: radii.md, padding: spacing.md, gap: spacing.sm, shadowColor: colors.black, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 2 },
  invoiceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  invoiceNumber: { fontSize: 15, fontWeight: '700', color: colors.text },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '700' },
  statusTextPaid: { color: colors.success },
  statusTextOverdue: { color: colors.danger },
  statusTextPending: { color: colors.warning },
  invoiceBody: { gap: 4 },
  invoiceRow: { flexDirection: 'row', justifyContent: 'space-between' },
  invoiceLabel: { fontSize: 13, color: colors.textMuted },
  invoiceValue: { fontSize: 13, color: colors.text, fontWeight: '500' },
  invoiceBalance: { fontWeight: '700' },
  downloadBtn: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', gap: 4, paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
  downloadText: { fontSize: 13, color: colors.accent, fontWeight: '600' },
  preferenceTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  preferenceSubtitle: { fontSize: 14, color: colors.textMuted, marginBottom: spacing.sm },
  prefOption: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: radii.md, padding: spacing.md, borderWidth: 2, borderColor: 'transparent', gap: spacing.md },
  prefOptionActive: { borderColor: colors.accent },
  prefRadio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.textMuted, alignItems: 'center', justifyContent: 'center' },
  prefRadioActive: { borderColor: colors.accent },
  prefRadioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
  prefOptionContent: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 },
  prefOptionTitle: { fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: 2 },
  prefOptionTitleActive: { color: colors.accent },
  prefOptionDesc: { fontSize: 12, color: colors.textMuted, lineHeight: 18 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent, borderRadius: radii.md, paddingVertical: spacing.md, gap: spacing.xs, marginTop: spacing.sm },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: colors.white },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl, gap: spacing.md },
  errorTitle: { fontFamily: fonts.heading, fontSize: 18, fontWeight: '700', color: colors.text, textAlign: 'center' },
  errorMessage: { fontFamily: fonts.body, fontSize: 14, fontWeight: '400', color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.accent, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm + 2, borderRadius: radii.sm, marginTop: spacing.sm },
  retryBtnText: { fontFamily: fonts.heading, fontSize: 15, fontWeight: '700', color: colors.white },
});
