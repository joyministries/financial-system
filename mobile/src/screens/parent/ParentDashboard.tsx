import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { studentsApi, financialApi, invoicesApi } from '../../api/client';
import { colors, spacing, radii, fonts } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { Student, StudentSummary, RegistrationFeeResponse, NextDueDateResponse, Invoice } from '../../types';
import useNotifications from '../../hooks/useNotifications';

export const money = (n: number) =>
  `R ${Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ParentDashboard() {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const unreadCount = useNotifications();
  const [students, setStudents] = useState<Student[]>([]);
  const [summaries, setSummaries] = useState<Record<string, StudentSummary>>({});
  const [regFees, setRegFees] = useState<Record<string, RegistrationFeeResponse>>({});
  const [nextDueDates, setNextDueDates] = useState<NextDueDateResponse[]>([]);
  const [recentInvoices, setRecentInvoices] = useState<Invoice[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const firstName = useMemo(() => {
    if (!user) return '';
    return user.full_name?.split(' ')[0] || user.email.split('@')[0];
  }, [user]);

  useEffect(() => {
    navigation.setOptions({
      headerTitle: `Hi, ${firstName}`,
      headerSubtitle: 'Welcome back!',
      headerShowBell: true,
      headerOnBellPress: () => navigation.navigate('Notifications'),
    });
  }, [navigation, firstName]);

  const loadData = useCallback(async () => {
    try {
      const currentYear = new Date().getFullYear();
      const res = await studentsApi.list({ limit: 20, offset: 0 });
      const items = res.data?.items || [];
      setStudents(items);
      const sumMap: Record<string, StudentSummary> = {};
      const regMap: Record<string, RegistrationFeeResponse> = {};
      await Promise.all(
        items.map(async (s: Student) => {
          try {
            const r = await financialApi.studentSummary(s.id, currentYear);
            sumMap[s.id] = r.data;
          } catch { /* no summary */ }
          try {
            const rf = await studentsApi.registrationFee(s.id);
            regMap[s.id] = rf.data;
          } catch { /* no reg fee */ }
        })
      );
      setSummaries(sumMap);
      setRegFees(regMap);

      // Load next due dates for active approved students
      const dueDates: NextDueDateResponse[] = [];
      await Promise.all(
        items
          .filter((s: Student) => s.is_active && s.registration_status === 'approved')
          .map(async (s: Student) => {
            try {
              const r = await financialApi.nextDueDate(s.id);
              dueDates.push(r.data);
            } catch { /* no due date */ }
          })
      );
      setNextDueDates(dueDates);

      // Recent invoices (across the parent's children) for the transactions feed
      try {
        const invRes = await invoicesApi.list({ limit: 4 });
        setRecentInvoices(invRes.data?.items || []);
      } catch { /* no invoices */ }
    } catch { /* silent */ }
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));
  const onRefresh = useCallback(async () => { setRefreshing(true); await loadData(); setRefreshing(false); }, [loadData]);

  const totalPaid = useMemo(() => Object.values(summaries).reduce((a, s) => a + (Number(s?.total_paid) || 0), 0), [summaries]);
  const totalOutstanding = useMemo(() => Object.values(summaries).reduce((a, s) => a + (Number(s?.total_outstanding) || 0), 0), [summaries]);
  const activeCount = students.filter(s => s.is_active && s.registration_status === 'approved').length;
  const pendingCount = students.filter(s => s.registration_status === 'pending').length;

  /** Next due date across all children (soonest) */
  const nextDue = useMemo(() => {
    const valid = nextDueDates.filter(d => d.next_due_date);
    if (valid.length === 0) return null;
    return valid.reduce((a, b) => (new Date(a.next_due_date!) < new Date(b.next_due_date!) ? a : b));
  }, [nextDueDates]);

  /** Aggregate outstanding with the month label for the hero meta */
  const outstandingMeta = useMemo(() => {
    if (nextDue) {
      const d = new Date(nextDue.next_due_date!);
      const monthName = d.toLocaleDateString('en-ZA', { month: 'long' });
      return `${monthName} fees — due ${d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}`;
    }
    if (pendingCount > 0) return 'Awaiting admin approval';
    return 'All fees up to date';
  }, [nextDue, pendingCount]);

  /** Find first child with outstanding balance for quick-pay */
  const firstOwingChild = useMemo(() => {
    return students.find(s => {
      const sum = summaries[s.id];
      return sum && sum.total_outstanding > 0;
    });
  }, [students, summaries]);

  const handlePayNow = () => {
    if (!firstOwingChild) return;
    const s = summaries[firstOwingChild.id];
    navigation.navigate('PayOnline', {
      studentId: firstOwingChild.id,
      studentName: `${firstOwingChild.first_name} ${firstOwingChild.last_name}`,
      studentNumber: firstOwingChild.student_number,
      balance: s?.total_outstanding || 0,
    });
  };

  /** Students with unpaid registration fees */
  const unpaidRegFeeStudents = useMemo(() => {
    return students.filter(s => {
      const rf = regFees[s.id];
      return rf && rf.configured && !rf.paid;
    });
  }, [students, regFees]);

  const handlePayRegFee = (student: Student) => {
    const rf = regFees[student.id];
    if (!rf) return;
    navigation.navigate('PayOnline', {
      studentId: student.id,
      studentName: `${student.first_name} ${student.last_name}`,
      studentNumber: student.student_number,
      balance: rf.amount,
      itemName: 'Registration Fee',
    });
  };

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        {/* ── Hero: Outstanding balance ── */}
        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>Outstanding balance</Text>
          <Text style={styles.heroValue}>{money(totalOutstanding)}</Text>
          <Text style={styles.heroMeta}>{outstandingMeta}</Text>
        </View>

        {/* ── Stat grid: Paid this term / Next due ── */}
        <View style={styles.statGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Paid this term</Text>
            <Text style={styles.statAmount}>{money(totalPaid)}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Next due</Text>
            <Text style={styles.statAmount}>
              {nextDue?.next_due_date
                ? new Date(nextDue.next_due_date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })
                : '—'}
            </Text>
          </View>
        </View>

        {/* ── Action: Pay outstanding balance ── */}
        {totalOutstanding > 0 && firstOwingChild && (
          <TouchableOpacity style={styles.actionCard} activeOpacity={0.8} onPress={handlePayNow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.actionTitle}>Pay outstanding balance</Text>
              <Text style={styles.actionSub}>Card, bank transfer or PayFast</Text>
            </View>
            <Ionicons name="arrow-forward" size={18} color={colors.text} />
          </TouchableOpacity>
        )}

        {/* ── Next Due Date Cards ── */}
        {nextDueDates.filter(d => d.next_due_date).length > 0 && (
          <View style={styles.dueDateSection}>
            <View style={styles.dueDateSectionHeader}>
              <Ionicons name="calendar-outline" size={16} color={colors.primary} />
              <Text style={styles.dueDateSectionTitle}>Upcoming Payments</Text>
            </View>
            {nextDueDates.filter(d => d.next_due_date).map(d => {
              const dueDate = new Date(d.next_due_date!);
              const dateStr = dueDate.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
              const isOverdue = dueDate < new Date();
              return (
                <TouchableOpacity
                  key={d.student_id}
                  style={styles.dueDateCard}
                  activeOpacity={0.8}
                  onPress={() => navigation.navigate('PayOnline', {
                    studentId: d.student_id,
                    studentName: d.student_name,
                    balance: d.next_amount_due,
                  })}
                >
                  <View style={[styles.dueDateDot, { backgroundColor: isOverdue ? colors.danger : colors.warning }]} />
                  <View style={styles.dueDateInfo}>
                    <Text style={styles.dueDateStudent}>{d.student_name}</Text>
                    <Text style={styles.dueDateDesc}>{d.next_description}</Text>
                  </View>
                  <View style={styles.dueDateRight}>
                    <Text style={[styles.dueDateDate, isOverdue && { color: colors.danger }]}>{dateStr}</Text>
                    <Text style={styles.dueDateAmount}>{money(d.next_amount_due)}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* ── Registration Fee Banner ── */}
        {unpaidRegFeeStudents.length > 0 && (
          <View style={styles.regFeeBanner}>
            <View style={styles.regFeeBannerHeader}>
              <Ionicons name="document-text-outline" size={18} color={colors.warning} />
              <Text style={styles.regFeeBannerTitle}>Registration Fees Due</Text>
            </View>
            {unpaidRegFeeStudents.map(s => (
              <TouchableOpacity
                key={s.id}
                style={styles.regFeeItem}
                activeOpacity={0.8}
                onPress={() => handlePayRegFee(s)}
              >
                <View style={styles.regFeeItemLeft}>
                  <Text style={styles.regFeeItemName}>{s.first_name} {s.last_name}</Text>
                  <Text style={styles.regFeeItemAmount}>{money(regFees[s.id]?.amount || 0)}</Text>
                </View>
                <View style={styles.regFeePayBtn}>
                  <Ionicons name="card-outline" size={14} color={colors.white} />
                  <Text style={styles.regFeePayBtnText}>Pay</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ── Section header ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>My Children</Text>
          <TouchableOpacity style={styles.addBtn} onPress={() => navigation.navigate('RegisterChild')}>
            <Ionicons name="add" size={16} color={colors.textSecondary} />
            <Text style={styles.addBtnText}>Add Child</Text>
          </TouchableOpacity>
        </View>

        {/* ── Child cards ── */}
        {students.map((child, idx) => {
          const s = summaries[child.id];
          const initials = `${child.first_name?.[0] || ''}${child.last_name?.[0] || ''}`.toUpperCase();
          const outstanding = Number(s?.total_outstanding) || 0;

          return (
            <View key={child.id} style={styles.childCard}>
              <TouchableOpacity
                style={styles.childBody}
                activeOpacity={0.7}
                onPress={() => navigation.navigate('FeeBreakdown', { student: child, gradeId: child.grade_id, summary: s })}
              >
                {/* Neutral monogram */}
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initials}</Text>
                </View>

                <View style={styles.childInfo}>
                  <Text style={styles.childName}>{child.first_name} {child.last_name}</Text>
                  <Text style={styles.childNumber}>{child.student_number}</Text>
                  {s && (
                    <View style={styles.childAmounts}>
                      <Text style={styles.childPaid}>Paid {money(Number(s.total_paid) || 0)}</Text>
                      {outstanding > 0 && (
                        <Text style={styles.childOutstanding}> · Owe {money(outstanding)}</Text>
                      )}
                    </View>
                  )}
                </View>

                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </TouchableOpacity>

              {outstanding > 0 && (
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={styles.payBtn}
                  onPress={() => navigation.navigate('PayOnline', {
                    studentId: child.id,
                    studentName: `${child.first_name} ${child.last_name}`,
                    studentNumber: child.student_number,
                    balance: outstanding,
                  })}
                >
                  <Ionicons name="card-outline" size={16} color={colors.white} />
                  <Text style={styles.payBtnText}>Pay Now</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}

        {students.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>No children registered</Text>
            <Text style={styles.emptySub}>Tap "Add Child" to register your child</Text>
          </View>
        )}

        {/* ── Recent transactions ── */}
        {recentInvoices.length > 0 && (
          <View style={styles.recentSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recent transactions</Text>
              <TouchableOpacity onPress={() => navigation.navigate('InvoicesTab')}>
                <Text style={styles.recentSeeAll}>See all</Text>
              </TouchableOpacity>
            </View>
            {recentInvoices.map(inv => {
              const isPaid = inv.status === 'paid';
              const child = students.find(s => s.id === inv.student_id);
              const invDate = inv.created_at ? new Date(inv.created_at) : null;
              const rowSub = isPaid
                ? `Paid, ${invDate ? invDate.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }) : ''}`
                : `${String(inv.status || '').charAt(0).toUpperCase()}${String(inv.status || '').slice(1)}`;
              return (
                <TouchableOpacity
                  key={inv.id}
                  style={styles.listRow}
                  activeOpacity={0.7}
                  onPress={() => navigation.navigate('InvoiceDetail', { invoice: inv })}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{child ? `${child.first_name} ${child.last_name}` : inv.invoice_number}</Text>
                    <Text style={styles.rowSub}>{rowSub} · {inv.invoice_number}</Text>
                  </View>
                  <View style={styles.rowRight}>
                    <Text style={[styles.rowValue, !isPaid && { color: colors.danger }]}>
                      {money(Number(inv.subtotal) || 0)}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  scrollContent: { paddingTop: 16 },

  /* Hero card — outstanding balance (dark panel) */
  heroCard: {
    backgroundColor: colors.primary,
    borderRadius: radii.lg,
    padding: 20,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  heroLabel: {
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.78)',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  heroValue: {
    fontFamily: fonts.headingExtra,
    fontSize: 30,
    fontWeight: '800',
    color: colors.white,
    marginBottom: 8,
  },
  heroMeta: {
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.85)',
  },

  /* Stat grid — two columns */
  statGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radii.md,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statLabel: {
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  statAmount: {
    fontFamily: fonts.headingExtra,
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },

  /* Action card — pay outstanding */
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.white,
    borderRadius: radii.md,
    padding: 16,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionTitle: {
    fontFamily: fonts.heading,
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  actionSub: {
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '400',
    color: colors.textSecondary,
  },

  /* Recent transactions */
  recentSection: {
    marginTop: 8,
    marginBottom: 16,
  },
  recentSeeAll: {
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: '700',
    color: colors.accentDark,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.white,
    borderRadius: radii.md,
    padding: 14,
    marginHorizontal: spacing.lg,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowTitle: {
    fontFamily: fonts.heading,
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  rowSub: {
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '400',
    color: colors.textSecondary,
    marginTop: 2,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rowValue: {
    fontFamily: fonts.monoSemi,
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },

  /* Registration fee banner */
  regFeeBanner: {
    backgroundColor: colors.warningSoft,
    borderRadius: radii.md,
    marginHorizontal: spacing.lg,
    marginBottom: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  regFeeBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  regFeeBannerTitle: {
    fontFamily: fonts.heading,
    fontSize: 14,
    fontWeight: '700',
    color: colors.warning,
  },
  regFeeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.white,
    borderRadius: radii.sm,
    padding: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  regFeeItemLeft: { flex: 1 },
  regFeeItemName: {
    fontFamily: fonts.heading,
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  regFeeItemAmount: {
    fontFamily: fonts.mono,
    fontSize: 13,
    fontWeight: '600',
    color: colors.warning,
    marginTop: 2,
  },
  regFeePayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.warning,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radii.sm,
  },
  regFeePayBtnText: {
    fontFamily: fonts.heading,
    fontSize: 13,
    fontWeight: '700',
    color: colors.white,
  },

  /* Next due date section */
  dueDateSection: {
    marginHorizontal: spacing.lg,
    marginBottom: 16,
  },
  dueDateSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  dueDateSectionTitle: {
    fontFamily: fonts.heading,
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  dueDateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radii.md,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dueDateDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 12,
  },
  dueDateInfo: { flex: 1 },
  dueDateStudent: {
    fontFamily: fonts.heading,
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  dueDateDesc: {
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '400',
    color: colors.textSecondary,
    marginTop: 2,
  },
  dueDateRight: { alignItems: 'flex-end' },
  dueDateDate: {
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  dueDateAmount: {
    fontFamily: fonts.monoSemi,
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginTop: 2,
  },

  /* Section */
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    marginBottom: 12,
  },
  sectionTitle: {
    fontFamily: fonts.headingExtra,
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  addBtnText: {
    fontFamily: fonts.bodySemi,
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },

  /* Child card */
  childCard: {
    backgroundColor: colors.white,
    borderRadius: radii.md,
    marginHorizontal: spacing.lg,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  childBody: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#E8EBF0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontFamily: fonts.headingExtra,
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
  },
  childInfo: { flex: 1 },
  childName: {
    fontFamily: fonts.heading,
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  childNumber: {
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
    marginTop: 1,
  },
  childAmounts: { flexDirection: 'row', marginTop: 3, flexWrap: 'wrap' },
  childPaid: {
    fontFamily: fonts.mono,
    fontSize: 12,
    fontWeight: '500',
    color: colors.success,
  },
  childOutstanding: {
    fontFamily: fonts.mono,
    fontSize: 12,
    fontWeight: '500',
    color: colors.danger,
  },
  payBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingVertical: 11,
  },
  payBtnText: {
    fontFamily: fonts.heading,
    fontSize: 14,
    fontWeight: '700',
    color: colors.white,
  },

  /* Empty */
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
