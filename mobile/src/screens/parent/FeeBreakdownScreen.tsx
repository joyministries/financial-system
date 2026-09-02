import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { feesApi, chargesApi, financialApi } from '../../api/client';
import LoadingScreen from '../../components/LoadingScreen';
import { colors, spacing, radii, fonts } from '../../theme';
import { FeeStructure, AdditionalCharge } from '../../types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const money = (amount: number) =>
  `R ${Number(amount || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function FeeBreakdownScreen({ route }: any) {
  const navigation = useNavigation<any>();
  const { student, gradeId } = route.params;

  const [feeStructures, setFeeStructures] = useState<FeeStructure[]>([]);
  const [additionalCharges, setAdditionalCharges] = useState<AdditionalCharge[]>([]);
  const [totalDue, setTotalDue] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currentYear = new Date().getFullYear();

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [feesRes, chargesRes, dueRes] = await Promise.all([
        feesApi.listByGrade(gradeId, currentYear),
        chargesApi.list(student.id, currentYear),
        financialApi.getTotalDue(student.id, currentYear),
      ]);
      setFeeStructures(feesRes.data);
      setAdditionalCharges(chargesRes.data);
      setTotalDue(Number(dueRes.data.total_due || 0));
    } catch (err: any) {
      console.error('Failed to load fee breakdown:', err);
      setError(err?.response?.data?.detail || 'Failed to load fee breakdown. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <LoadingScreen />;

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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Student header */}
      <View style={styles.studentCard}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={28} color={colors.white} />
        </View>
        <View style={styles.studentInfo}>
          <Text style={styles.studentName}>{student.first_name} {student.last_name}</Text>
          <Text style={styles.studentNumber}>#{student.student_number}</Text>
        </View>
      </View>

      {/* School Fees - stacked cards for mobile */}
      <Text style={styles.sectionTitle}>School Fees</Text>
      {feeStructures.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="receipt-outline" size={32} color={colors.textMuted} />
          <Text style={styles.emptyText}>No fee structures found</Text>
        </View>
      ) : (
        feeStructures.map((fee) => (
          <View key={fee.id} style={styles.feeCard}>
            <View style={styles.feeCardHeader}>
              <Text style={styles.feeCategory}>{fee.category}</Text>
              <Text style={styles.planText}>{fee.payment_plan}</Text>
            </View>
            <View style={styles.feeAmounts}>
              <View style={styles.feeAmountItem}>
                <Text style={styles.feeAmountLabel}>Annual</Text>
                <Text style={styles.feeAmountValue}>{money(fee.annual_amount)}</Text>
              </View>
              <View style={styles.feeAmountDivider} />
              <View style={styles.feeAmountItem}>
                <Text style={styles.feeAmountLabel}>Monthly</Text>
                <Text style={styles.feeAmountValue}>{money(fee.monthly_installment ?? 0)}</Text>
              </View>
            </View>
          </View>
        ))
      )}

      {/* Additional Charges */}
      <Text style={styles.sectionTitle}>Additional Charges</Text>
      {additionalCharges.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="add-circle-outline" size={32} color={colors.textMuted} />
          <Text style={styles.emptyText}>No additional charges</Text>
        </View>
      ) : (
        additionalCharges.map((charge) => (
          <View key={charge.id} style={styles.chargeCard}>
            <View style={styles.chargeLeft}>
              <View style={styles.chargeInfo}>
                <Text style={styles.chargeDesc}>{charge.description}</Text>
                <Text style={styles.chargeMonth}>
                  {charge.month != null ? MONTHS[charge.month - 1] : 'N/A'} {currentYear}
                </Text>
              </View>
            </View>
            <View style={styles.chargeRight}>
              <Text style={styles.chargeAmount}>{money(charge.amount)}</Text>
              <Text style={[styles.chargeStatus, { color: charge.is_paid ? colors.success : colors.danger }]}>
                {charge.is_paid ? 'Paid' : 'Due'}
              </Text>
            </View>
          </View>
        ))
      )}

      {/* Total Outstanding */}
      <View style={styles.totalCard}>
        <View style={styles.totalLeft}>
          <Ionicons
            name={totalDue > 0 ? 'alert-circle' : 'checkmark-circle'}
            size={24}
            color={totalDue > 0 ? colors.danger : colors.success}
          />
          <Text style={styles.totalLabel}>Total Outstanding</Text>
        </View>
        <Text style={[styles.totalAmount, totalDue > 0 ? styles.amountRed : styles.amountGreen]}>
          {money(totalDue)}
        </Text>
      </View>

      {totalDue > 0 && (
        <TouchableOpacity
          style={styles.payBtn}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('PayOnline', {
            studentId: student.id,
            studentName: `${student.first_name} ${student.last_name}`,
            studentNumber: student.student_number,
            balance: totalDue,
          })}
        >
          <Ionicons name="card-outline" size={20} color={colors.white} />
          <Text style={styles.payBtnText}>Pay Now</Text>
          <Ionicons name="arrow-forward" size={18} color={colors.white} />
        </TouchableOpacity>
      )}

      {/* Navigate to Financial Details */}
      <TouchableOpacity
        style={styles.detailsBtn}
        activeOpacity={0.7}
        onPress={() => navigation.navigate('FinancialDetails', { student, gradeId })}
      >
        <View style={styles.detailsBtnLeft}>
          <Ionicons name="document-text-outline" size={20} color={colors.icon} />
          <View style={{ flex: 1 }}>
            <Text style={styles.detailsBtnTitle}>Financial Details</Text>
            <Text style={styles.detailsBtnSub}>View invoices, schedule & payment preference</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  studentCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primary, borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.lg, shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center', marginRight: spacing.md },
  studentInfo: { flex: 1 },
  studentName: { fontFamily: fonts.heading, fontSize: 18, fontWeight: '700', color: colors.white },
  studentNumber: { fontFamily: fonts.body, fontSize: 13, fontWeight: '500', color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  sectionTitle: { fontFamily: fonts.heading, fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: spacing.sm, marginTop: spacing.sm },
  feeCard: { backgroundColor: colors.white, borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.sm, shadowColor: colors.black, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 2 },
  feeCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  feeCategory: { fontFamily: fonts.body, fontSize: 15, fontWeight: '600', color: colors.text, flex: 1 },
  planText: { fontFamily: fonts.body, fontSize: 11, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 },
  feeAmounts: { flexDirection: 'row', alignItems: 'center' },
  feeAmountItem: { flex: 1, alignItems: 'center' },
  feeAmountLabel: { fontFamily: fonts.body, fontSize: 11, fontWeight: '700', color: colors.textMuted, marginBottom: 2 },
  feeAmountValue: { fontFamily: fonts.body, fontSize: 15, fontWeight: '700', color: colors.text },
  feeAmountDivider: { width: 1, height: 30, backgroundColor: colors.border },
  chargeCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.white, borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.sm, shadowColor: colors.black, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 2 },
  chargeLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  chargeInfo: { flex: 1 },
  chargeDesc: { fontFamily: fonts.body, fontSize: 15, fontWeight: '500', color: colors.text },
  chargeMonth: { fontFamily: fonts.body, fontSize: 11, fontWeight: '700', color: colors.textMuted, marginTop: 2 },
  chargeRight: { alignItems: 'flex-end' },
  chargeAmount: { fontFamily: fonts.body, fontSize: 15, fontWeight: '700', color: colors.text },
  chargeStatus: { fontFamily: fonts.body, fontSize: 11, fontWeight: '600', color: colors.textMuted, marginTop: 2 },
  totalCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: spacing.md, marginTop: spacing.sm },
  totalLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  totalLabel: { fontFamily: fonts.body, fontSize: 15, fontWeight: '700', color: colors.text },
  totalAmount: { fontFamily: fonts.heading, fontSize: 18, fontWeight: '700', color: colors.text },
  amountRed: { color: colors.danger },
  amountGreen: { color: colors.success },
  emptyCard: { backgroundColor: colors.white, borderRadius: radii.md, padding: spacing.xl, alignItems: 'center', marginBottom: spacing.sm },
  emptyText: { fontFamily: fonts.body, fontSize: 15, fontWeight: '400', color: colors.textMuted, marginTop: spacing.sm },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl, gap: spacing.md },
  errorTitle: { fontFamily: fonts.heading, fontSize: 18, fontWeight: '700', color: colors.text, textAlign: 'center' },
  errorMessage: { fontFamily: fonts.body, fontSize: 14, fontWeight: '400', color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.accent, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm + 2, borderRadius: radii.sm, marginTop: spacing.sm },
  retryBtnText: { fontFamily: fonts.heading, fontSize: 15, fontWeight: '700', color: colors.white },
  payBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
    gap: spacing.sm,
    shadowColor: colors.accentDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  payBtnText: {
    fontFamily: fonts.heading,
    fontSize: 16,
    fontWeight: '700',
    color: colors.white,
  },
  detailsBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.white, borderRadius: radii.md, padding: spacing.md, marginTop: spacing.sm, shadowColor: colors.black, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 2 },
  detailsBtnLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  detailsBtnTitle: { fontFamily: fonts.heading, fontSize: 15, fontWeight: '700', color: colors.text },
  detailsBtnSub: { fontFamily: fonts.body, fontSize: 12, fontWeight: '500', color: colors.textMuted, marginTop: 1 },
});
