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

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  paid: { bg: colors.successSoft, text: colors.success },
  pending: { bg: colors.warningSoft, text: colors.warning },
  overdue: { bg: colors.dangerSoft, text: colors.danger },
  cancelled: { bg: '#F0F0F0', text: colors.textMuted },
};

export default function InvoicesScreen() {
  const navigation = useNavigation<any>();
  const unreadCount = useNotifications();
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

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
      const params: any = { limit: 50 };
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

  const totalAmount = useMemo(() => invoices.reduce((a, inv) => a + (Number(inv.subtotal) || 0), 0), [invoices]);
  const unpaidAmount = useMemo(() => invoices.reduce((a, inv) => {
    if (inv.status === 'paid') return a;
    return a + (Number(inv.balance_due) || 0);
  }, 0), [invoices]);

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

      <ScrollView
        style={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        {/* Summary banner */}
        {invoices.length > 0 && (
          <View style={styles.banner}>
            <View style={styles.bannerRow}>
              <View style={styles.bannerStat}>
                <Text style={styles.bannerLabel}>Total</Text>
                <Text style={styles.bannerAmount}>{money(totalAmount)}</Text>
              </View>
              <View style={[styles.bannerDivider]} />
              <View style={styles.bannerStat}>
                <Text style={styles.bannerLabel}>Unpaid</Text>
                <Text style={[styles.bannerAmount, { color: unpaidAmount > 0 ? colors.danger : colors.success }]}>
                  {money(unpaidAmount)}
                </Text>
              </View>
              <View style={[styles.bannerDivider]} />
              <View style={styles.bannerStat}>
                <Text style={styles.bannerLabel}>Invoices</Text>
                <Text style={styles.bannerAmount}>{invoices.length}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Invoice cards */}
        {invoices.map(inv => {
          const statusStyle = STATUS_COLORS[inv.status] || STATUS_COLORS.pending;
          const invoiceDate = inv.created_at ? new Date(inv.created_at).toLocaleDateString('en-ZA', {
            day: 'numeric', month: 'short', year: 'numeric',
          }) : '';

          return (
            <View key={inv.id} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.cardHeader}>
                  <Text style={styles.invoiceNumber}>{inv.invoice_number || 'Invoice'}</Text>
                  <View style={[styles.statusPill, { backgroundColor: statusStyle.bg }]}>
                    <Text style={[styles.statusText, { color: statusStyle.text }]}>
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
                  <Ionicons name="download-outline" size={16} color={colors.accentDark} />
                  <Text style={styles.downloadBtnText}>Download</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}

        {invoices.length === 0 && !loading && (
          <View style={styles.empty}>
            <Ionicons name="receipt-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>No invoices</Text>
            <Text style={styles.emptySub}>Invoices will appear here when generated</Text>
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
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: radii.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontFamily: fonts.body, fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  tabTextActive: { color: colors.white },

  scroll: { flex: 1 },

  /* Summary banner */
  banner: {
    backgroundColor: colors.white,
    borderRadius: radii.md,
    marginHorizontal: spacing.lg,
    marginBottom: 14,
    marginTop: 4,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bannerRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  bannerStat: { alignItems: 'center', flex: 1 },
  bannerDivider: { width: 1, height: 32, backgroundColor: colors.line },
  bannerLabel: {
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  bannerAmount: {
    fontFamily: fonts.monoSemi,
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
  },

  /* Invoice card */
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.md,
    marginHorizontal: spacing.lg,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  cardTop: {
    padding: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  invoiceNumber: {
    fontFamily: fonts.heading,
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radii.full,
  },
  statusText: {
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: '700',
  },
  invoiceDate: {
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '400',
    color: colors.textMuted,
  },

  cardBody: {
    padding: 14,
    paddingTop: 10,
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  amountLabel: {
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  amountValue: {
    fontFamily: fonts.monoSemi,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  description: {
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '400',
    color: colors.textMuted,
    marginTop: 4,
  },

  cardActions: {
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.accentSoft,
    paddingVertical: 10,
    borderRadius: radii.sm,
  },
  downloadBtnText: {
    fontFamily: fonts.heading,
    fontSize: 13,
    fontWeight: '700',
    color: colors.accentDark,
  },

  empty: { alignItems: 'center', marginTop: 48, gap: 8 },
  emptyTitle: { fontFamily: fonts.heading, fontSize: 16, fontWeight: '700', color: colors.text },
  emptySub: { fontFamily: fonts.body, fontSize: 13, fontWeight: '400', color: colors.textMuted },
});
