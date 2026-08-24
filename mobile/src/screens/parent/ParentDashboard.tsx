import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { studentsApi, financialApi } from '../../api/client';
import { colors, spacing, radii, fonts } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { Student, StudentSummary } from '../../types';

/** Spec: avatar accent ring colors cycle */
const AVATAR_COLORS = ['#4A7AE5', '#D2A24C', '#1E9E64', '#E3486D'];

const money = (n: number) =>
  `R ${Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export default function ParentDashboard() {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const [students, setStudents] = useState<Student[]>([]);
  const [summaries, setSummaries] = useState<Record<string, StudentSummary>>({});
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
      await Promise.all(
        items.map(async (s: Student) => {
          try {
            const r = await financialApi.studentSummary(s.id, currentYear);
            sumMap[s.id] = r.data;
          } catch { /* no summary */ }
        })
      );
      setSummaries(sumMap);
    } catch { /* silent */ }
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));
  const onRefresh = useCallback(async () => { setRefreshing(true); await loadData(); setRefreshing(false); }, [loadData]);

  const totalPaid = useMemo(() => Object.values(summaries).reduce((a, s) => a + (Number(s?.total_paid) || 0), 0), [summaries]);
  const totalOutstanding = useMemo(() => Object.values(summaries).reduce((a, s) => a + (Number(s?.total_outstanding) || 0), 0), [summaries]);
  const activeCount = students.filter(s => s.is_active && s.registration_status === 'approved').length;
  const pendingCount = students.filter(s => s.registration_status === 'pending').length;

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

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        {/* ── Stat cards ── */}
        <View style={styles.statGrid}>
          {/* Total Paid */}
          <View style={styles.statCard}>
            <View style={[styles.statIconWrap, { backgroundColor: colors.successSoft }]}>
              <Ionicons name="trending-up" size={16} color={colors.success} />
            </View>
            <Text style={styles.statLabel}>Total Paid</Text>
            <Text style={styles.statAmount}>{money(totalPaid)}</Text>
          </View>
          {/* Outstanding — full width with Pay button */}
          {totalOutstanding > 0 ? (
            <TouchableOpacity
              activeOpacity={0.8}
              style={styles.statCardFull}
              onPress={handlePayNow}
            >
              <View style={styles.statFullTop}>
                <View style={[styles.statIconWrap, { backgroundColor: colors.dangerSoft }]}>
                  <Ionicons name="alert-circle" size={16} color={colors.danger} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.statLabel}>Outstanding</Text>
                  <Text style={styles.statAmount}>{money(totalOutstanding)}</Text>
                </View>
              </View>
              <View style={styles.payNowRow}>
                <Ionicons name="card-outline" size={16} color={colors.white} />
                <Text style={styles.payNowText}>Pay Now</Text>
                <Ionicons name="arrow-forward" size={14} color={colors.white} />
              </View>
            </TouchableOpacity>
          ) : (
            <View style={styles.statCard}>
              <View style={[styles.statIconWrap, { backgroundColor: colors.dangerSoft }]}>
                <Ionicons name="checkmark-circle" size={16} color={colors.success} />
              </View>
              <Text style={styles.statLabel}>Outstanding</Text>
              <Text style={[styles.statAmount, { color: colors.success }]}>R 0</Text>
            </View>
          )}
          {/* Active students */}
          <View style={styles.statCard}>
            <View style={[styles.statIconWrap, { backgroundColor: '#E8EAF0' }]}>
              <Ionicons name="school" size={16} color={colors.primary} />
            </View>
            <Text style={styles.statLabel}>Active</Text>
            <Text style={styles.statAmount}>{activeCount}</Text>
          </View>
          {/* Pending */}
          <View style={styles.statCard}>
            <View style={[styles.statIconWrap, { backgroundColor: colors.warningSoft }]}>
              <Ionicons name="time" size={16} color={colors.warning} />
            </View>
            <Text style={styles.statLabel}>Pending</Text>
            <Text style={styles.statAmount}>{pendingCount}</Text>
          </View>
        </View>

        {/* ── Section header ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>My Children</Text>
          <TouchableOpacity style={styles.addBtn} onPress={() => navigation.navigate('RegisterChild')}>
            <Ionicons name="add" size={16} color={colors.accentDark} />
            <Text style={styles.addBtnText}>Add Child</Text>
          </TouchableOpacity>
        </View>

        {/* ── Child cards ── */}
        {students.map((child, idx) => {
          const s = summaries[child.id];
          const initials = `${child.first_name?.[0] || ''}${child.last_name?.[0] || ''}`.toUpperCase();
          const outstanding = Number(s?.total_outstanding) || 0;
          const ringColor = AVATAR_COLORS[idx % AVATAR_COLORS.length];

          return (
            <View key={child.id} style={styles.childCard}>
              <TouchableOpacity
                style={styles.childBody}
                activeOpacity={0.7}
                onPress={() => navigation.navigate('FeeBreakdown', { student: child, gradeId: child.grade_id, summary: s })}
              >
                {/* Colored-ring avatar */}
                <View style={[styles.avatarRing, { borderColor: ringColor }]}>
                  <View style={[styles.avatarInner, { backgroundColor: ringColor + '18' }]}>
                    <Text style={[styles.avatarText, { color: ringColor }]}>{initials}</Text>
                  </View>
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

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  scrollContent: { paddingTop: 16 },

  /* Stat grid — 2×2 */
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: spacing.lg,
    marginBottom: 20,
  },
  statCard: {
    width: '48%',
    flexGrow: 1,
    minWidth: 140,
    backgroundColor: colors.white,
    borderRadius: radii.md,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
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

  /* Full-width outstanding card with pay button */
  statCardFull: {
    width: '100%',
    backgroundColor: colors.white,
    borderRadius: radii.md,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
  },
  statFullTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  payNowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 11,
    borderRadius: radii.sm,
  },
  payNowText: {
    fontFamily: fonts.heading,
    fontSize: 14,
    fontWeight: '700',
    color: colors.white,
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
    backgroundColor: colors.accentSoft,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  addBtnText: {
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '700',
    color: colors.accentDark,
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
  avatarRing: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 2.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarInner: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontFamily: fonts.headingExtra,
    fontSize: 16,
    fontWeight: '800',
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
