import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { financialApi, studentsApi } from '../../api/client';
import { colors, spacing, radii, fonts } from '../../theme';
import { Student, Receipt } from '../../types';
import { downloadFile } from '../../utils/download';
import useNotifications from '../../hooks/useNotifications';

const money = (n: number) =>
  `R ${Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const DATE_FILTERS = ['all', 'month', 'year'] as const;
type DateFilter = typeof DATE_FILTERS[number];

export default function ReceiptsScreen() {
  const navigation = useNavigation<any>();
  const unreadCount = useNotifications();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');

  const loadData = useCallback(async () => {
    try {
      const [recRes, stuRes] = await Promise.all([
        financialApi.receipts({ limit: 100, offset: 0 }),
        studentsApi.list({ limit: 50, offset: 0 }),
      ]);
      const items = recRes.data?.items || [];
      setReceipts(items);
      setStudents(stuRes.data?.items || []);
    } catch (err: any) {
      console.error('Failed to load receipts:', err?.response?.data || err.message);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Dynamic header subtitle
  useEffect(() => {
    const filtered = filterReceipts(receipts, dateFilter);
    const total = filtered.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    navigation.setOptions({
      headerSubtitle: `${filtered.length} receipt${filtered.length !== 1 ? 's' : ''} · ${money(total)}`,
      headerOnBellPress: () => navigation.navigate('Notifications'),
    });
  }, [navigation, receipts, dateFilter]);

  const onRefresh = useCallback(async () => { setRefreshing(true); await loadData(); setRefreshing(false); }, [loadData]);

  const studentMap = Object.fromEntries(students.map(s => [s.id, s]));

  function filterReceipts(items: Receipt[], filter: DateFilter): Receipt[] {
    if (filter === 'all') return items;
    const now = new Date();
    return items.filter(r => {
      const d = new Date(r.created_at);
      if (filter === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      if (filter === 'year') return d.getFullYear() === now.getFullYear();
      return true;
    });
  }

  const filteredReceipts = useMemo(() => filterReceipts(receipts, dateFilter), [receipts, dateFilter]);

  const handleDownload = async (receipt: Receipt) => {
    const url = financialApi.receiptDownloadUrl(receipt.receipt_number);
    await downloadFile(url, `receipt-${receipt.receipt_number}.pdf`);
  };

  return (
    <View style={styles.root}>
      {/* Filter chips */}
      <View style={styles.filterWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterContent}>
          {DATE_FILTERS.map(f => {
            const active = dateFilter === f;
            const labels: Record<DateFilter, string> = { all: 'All Time', month: 'This Month', year: 'This Year' };
            const count = filterReceipts(receipts, f).length;
            return (
              <TouchableOpacity
                key={f}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setDateFilter(f)}
                activeOpacity={0.7}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{labels[f]}</Text>
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
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        {filteredReceipts.map(r => {
          const student = studentMap[r.student_id];
          const date = new Date(r.created_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
          return (
            <View key={r.id} style={styles.card}>
              <View style={styles.cardLeft}>
                <View style={styles.iconWrap}>
                  <Ionicons name="receipt-outline" size={18} color={colors.accentDark} />
                </View>
                <View style={styles.cardInfo}>
                  <Text style={styles.receiptCode}>{r.receipt_number}</Text>
                  {student && <Text style={styles.receiptStudent}>{student.first_name} {student.last_name}</Text>}
                  <Text style={styles.receiptDate}>{date}</Text>
                </View>
              </View>
              <View style={styles.cardRight}>
                <Text style={styles.receiptAmount}>{money(r.amount)}</Text>
                <TouchableOpacity style={styles.downloadBtn} onPress={() => handleDownload(r)}>
                  <Ionicons name="download-outline" size={14} color={colors.accentDark} />
                  <Text style={styles.downloadText}>PDF</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}

        {filteredReceipts.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="receipt-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>
              {dateFilter === 'all' ? 'No receipts yet' : 'No receipts in this period'}
            </Text>
            <Text style={styles.emptySub}>
              {dateFilter === 'all' ? 'Payment receipts will appear here' : 'Try a different filter'}
            </Text>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },

  filterWrap: { maxHeight: 52, backgroundColor: colors.bg },
  filterContent: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.full,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 6,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontFamily: fonts.body, fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  chipTextActive: { color: colors.white },
  chipBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.bgCanvas,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
  },
  chipBadgeActive: { backgroundColor: 'rgba(255,255,255,0.25)' },
  chipBadgeText: { fontFamily: fonts.body, fontSize: 11, fontWeight: '700', color: colors.textSecondary },
  chipBadgeTextActive: { color: colors.white },

  scroll: { flex: 1 },
  scrollContent: { paddingTop: 4 },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.white,
    borderRadius: radii.md,
    padding: 14,
    marginHorizontal: spacing.lg,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 9,
    backgroundColor: colors.accentSoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  cardInfo: { flex: 1 },
  receiptCode: {
    fontFamily: fonts.heading,
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  receiptStudent: {
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '400',
    color: colors.textSecondary,
    marginTop: 1,
  },
  receiptDate: {
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '400',
    color: colors.textMuted,
    marginTop: 1,
  },
  cardRight: { alignItems: 'flex-end', gap: 6 },
  receiptAmount: {
    fontFamily: fonts.monoSemi,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.sm,
    backgroundColor: colors.accentSoft,
    gap: 4,
  },
  downloadText: {
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: '700',
    color: colors.accentDark,
  },

  empty: { alignItems: 'center', marginTop: 48, gap: 8 },
  emptyTitle: {
    fontFamily: fonts.heading,
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  emptySub: {
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: '400',
    color: colors.textMuted,
  },
});
