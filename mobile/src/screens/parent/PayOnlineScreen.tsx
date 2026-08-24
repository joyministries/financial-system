import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Linking,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  AppState,
  AppStateStatus,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { payfastApi, paymentsApi } from '../../api/client';
import Button from '../../components/Button';
import { colors, spacing, radii, fonts } from '../../theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type PayFastForm = {
  payment_id: string;
  payfast_url: string;
  payment_url: string;
  form_fields: Record<string, string>;
};

type PaymentStatus = 'idle' | 'initiating' | 'waiting' | 'polling' | 'network_down' | 'success' | 'failed' | 'cancelled' | 'error';

const NETWORK_FAIL_THRESHOLD = 3; // consecutive poll failures before showing network-down state
const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 300000; // 5 minutes max

const money = (amount: number) =>
  `R ${Number(amount || 0).toLocaleString('en-ZA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export default function PayOnlineScreen({ route }: any) {
  const navigation = useNavigation<any>();
  const { studentId, studentName, studentNumber, balance, itemName } = route.params;

  const safeBalance = Number(balance) || 0;
  const [amount, setAmount] = useState(safeBalance > 0 ? safeBalance.toFixed(2) : '');
  const [payItemName, setPayItemName] = useState(
    itemName || `School Fees - ${studentName}`
  );
  const [payForm, setPayForm] = useState<PayFastForm | null>(null);
  const [payCopied, setPayCopied] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const networkFailCountRef = useRef(0);
  const appStateRef = useRef(AppState.currentState);

  const numericAmount = parseFloat(amount) || 0;
  const isValidAmount = numericAmount >= 0.01;

  useEffect(() => {
    if (safeBalance > 0 && !itemName) {
      setPayItemName(`School Fees - ${studentName}`);
    }
  }, [safeBalance, itemName, studentName]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    };
  }, []);

  const checkPaymentStatus = useCallback(async (paymentId: string) => {
    try {
      const res = await paymentsApi.list({ limit: 10, offset: 0 });
      const payments = res.data?.items || [];
      const match = payments.find((p: any) => p.id === paymentId || p.reference_number === paymentId);

      // Reset network fail counter on successful API call
      networkFailCountRef.current = 0;

      if (match && match.status === 'verified') {
        setPaymentStatus('success');
        setStatusMessage('Payment verified successfully!');
        if (pollRef.current) clearInterval(pollRef.current);
        if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
      } else if (match && match.status === 'rejected') {
        setPaymentStatus('failed');
        setStatusMessage('Payment was rejected. Please try again.');
        if (pollRef.current) clearInterval(pollRef.current);
        if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
      }
      // If pending/not found, keep polling
    } catch {
      // Network error — track consecutive failures
      networkFailCountRef.current += 1;
      if (networkFailCountRef.current >= NETWORK_FAIL_THRESHOLD) {
        setPaymentStatus('network_down');
        setStatusMessage(
          'Unable to reach the server. Check your internet connection and try again. ' +
          'Your payment is safe — it will be confirmed automatically once you reconnect.'
        );
        if (pollRef.current) clearInterval(pollRef.current);
        if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
      }
      // Under threshold: keep polling silently
    }
  }, []);

  const startPolling = useCallback((paymentId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    networkFailCountRef.current = 0;
    setPaymentStatus('polling');
    setStatusMessage('Waiting for payment confirmation...');

    pollRef.current = setInterval(() => checkPaymentStatus(paymentId), POLL_INTERVAL_MS);

    // Global timeout after 5 minutes
    pollTimeoutRef.current = setTimeout(() => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      // Only show timeout if still polling (not already success/failed/network_down)
      setPaymentStatus(prev => {
        if (prev === 'polling') {
          setStatusMessage(
            'Payment confirmation is taking longer than expected. ' +
            'If you completed the payment, check your email for a receipt or try again.'
          );
          return 'failed';
        }
        return prev;
      });
    }, POLL_TIMEOUT_MS);
  }, [checkPaymentStatus]);

  // Detect when user returns from PayFast (app comes back to foreground)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (appStateRef.current.match(/inactive|background/) && nextState === 'active') {
        // App just came back to foreground — user may have completed or cancelled payment
        if ((paymentStatus === 'waiting' || paymentStatus === 'network_down') && payForm) {
          networkFailCountRef.current = 0; // reset before retry
          setPaymentStatus('polling');
          setStatusMessage('Checking payment status...');
          checkPaymentStatus(payForm.payment_id);
        }
      }
      appStateRef.current = nextState;
    });
    return () => subscription.remove();
  }, [paymentStatus, payForm, checkPaymentStatus]);

  const handleInitiatePayment = async () => {
    if (!isValidAmount) {
      Alert.alert('Invalid Amount', 'Please enter an amount of at least R 0.01.');
      return;
    }
    setPaymentStatus('initiating');
    setStatusMessage('Creating payment link...');
    try {
      const response = await payfastApi.initiate({
        student_id: studentId,
        amount: numericAmount,
        item_name: payItemName,
      });
      setPayForm(response.data);
      setPaymentStatus('waiting');
      setStatusMessage('Tap "Open in Browser" to complete payment.');
    } catch (err: any) {
      setPaymentStatus('error');
      const detail = err?.response?.data?.detail;
      if (err?.code === 'ECONNABORTED' || err?.message?.includes('timeout')) {
        setStatusMessage('Connection timed out. Check your internet and try again.');
      } else if (!err?.response) {
        setStatusMessage('Network error. Check your internet connection and try again.');
      } else {
        setStatusMessage(detail || 'Failed to initiate payment. Please try again.');
      }
    }
  };

  const handleOpenPayFast = async () => {
    if (!payForm) return;
    const url = payForm.payment_url;
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        setPaymentStatus('waiting');
        setStatusMessage('Complete your payment in the browser. We\'ll check automatically when you return.');
        await Linking.openURL(url);
      } else {
        Alert.alert('Cannot Open URL', 'No browser available on this device.');
      }
    } catch {
      setPaymentStatus('error');
      setStatusMessage('Could not open browser. Please copy the URL and open it manually.');
    }
  };

  const handleCopyUrl = async () => {
    if (!payForm) return;
    const url = payForm.payment_url;
    try {
      await Clipboard.setStringAsync(url);
      setPayCopied(true);
      setTimeout(() => setPayCopied(false), 2000);
    } catch {
      Alert.alert('Copy Failed', 'Could not copy URL to clipboard.');
    }
  };

  const handleRetry = () => {
    setPaymentStatus('idle');
    setPayForm(null);
    setStatusMessage('');
    networkFailCountRef.current = 0;
    if (pollRef.current) clearInterval(pollRef.current);
    if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
  };

  const handleGoBack = () => {
    if (paymentStatus === 'waiting' || paymentStatus === 'polling') {
      Alert.alert(
        'Payment In Progress',
        'A payment may be processing. Are you sure you want to go back?',
        [
          { text: 'Stay', style: 'cancel' },
          { text: 'Go Back', style: 'destructive', onPress: () => navigation.goBack() },
        ]
      );
    } else {
      navigation.goBack();
    }
  };

  const renderStatusBanner = () => {
    if (paymentStatus === 'idle' || paymentStatus === 'initiating') return null;

    const configs: Record<string, { icon: string; bg: string; fg: string }> = {
      waiting: { icon: 'time-outline', bg: colors.warningSoft, fg: colors.warning },
      polling: { icon: 'sync-outline', bg: colors.info + '15', fg: colors.info },
      network_down: { icon: 'wifi-outline', bg: colors.dangerSoft, fg: colors.danger },
      success: { icon: 'checkmark-circle', bg: colors.successSoft, fg: colors.success },
      failed: { icon: 'close-circle', bg: colors.dangerSoft, fg: colors.danger },
      cancelled: { icon: 'alert-circle-outline', bg: colors.warningSoft, fg: colors.warning },
      error: { icon: 'warning-outline', bg: colors.dangerSoft, fg: colors.danger },
    };

    const cfg = configs[paymentStatus] || configs.error;

    return (
      <View style={[styles.statusBanner, { backgroundColor: cfg.bg }]}>
        {paymentStatus === 'polling' ? (
          <ActivityIndicator size="small" color={cfg.fg} style={{ marginRight: 8 }} />
        ) : (
          <Ionicons name={cfg.icon as any} size={20} color={cfg.fg} style={{ marginRight: 8 }} />
        )}
        <Text style={[styles.statusText, { color: cfg.fg, flex: 1 }]}>{statusMessage}</Text>
        {paymentStatus === 'network_down' && (
          <TouchableOpacity
            style={[styles.statusRetryBtn, { borderColor: cfg.fg }]}
            onPress={() => {
              if (payForm) {
                networkFailCountRef.current = 0;
                setPaymentStatus('polling');
                setStatusMessage('Retrying...');
                checkPaymentStatus(payForm.payment_id);
                // Also restart polling
                startPolling(payForm.payment_id);
              }
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="refresh" size={14} color={cfg.fg} />
            <Text style={[styles.statusRetryText, { color: cfg.fg }]}>Retry</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Custom back button overlay — since bottom nav disappears on stack screens */}
      <TouchableOpacity style={styles.backButton} onPress={handleGoBack} activeOpacity={0.7}>
        <Ionicons name="chevron-back" size={24} color={colors.text} />
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>

      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Status banner */}
        {renderStatusBanner()}

        {/* Header icon */}
        <View style={styles.heroSection}>
          <View style={styles.heroIcon}>
            <Ionicons name="card-outline" size={36} color={colors.accent} />
          </View>
          <Text style={styles.title}>Pay Online</Text>
          <Text style={styles.subtitle}>Secure payment via PayFast</Text>
        </View>

        {/* Student info card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.cardIcon, { backgroundColor: '#E8EAF0' }]}>
              <Ionicons name="person-circle-outline" size={20} color={colors.primary} />
            </View>
            <Text style={styles.cardTitle}>Student Info</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.label}>Name</Text>
            <Text style={styles.value}>{studentName}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.label}>Student No.</Text>
            <Text style={styles.value}>{studentNumber}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Text style={styles.label}>Outstanding</Text>
            <Text style={styles.balance}>{money(safeBalance)}</Text>
          </View>
        </View>

        {!payForm ? (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={[styles.cardIcon, { backgroundColor: colors.warningSoft }]}>
                <Ionicons name="cash-outline" size={20} color={colors.warning} />
              </View>
              <Text style={styles.cardTitle}>Payment Details</Text>
            </View>

            <Text style={styles.fieldLabel}>Item Name</Text>
            <TextInput
              style={styles.textInput}
              value={payItemName}
              onChangeText={setPayItemName}
              placeholder="e.g. School Fees - Term 1"
              placeholderTextColor={colors.placeholder}
            />

            <Text style={styles.fieldLabel}>Amount (ZAR)</Text>
            <View style={styles.amountInputWrap}>
              <Text style={styles.currencyPrefix}>R</Text>
              <TextInput
                style={styles.amountInput}
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={colors.placeholder}
              />
            </View>
            {!isValidAmount && amount.length > 0 && (
              <Text style={styles.errorText}>Minimum amount is R 0.01</Text>
            )}

            <Button
              title={paymentStatus === 'initiating' ? 'Initiating...' : 'Continue to PayFast'}
              onPress={handleInitiatePayment}
              disabled={paymentStatus === 'initiating' || !isValidAmount}
              loading={paymentStatus === 'initiating'}
              style={styles.payButton}
            />
          </View>
        ) : (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={[styles.cardIcon, { backgroundColor: paymentStatus === 'success' ? colors.successSoft : colors.accentSoft }]}>
                <Ionicons
                  name={paymentStatus === 'success' ? 'checkmark-circle' : 'open-outline'}
                  size={20}
                  color={paymentStatus === 'success' ? colors.success : colors.accentDark}
                />
              </View>
              <Text style={styles.cardTitle}>
                {paymentStatus === 'success' ? 'Payment Confirmed' : 'Payment Ready'}
              </Text>
            </View>

            {paymentStatus !== 'success' && (
              <>
                <View style={styles.infoBox}>
                  <Ionicons name="information-circle-outline" size={18} color={colors.info} />
                  <Text style={styles.infoBoxText}>
                    Copy the URL or open it in your browser to complete checkout. You can safely leave this screen — we'll confirm automatically.
                  </Text>
                </View>

                <Text style={styles.fieldLabel}>Payment URL</Text>
                <View style={styles.urlBox}>
                  <Text style={styles.urlText} numberOfLines={3}>
                    {payForm.payment_url}
                  </Text>
                </View>

                <View style={styles.urlActions}>
                  <TouchableOpacity style={styles.copyBtn} onPress={handleCopyUrl} activeOpacity={0.7}>
                    <Ionicons name={payCopied ? 'checkmark' : 'copy-outline'} size={16} color={payCopied ? colors.success : colors.primary} />
                    <Text style={[styles.copyBtnText, payCopied && { color: colors.success }]}>
                      {payCopied ? 'Copied!' : 'Copy'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.openBtn} onPress={handleOpenPayFast} activeOpacity={0.7}>
                    <Ionicons name="open-outline" size={16} color={colors.white} />
                    <Text style={styles.openBtnText}>Open in Browser</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {paymentStatus === 'success' && (
              <View style={styles.successBox}>
                <Ionicons name="checkmark-circle" size={48} color={colors.success} />
                <Text style={styles.successTitle}>Payment Received!</Text>
                <Text style={styles.successSub}>
                  Your payment of {money(numericAmount)} has been verified. A receipt will be generated shortly.
                </Text>
                <Button
                  title="Done"
                  onPress={() => navigation.goBack()}
                  style={styles.payButton}
                />
              </View>
            )}

            {(paymentStatus === 'failed' || paymentStatus === 'error' || paymentStatus === 'network_down') && (
              <TouchableOpacity style={styles.retryBtn} onPress={handleRetry} activeOpacity={0.7}>
                <Ionicons name="refresh-outline" size={18} color={colors.primary} />
                <Text style={styles.retryText}>Try Again</Text>
              </TouchableOpacity>
            )}

            <View style={styles.paymentIdBox}>
              <Text style={styles.paymentIdLabel}>Payment ID</Text>
              <Text style={styles.paymentIdValue}>{payForm.payment_id}</Text>
            </View>
          </View>
        )}

        {!payForm && (
          <View style={[styles.infoBox, { marginTop: spacing.sm }]}>
            <Ionicons name="lock-closed-outline" size={18} color={colors.success} />
            <Text style={styles.infoBoxText}>
              Payments are processed securely through PayFast. You will be redirected to complete your payment. You can safely navigate away — we'll track the status.
            </Text>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },

  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    gap: 2,
  },
  backText: { fontFamily: fonts.body, fontSize: 15, fontWeight: '600', color: colors.text },

  heroSection: { alignItems: 'center', paddingVertical: spacing.lg },
  heroIcon: {
    width: 64, height: 64, borderRadius: radii.lg,
    backgroundColor: colors.primary,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: spacing.md,
    shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  title: { fontFamily: fonts.headingExtra, fontSize: 22, fontWeight: '800', color: colors.text, textAlign: 'center' },
  subtitle: { fontFamily: fonts.body, fontSize: 14, fontWeight: '400', color: colors.textSecondary, marginTop: spacing.xs, textAlign: 'center' },

  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  statusText: { fontFamily: fonts.body, fontSize: 13, fontWeight: '500', lineHeight: 18 },
  statusRetryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.sm,
    borderWidth: 1.5,
    gap: 4,
    marginLeft: 8,
  },
  statusRetryText: { fontFamily: fonts.body, fontSize: 12, fontWeight: '700' },

  card: {
    backgroundColor: colors.white, borderRadius: radii.md, padding: spacing.md,
    marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  cardIcon: { width: 36, height: 36, borderRadius: 9, justifyContent: 'center', alignItems: 'center', marginRight: spacing.sm },
  cardTitle: { fontFamily: fonts.heading, fontSize: 18, fontWeight: '700', color: colors.text },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.xs + 2 },
  label: { fontFamily: fonts.body, fontSize: 15, fontWeight: '400', color: colors.textSecondary, flex: 1 },
  value: { fontFamily: fonts.body, fontSize: 15, fontWeight: '600', color: colors.text, textAlign: 'right', flex: 1 },
  balance: { fontFamily: fonts.monoSemi, fontSize: 18, fontWeight: '700', color: colors.primary, textAlign: 'right' },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  fieldLabel: { fontFamily: fonts.body, fontSize: 12.5, fontWeight: '700', color: colors.textSecondary, marginBottom: spacing.xs, marginTop: spacing.md },
  textInput: {
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radii.sm,
    paddingHorizontal: spacing.md, paddingVertical: 13, fontSize: 15,
    fontFamily: fonts.body, color: colors.text, backgroundColor: colors.white,
  },
  amountInputWrap: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1.5,
    borderColor: colors.border, borderRadius: radii.sm, backgroundColor: colors.white, overflow: 'hidden',
  },
  currencyPrefix: {
    fontFamily: fonts.monoSemi, fontSize: 18, fontWeight: '700', color: colors.primary,
    paddingHorizontal: spacing.md, paddingVertical: 13, backgroundColor: colors.accentSoft,
  },
  amountInput: { flex: 1, fontSize: 18, fontFamily: fonts.monoSemi, fontWeight: '600', color: colors.text, paddingHorizontal: spacing.md, paddingVertical: 13 },
  errorText: { fontFamily: fonts.body, fontSize: 12, color: colors.danger, marginTop: spacing.xs },
  payButton: { marginTop: spacing.lg },
  infoBox: {
    flexDirection: 'row', backgroundColor: colors.bgCanvas,
    borderRadius: radii.md, padding: spacing.md, alignItems: 'flex-start', gap: spacing.sm,
  },
  infoBoxText: { fontFamily: fonts.body, fontSize: 13, fontWeight: '400', color: colors.textSecondary, flex: 1, lineHeight: 18 },
  urlBox: { backgroundColor: colors.bgCanvas, borderRadius: radii.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  urlText: { fontFamily: fonts.mono, fontSize: 12, fontWeight: '500', color: colors.text },
  urlActions: { flexDirection: 'row', marginTop: spacing.md, gap: spacing.sm },
  copyBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: spacing.md - 2, borderRadius: radii.sm, borderWidth: 1.5, borderColor: colors.primary, gap: spacing.xs,
  },
  copyBtnText: { fontFamily: fonts.body, fontSize: 14, fontWeight: '600', color: colors.primary },
  openBtn: {
    flex: 1.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: spacing.md - 2, borderRadius: radii.sm, backgroundColor: colors.accent, gap: spacing.xs,
  },
  openBtnText: { fontFamily: fonts.body, fontSize: 14, fontWeight: '600', color: colors.white },
  successBox: { alignItems: 'center', paddingVertical: spacing.lg, gap: spacing.sm },
  successTitle: { fontFamily: fonts.headingExtra, fontSize: 18, fontWeight: '800', color: colors.success },
  successSub: { fontFamily: fonts.body, fontSize: 13, fontWeight: '400', color: colors.textSecondary, textAlign: 'center', lineHeight: 18 },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: spacing.md, borderRadius: radii.sm, borderWidth: 1.5,
    borderColor: colors.primary, backgroundColor: colors.white,
    marginTop: spacing.md, gap: spacing.xs,
  },
  retryText: { fontFamily: fonts.body, fontSize: 14, fontWeight: '600', color: colors.primary },
  paymentIdBox: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  paymentIdLabel: { fontFamily: fonts.body, fontSize: 12, fontWeight: '500', color: colors.textMuted, marginBottom: spacing.xs },
  paymentIdValue: { fontFamily: fonts.mono, fontSize: 13, fontWeight: '500', color: colors.text },
});
