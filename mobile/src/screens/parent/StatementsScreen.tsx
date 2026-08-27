import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { financialApi, studentsApi } from '../../api/client';
import { colors, spacing, radii, fonts } from '../../theme';
import { Student, Statement } from '../../types';
import { downloadFile } from '../../utils/download';
import useNotifications from '../../hooks/useNotifications';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const money = (n: number) =>
  `R ${Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_FILTERS = ['all', 'due', 'paid'] as const;
type StatusFilter = typeof STATUS_FILTERS[number];

export default function StatementsScreen() {
  const navigation = useNavigation<any>();
  const unreadCount = useNotifications();
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [statements, setStatements] = useState<Statement[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const loadStudents = useCallback(async () => {
    try {
      const res = await studentsApi.list({ limit: 50, offset: 0 });
      const items = res.data?.items || [];
      setStudents(items);
      if (items.length > 0 && !selectedStudent) setSelectedStudent(items[0]);
    } catch (err: any) {
      console.error('Failed to load students for statements:', err?.response?.data || err.message);
    }
  }, []);

  const currentYear = new Date().getFullYear();

  const loadStatements = useCallback(async () => {
    if (!selectedStudent) return;
    try {
      const res = await financialApi.statements(selectedStudent.id, currentYear);
      setStatements(Array.isArray(res.data) ? res.data : []);
    } catch (err: any) {
      console.error('Failed to load statements:', err?.response?.data || err.message);
    }
  }, [selectedStudent]);

  useEffect(() => { loadStudents(); }, [loadStudents]);
  useEffect(() => { loadStatements(); }, [loadStatements]);

  // Dynamic header subtitle
  useEffect(() => {
    const filtered = filterStatements(statements, statusFilter);
    const total = filtered.reduce((sum, s) => sum + (Number(s.closing_balance) || 0), 0);
    const studentLabel = selectedStudent ? `${selectedStudent.first_name}` : 'Select a child';
    navigation.setOptions({
      headerSubtitle: `${studentLabel} · ${filtered.length} statement${filtered.length !== 1 ? 's' : ''} · ${money(total)}`,
      headerOnBellPress: () => navigation.navigate('Notifications'),
    });
  }, [navigation, selectedStudent, statements, statusFilter]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadStatements();
    setRefreshing(false);
  }, [loadStatements]);

  function filterStatements(items: Statement[], filter: StatusFilter): Statement[] {
    if (filter === 'all') return items;
    return items.filter(s => {
      const bal = Number(s.closing_balance) || 0;
      if (filter === 'paid') return bal <= 0;
      if (filter === 'due') return bal > 0;
      return true;
    });
  }

  const filteredStatements = useMemo(() => filterStatements(statements, statusFilter), [statements, statusFilter]);

  const latestStatement = statements.length > 0 ? statements[statements.length - 1] : null;
  const totalOutstanding = latestStatement ? Number(latestStatement.closing_balance) || 0 : 0;

  const handleDownload = async (stmt: Statement) => {
    if (!selectedStudent) return;
    const url = financialApi.statementDownloadUrl(selectedStudent.id, stmt.academic_year, stmt.month);
    await downloadFile(url, `statement-${MONTHS[stmt.month - 1]}-${stmt.academic_year}.pdf`);
  };

  const [generating, setGenerating] = useState(false);
  const handleGenerate = async () => {
    if (!selectedStudent) return;
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    setGenerating(true);
    try {
      await financialApi.generateStatement(selectedStudent.id, year, month);
      Alert.alert('Success', `Statement for ${MONTHS[month - 1]} ${year} generated.`);
      await loadStatements();
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || 'Failed to generate statement.';
      Alert.alert('Error', msg);
    }
    setGenerating(false);
  };

  return (
    <View style={styles.root}>
      {/* Child selector tabs */}
      {students.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsWrap} contentContainerStyle={styles.tabsContent}>
          {students.map(s => (
            <TouchableOpacity
              key={s.id}
              style={[styles.tab, selectedStudent?.id === s.id && styles.tabActive]}
              onPress={() => { setSelectedStudent(s); setStatusFilter('all'); }}
            >
              <Text style={[styles.tabText, selectedStudent?.id === s.id && styles.tabTextActive]}>{s.first_name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Status filter chips */}
      <View style={styles.filterWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterContent}>
          {STATUS_FILTERS.map(f => {
            const active = statusFilter === f;
            const labels: Record<StatusFilter, string> = { all: 'All', due: 'Outstanding', paid: 'Paid' };
            const count = filterStatements(statements, f).length;
            return (
              <TouchableOpacity
                key={f}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setStatusFilter(f)}
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        {/* Balance banner */}
        {latestStatement && (
          <View style={styles.banner}>
            <View style={styles.bannerRow}>
              <View style={styles.bannerLeft}>
                <Text style={styles.bannerLabel}>Current Balance</Text>
                <Text style={styles.bannerAmount}>{money(totalOutstanding)}</Text>
              </View>
              <View style={[styles.bannerPill, totalOutstanding > 0 ? styles.bannerPillRed : styles.bannerPillGreen]}>
                <Ionicons
                  name={totalOutstanding > 0 ? 'alert-circle' : 'checkmark-circle'}
                  size={14}
                  color={totalOutstanding > 0 ? colors.danger : colors.success}
                />
                <Text style={[styles.bannerPillText, { color: totalOutstanding > 0 ? colors.danger : colors.success }]}>
                  {totalOutstanding > 0 ? 'Amount Due' : 'Paid Up'}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Generate Statement button */}
        {selectedStudent && (
          <TouchableOpacity
            style={styles.generateBtn}
            activeOpacity={0.8}
            onPress={handleGenerate}
            disabled={generating}
          >
            <Ionicons name="add-circle-outline" size={18} color={colors.white} />
            <Text style={styles.generateBtnText}>
              {generating ? 'Generating...' : `Generate ${MONTHS[new Date().getMonth()]} Statement`}
            </Text>
          </TouchableOpacity>
        )}

        {/* Monthly statement cards */}
        {filteredStatements.map(stmt => {
          const monthLabel = MONTHS[stmt.month - 1] || `M${stmt.month}`;
          return (
            <View key={stmt.id} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.monthBadge}>
                  <Text style={styles.monthBadgeText}>{monthLabel}</Text>
                </View>
                <View style={styles.cardInfo}>
                  <Text style={styles.cardTitle}>{monthLabel} {stmt.academic_year}</Text>
                  <Text style={styles.cardSub}>
                    Due: {new Date(stmt.due_date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}
                  </Text>
                </View>
                <TouchableOpacity style={styles.downloadBtn} onPress={() => handleDownload(stmt)}>
                  <Ionicons name="download-outline" size={16} color={colors.accentDark} />
                </TouchableOpacity>
              </View>

              <View style={styles.cardRows}>
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>Opening Balance</Text>
                  <Text style={styles.rowValue}>{money(Number(stmt.opening_balance) || 0)}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>Monthly Installment</Text>
                  <Text style={styles.rowValue}>{money(Number(stmt.total_installments) || 0)}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>Payments</Text>
                  <Text style={[styles.rowValue, { color: colors.success }]}>-{money(Number(stmt.total_payments) || 0)}</Text>
                </View>
                <View style={[styles.row, { borderBottomWidth: 0 }]}>
                  <Text style={[styles.rowLabel, { fontWeight: '700' }]}>Balance Due</Text>
                  <Text style={[styles.rowValue, {
                    fontWeight: '700',
                    fontFamily: fonts.monoSemi,
                    color: Number(stmt.closing_balance) > 0 ? colors.danger : colors.success,
                  }]}>
                    {money(Number(stmt.closing_balance) || 0)}
                  </Text>
                </View>
              </View>
            </View>
          );
        })}

        {filteredStatements.length === 0 && selectedStudent && (
          <View style={styles.empty}>
            <Ionicons name="document-text-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>
              {statusFilter === 'all' ? 'No statements' : `No ${statusFilter} statements`}
            </Text>
            <Text style={styles.emptySub}>
              {statusFilter === 'all' ? 'Statements will appear here' : 'Try a different filter'}
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
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: radii.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: {
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  tabTextActive: { color: colors.white },

  filterWrap: { maxHeight: 52 },
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

  /* Balance banner */
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
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bannerLeft: { flex: 1 },
  bannerLabel: {
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  bannerAmount: {
    fontFamily: fonts.monoSemi,
    fontSize: 22,
    fontWeight: '600',
    color: colors.text,
  },
  bannerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.full,
    gap: 4,
  },
  bannerPillRed: { backgroundColor: colors.dangerSoft },
  bannerPillGreen: { backgroundColor: colors.successSoft },
  bannerPillText: {
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: '700',
  },

  /* Generate statement button */
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    marginHorizontal: spacing.lg,
    marginBottom: 14,
    paddingVertical: 12,
    borderRadius: radii.sm,
  },
  generateBtnText: {
    fontFamily: fonts.heading,
    fontSize: 14,
    fontWeight: '700',
    color: colors.white,
  },

  /* Statement card */
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
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    paddingBottom: 10,
  },
  monthBadge: {
    width: 44,
    height: 44,
    borderRadius: radii.sm,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  monthBadgeText: {
    fontFamily: fonts.mono,
    fontSize: 12,
    fontWeight: '600',
    color: colors.white,
  },
  cardInfo: { flex: 1 },
  cardTitle: {
    fontFamily: fonts.heading,
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  cardSub: {
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '400',
    color: colors.textMuted,
    marginTop: 1,
  },
  downloadBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.accentSoft,
    justifyContent: 'center',
    alignItems: 'center',
  },

  cardRows: {
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  rowLabel: {
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: '400',
    color: colors.textSecondary,
  },
  rowValue: {
    fontFamily: fonts.mono,
    fontSize: 13,
    fontWeight: '500',
    color: colors.text,
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
