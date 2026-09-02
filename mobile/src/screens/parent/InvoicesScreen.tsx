import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { invoicesApi, studentsApi } from '../../api/client';
import { colors, spacing, radii, fonts } from '../../theme';
import { Student, Invoice } from '../../types';
import { downloadFile } from '../../utils/download';
import useNotifications from '../../hooks/useNotifications';

const money = (n: number) =>
  `R ${Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_COLORS: Record<string, string> = {
  paid: colors.success,
  pending: colors.warning,
  overdue: colors.danger,
  cancelled: colors.textMuted,
};

// ── Period filter helpers ──────────────────────────────────
const PERIOD_FILTERS = ['all', '1m', '3m', '6m', 'year'] as const;
type PeriodFilter = typeof PERIOD_FILTERS[number];
const PERIOD_LABELS: Record<PeriodFilter, string> = {
  all: 'All time',
  '1m': 'Last month',
  '3m': 'Last 3 months',
  '6m': 'Last 6 months',
  year: 'This year',
};

function periodStart(filter: PeriodFilter): Date | null {
  const now = new Date();
  if (filter === '1m') { const d = new Date(now); d.setMonth(d.getMonth() - 1); return d; }
  if (filter === '3m') { const d = new Date(now); d.setMonth(d.getMonth() - 3); return d; }
  if (filter === '6m') { const d = new Date(now); d.setMonth(d.getMonth() - 6); return d; }
  if (filter === 'year') return new Date(now.getFullYear(), 0, 1);
  return null;
}

function filterByPeriod(invoices: Invoice[], period: PeriodFilter): Invoice[] {
  const start = periodStart(period);
  if (!start) return invoices;
  return invoices.filter(inv => {
    const d = new Date(inv.created_at || inv.issue_date || '');
    return d >= start;
  });
}

export default function InvoicesScreen() {
  const navigation = useNavigation<any>();
  const unreadCount = useNotifications();
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('all');

  useEffect(() => {
    navigation.setOptions({
      headerSubtitle: selectedStudent
        ? `${selectedStudent.first_name} · ${invoices.length} invoice${invoices.length !== 1 ? 's' : ''}`
        : 'All invoices',
      headerOnBellPress: () => navigation.navigate('Notifications'),
    });
  }, [navigation, selectedStudent, invoices]);

  const loadStudents = useCallback(async () => {
    try {
      const res = await studentsApi.list({ limit: 50, offset: 0 });
      const items = res.data?.items || [];
      setStudents(items);
      if (items.length > 0 && !selectedStudent) setSelectedStudent(items[0]);
    } catch { /* silent */ }
  }, []);

  const loadInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { limit: 100 };
      if (selectedStudent) params.student_id = selectedStudent.id;
      const res = await invoicesApi.list(params);
      setInvoices(res.data?.items || []);
    } catch { /* silent */ }
    setLoading(false);
  }, [selectedStudent]);

  useEffect(() => { loadStudents(); }, [loadStudents]);
  useEffect(() => { loadInvoices(); }, [loadInvoices]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadInvoices();
    setRefreshing(false);
  }, [loadInvoices]);

  const handleDownload = async (inv: Invoice) => {
    const url = invoicesApi.downloadUrl(inv.id);
    await downloadFile(url, `invoice-${inv.invoice_number || inv.id}.pdf`);
  };

  const filteredInvoices = useMemo(() => filterByPeriod(invoices, periodFilter), [invoices, periodFilter]);

  const totalAmount = useMemo(() => filteredInvoices.reduce((a, inv) => a + (Number(inv.subtotal) || 0), 0), [filteredInvoices]);
  const unpaidAmount = useMemo(() => filteredInvoices.reduce((a, inv) => {
    if (inv.status === 'paid') return a;
    return a + (Number(inv.balance_due) || 0);
  }, 0), [filteredInvoices]);

  return (
    <View style={styles.root}>
      {/* Child selector tabs */}
      {students.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsWrap} contentContainerStyle={styles.tabsContent}>
          <TouchableOpacity
            style={[styles.tab, !selectedStudent && styles.tabActive]}
            onPress={() => setSelectedStudent(null)}
          >
            <Text style={[styles.tabText, !selectedStudent && styles.tabTextActive]}>All</Text>
          </TouchableOpacity>
          {students.map(s => (
            <TouchableOpacity
              key={s.id}
              style={[styles.tab, selectedStudent?.id === s.id && styles.tabActive]}
              onPress={() => setSelectedStudent(s)}
            >
              <Text style={[styles.tabText, selectedStudent?.id === s.id && styles.tabTextActive]}>{s.first_name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Period filter chips */}
      <View style={styles.filterWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterContent}>
          {PERIOD_FILTERS.map(f => {
            const active = periodFilter === f;
            const count = filterByPeriod(invoices, f).length;
            return (
              <TouchableOpacity
                key={f}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setPeriodFilter(f)}
                activeOpacity={0.7}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{PERIOD_LABELS[f]}</Text>
                <View style={[styles.chipBadge, active && styles.chipBadgeActive]}>
                  <Text style={[styles.chipBadgeText, active && styles.chipBadgeTextActive]}>{count}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        style={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        {/* Summary banner — fixed layout so numbers don't overflow */}
        {filteredInvoices.length > 0 && (
          <View style={styles.banner}>
            <View style={styles.bannerRow}>
              <View style={styles.bannerStat}>
                <Text style={styles.bannerLabel}>Total</Text>
                <Text style={styles.bannerAmount} adjustsFontSizeToFit numberOfLines={1}>
                  {money(totalAmount)}
                </Text>
              </View>
              <View style={styles.bannerDivider} />
              <View style={styles.bannerStat}>
                <Text style={styles.bannerLabel}>Unpaid</Text>
                <Text
                  style={[styles.bannerAmount, { color: unpaidAmount > 0 ? colors.danger : colors.success }]}
                  adjustsFontSizeToFit
                  numberOfLines={1}
                >
                  {money(unpaidAmount)}
                </Text>
              </View>
              <View style={styles.bannerDivider} />
              <View style={styles.bannerStat}>
                <Text style={styles.bannerLabel}>Count</Text>
                <Text style={styles.bannerAmount} adjustsFontSizeToFit numberOfLines={1}>
                  {filteredInvoices.length}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Invoice cards */}
        {filteredInvoices.map(inv => {
          const statusColor = STATUS_COLORS[inv.status] || colors.warning;
          const invoiceDate = inv.created_at ? new Date(inv.created_at).toLocaleDateString('en-ZA', {
            day: 'numeric', month: 'short', year: 'numeric',
          }) : '';

          return (
            <TouchableOpacity
              key={inv.id}
              style={styles.card}
              activeOpacity={0.85}
              onPress={() => navigation.navigate('InvoiceDetail', { invoice: inv })}
            >
              <View style={styles.cardTop}>
                <View style={styles.cardHeader}>
                  <Text style={styles.invoiceNumber}>{inv.invoice_number || 'Invoice'}</Text>
                  <View style={styles.statusPill}>
                    <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                    <Text style={[styles.statusText, { color: statusColor }]}>
                      {inv.status?.charAt(0).toUpperCase() + inv.status?.slice(1)}
                    </Text>
                  </View>
                </View>
                <Text style={styles.invoiceDate}>{invoiceDate}</Text>
              </View>

              <View style={styles.cardBody}>
                <View style={styles.amountRow}>
                  <Text style={styles.amountLabel}>Amount</Text>
                  <Text style={styles.amountValue}>{money(Number(inv.subtotal) || 0)}</Text>
                </View>
                <View style={styles.amountRow}>
                  <Text style={styles.amountLabel}>Balance Due</Text>
                  <Text style={[styles.amountValue, { color: (Number(inv.balance_due) || 0) > 0 ? colors.danger : colors.success }]}>
                    {money(Number(inv.balance_due) || 0)}
                  </Text>
                </View>
                {inv.items && inv.items.length > 0 && (
                  <View style={{ marginTop: 6 }}>
                    {inv.items.map((item, idx) => (
                      <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 }}>
                        <Text style={{ fontFamily: fonts.body, fontSize: 12, color: colors.textSecondary, flex: 1 }}>{item.description}</Text>
                        <Text style={{ fontFamily: fonts.mono, fontSize: 12, fontWeight: '500', color: colors.text }}>{money(item.amount)}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              <View style={styles.cardActions}>
                <TouchableOpacity style={styles.downloadBtn} onPress={() => handleDownload(inv)}>
                  <Ionicons name="download-outline" size={16} color={colors.icon} />
                  <Text style={styles.downloadBtnText}>Download</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        })}

        {filteredInvoices.length === 0 && !loading && (
          <View style={styles.empty}>
            <Ionicons name="receipt-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>No invoices</Text>
            <Text style={styles.emptySub}>
              {periodFilter === 'all' ? 'Invoices will appear here when generated' : 'No invoices in this period'}
            </Text>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },

  tabsWrap: { maxHeight: 52 },
  tabsContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: 8 },
  tab: {
    paddingHorizontal: 18, paddingVertical: 8,
    borderRadius: radii.full, backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.line,
  },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontFamily: fonts.body, fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  tabTextActive: { color: colors.white },

  filterWrap: { maxHeight: 52 },
  filterContent: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: radii.full, backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.line, gap: 6,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontFamily: fonts.body, fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  chipTextActive: { color: colors.white },
  chipBadge: {
    minWidth: 20, height: 20, borderRadius: 10,
    backgroundColor: colors.bgCanvas,
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 5,
  },
  chipBadgeActive: { backgroundColor: 'rgba(255,255,255,0.25)' },
  chipBadgeText: { fontFamily: fonts.body, fontSize: 11, fontWeight: '700', color: colors.textSecondary },
  chipBadgeTextActive: { color: colors.white },

  scroll: { flex: 1 },

  /* Summary banner — each stat gets flex:1 so numbers auto-shrink */
  banner: {
    backgroundColor: colors.white, borderRadius: radii.md,
    marginHorizontal: spacing.lg, marginBottom: 14, marginTop: 4,
    padding: 14, borderWidth: 1, borderColor: colors.border,
  },
  bannerRow: { flexDirection: 'row', alignItems: 'center' },
  bannerStat: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  bannerDivider: { width: 1, height: 36, backgroundColor: colors.line },
  bannerLabel: {
    fontFamily: fonts.body, fontSize: 10, fontWeight: '700',
    color: colors.textSecondary, textTransform: 'uppercase',
    letterSpacing: 0.5, marginBottom: 4,
  },
  bannerAmount: {
    fontFamily: fonts.monoSemi, fontSize: 14, fontWeight: '600',
    color: colors.text, textAlign: 'center',
    minWidth: 0, // allows adjustsFontSizeToFit to work
  },

  /* Invoice card */
  card: {
    backgroundColor: colors.white, borderRadius: radii.md,
    marginHorizontal: spacing.lg, marginBottom: 12,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  cardTop: {
    padding: 14, paddingBottom: 10,
    borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  invoiceNumber: { fontFamily: fonts.heading, fontSize: 14, fontWeight: '700', color: colors.text },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontFamily: fonts.bodySemi, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  invoiceDate: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },

  cardBody: { padding: 14, paddingTop: 10 },
  amountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  amountLabel: { fontFamily: fonts.body, fontSize: 13, fontWeight: '500', color: colors.textSecondary },
  amountValue: { fontFamily: fonts.monoSemi, fontSize: 15, fontWeight: '600', color: colors.text },

  cardActions: { paddingHorizontal: 14, paddingBottom: 14 },
  downloadBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.white, paddingVertical: 10, borderRadius: radii.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  downloadBtnText: { fontFamily: fonts.bodySemi, fontSize: 13, fontWeight: '600', color: colors.text },

  empty: { alignItems: 'center', marginTop: 48, gap: 8 },
  emptyTitle: { fontFamily: fonts.heading, fontSize: 16, fontWeight: '700', color: colors.text },
  emptySub: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted },
});
