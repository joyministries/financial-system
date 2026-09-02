import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { paymentsApi, studentsApi } from '../../api/client';
import { colors, spacing, radii, fonts } from '../../theme';
import { Student, Payment } from '../../types';
import useNotifications from '../../hooks/useNotifications';

const METHOD_ICONS: Record<string, string> = {
  bank_transfer: 'business-outline',
  cash: 'cash-outline',
  card: 'card-outline',
  online: 'globe-outline',
};

const STATUS_STYLE: Record<string, string> = {
  verified: colors.success,
  pending: colors.warning,
  rejected: colors.danger,
  reversed: colors.textMuted,
};

const STATUS_FILTERS = ['all', 'verified', 'pending', 'rejected', 'reversed'] as const;
type StatusFilter = typeof STATUS_FILTERS[number];

const PERIOD_FILTERS = ['all', '1m', '3m', '6m', 'year'] as const;
type PeriodFilter = typeof PERIOD_FILTERS[number];
const PERIOD_LABELS: Record<PeriodFilter, string> = {
  all: 'All time', '1m': 'Last month', '3m': 'Last 3 months', '6m': 'Last 6 months', year: 'This year',
};
function periodStart(f: PeriodFilter): Date | null {
  const now = new Date();
  if (f === '1m') { const d = new Date(now); d.setMonth(d.getMonth() - 1); return d; }
  if (f === '3m') { const d = new Date(now); d.setMonth(d.getMonth() - 3); return d; }
  if (f === '6m') { const d = new Date(now); d.setMonth(d.getMonth() - 6); return d; }
  if (f === 'year') return new Date(now.getFullYear(), 0, 1);
  return null;
}

const money = (n: number) =>
  `R ${Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PaymentsScreen() {
  const navigation = useNavigation<any>();
  const unreadCount = useNotifications();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('all');

  const loadData = useCallback(async () => {
    try {
      const [payRes, stuRes] = await Promise.all([
        paymentsApi.list({ limit: 100, offset: 0 }),
        studentsApi.list({ limit: 50, offset: 0 }),
      ]);
      const items = payRes.data?.items || [];
      setPayments(items);
      setStudents(stuRes.data?.items || []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Dynamic header subtitle
  useEffect(() => {
    const filtered = statusFilter === 'all'
      ? payments
      : payments.filter(p => p.status === statusFilter);
    const total = filtered.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    navigation.setOptions({
      headerSubtitle: `${filtered.length} transaction${filtered.length !== 1 ? 's' : ''} · ${money(total)}`,
      headerOnBellPress: () => navigation.navigate('Notifications'),
    });
  }, [navigation, payments, statusFilter]);

  const onRefresh = useCallback(async () => { setRefreshing(true); await loadData(); setRefreshing(false); }, [loadData]);

  const studentMap = Object.fromEntries(students.map(s => [s.id, s]));

  const filteredPayments = useMemo(() => {
    let items = statusFilter === 'all' ? payments : payments.filter(p => p.status === statusFilter);
    const start = periodStart(periodFilter);
    if (start) items = items.filter(p => new Date(p.payment_date) >= start);
    return items;
  }, [payments, statusFilter, periodFilter]);

  return (
    <View style={styles.root}>
      {/* Status filter chips */}
      <View style={styles.filterWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterContent}>
          {STATUS_FILTERS.map(f => {
            const active = statusFilter === f;
            const label = f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1);
            const count = f === 'all' ? payments.length : payments.filter(p => p.status === f).length;
            return (
              <TouchableOpacity
                key={f}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setStatusFilter(f)}
                activeOpacity={0.7}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
                <View style={[styles.chipBadge, active && styles.chipBadgeActive]}>
                  <Text style={[styles.chipBadgeText, active && styles.chipBadgeTextActive]}>{count}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Period filter chips */}
      <View style={styles.filterWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterContent}>
          {PERIOD_FILTERS.map(f => {
            const active = periodFilter === f;
            return (
              <TouchableOpacity
                key={f}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setPeriodFilter(f)}
                activeOpacity={0.7}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{PERIOD_LABELS[f]}</Text>
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
        {filteredPayments.map(p => {
          const student = studentMap[p.student_id];
          const methodIcon = METHOD_ICONS[p.payment_method] || METHOD_ICONS.cash;
          const statusFg = STATUS_STYLE[p.status] || colors.warning;
          const payDate = new Date(p.payment_date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });

          return (
            <View key={p.id} style={styles.card}>
              {/* Top row: icon + info + amount */}
              <View style={styles.cardTop}>
                <Ionicons name={methodIcon as any} size={20} color={colors.icon} style={{ marginRight: 12 }} />
                <View style={styles.cardInfo}>
                  {student && <Text style={styles.cardName}>{student.first_name} {student.last_name}</Text>}
                  <Text style={styles.cardDate}>{payDate}</Text>
                </View>
                <Text style={styles.cardAmount}>{money(p.amount)}</Text>
              </View>

              {/* Bottom row: status dot + method + ref */}
              <View style={styles.cardBottom}>
                <View style={styles.pill}>
                  <View style={[styles.pillDot, { backgroundColor: statusFg }]} />
                  <Text style={[styles.pillText, { color: statusFg }]}>{p.status}</Text>
                </View>
                <Text style={styles.method}>{p.payment_method?.replace('_', ' ')}</Text>
                {p.reference_number && <Text style={styles.ref}>#{p.reference_number}</Text>}
              </View>
            </View>
          );
        })}

        {filteredPayments.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="wallet-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>
              {statusFilter === 'all' ? 'No payments yet' : `No ${statusFilter} payments`}
            </Text>
            <Text style={styles.emptySub}>
              {statusFilter === 'all' ? 'Payment records will appear here' : 'Try a different filter'}
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
    backgroundColor: colors.white,
    borderRadius: radii.md,
    padding: 14,
    marginHorizontal: spacing.lg,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardInfo: { flex: 1 },
  cardName: {
    fontFamily: fonts.heading,
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  cardDate: {
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '400',
    color: colors.textSecondary,
    marginTop: 1,
  },
  cardAmount: {
    fontFamily: fonts.monoSemi,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  cardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 10,
    gap: 8,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: {
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  method: {
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
    textTransform: 'capitalize',
  },
  ref: {
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '500',
    color: colors.textMuted,
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
