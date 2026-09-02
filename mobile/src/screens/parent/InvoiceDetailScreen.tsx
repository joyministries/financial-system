import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useNavigation } from '@react-navigation/native';
import { invoicesApi } from '../../api/client';
import { colors, spacing, radii, fonts } from '../../theme';
import { Invoice } from '../../types';
import { downloadFile } from '../../utils/download';

const money = (n: number) =>
  `R ${Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const formatDate = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
};

export default function InvoiceDetailScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const [invoice, setInvoice] = useState<Invoice | null>(route.params?.invoice ?? null);
  const [loading, setLoading] = useState(!route.params?.invoice);
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async () => {
    const id = route.params?.invoiceId || route.params?.invoice?.id;
    if (!id) return;
    setLoading(true);
    try {
      const res = await invoicesApi.get(id);
      setInvoice(res.data);
    } catch { /* keep param-passed invoice if fetch fails */ }
    setLoading(false);
  }, [route.params?.invoiceId, route.params?.invoice?.id]);

  useEffect(() => { if (!route.params?.invoice) load(); }, [load, route.params?.invoice]);

  const handleDownload = async () => {
    if (!invoice) return;
    setDownloading(true);
    try {
      await downloadFile(invoicesApi.downloadUrl(invoice.id), `invoice-${invoice.invoice_number || invoice.id}.pdf`);
    } catch { /* downloadFile handles errors */ }
    setDownloading(false);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (!invoice) {
    return (
      <View style={styles.center}>
        <Ionicons name="receipt-outline" size={48} color={colors.textMuted} />
        <Text style={styles.emptyTitle}>Invoice not found</Text>
      </View>
    );
  }

  const isPaid = invoice.status === 'paid';
  const dateLabel = isPaid ? 'Paid on' : 'Due on';
  const dateValue = isPaid ? formatDate(invoice.created_at) : formatDate(invoice.due_date);
  const displayAmount = isPaid ? Number(invoice.subtotal) || 0 : Number(invoice.balance_due) || Number(invoice.subtotal) || 0;
  const items = invoice.items || [];

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      {/* Status block */}
      <View style={styles.statusBlock}>
        <Ionicons name={isPaid ? 'checkmark-circle-outline' : 'alert-circle-outline'} size={26} color={isPaid ? colors.success : colors.danger} />
        <Text style={styles.statusAmount}>{money(displayAmount)}</Text>
        <Text style={styles.statusSub}>
          {dateLabel} {dateValue} · {MONTH_NAMES[(invoice.month || 1) - 1]} {invoice.academic_year}
        </Text>
        <View style={styles.statusPill}>
          <View style={[styles.statusDot, { backgroundColor: isPaid ? colors.success : colors.warning }]} />
          <Text style={[styles.statusPillText, { color: isPaid ? colors.success : colors.warning }]}>
            {String(invoice.status || '').charAt(0).toUpperCase() + String(invoice.status || '').slice(1)}
          </Text>
        </View>
      </View>

      {/* Breakdown */}
      <View style={styles.breakdown}>
        {items.map((item: any, idx: number) => (
          <View key={idx} style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>{item.description}</Text>
            <Text style={styles.breakdownValue}>{money(Number(item.amount) || 0)}</Text>
          </View>
        ))}
        <View style={styles.breakdownTotal}>
          <Text style={styles.breakdownTotalLabel}>Total</Text>
          <Text style={styles.breakdownTotalValue}>{money(Number(invoice.subtotal) || 0)}</Text>
        </View>
      </View>

      {/* Meta */}
      <View style={styles.metaCard}>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Invoice number</Text>
          <Text style={styles.metaValue}>{invoice.invoice_number || '—'}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Issue date</Text>
          <Text style={styles.metaValue}>{formatDate(invoice.issue_date) || '—'}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Due date</Text>
          <Text style={styles.metaValue}>{formatDate(invoice.due_date) || '—'}</Text>
        </View>
        <View style={[styles.metaRow, styles.metaRowLast]}>
          <Text style={styles.metaLabel}>Amount paid</Text>
          <Text style={[styles.metaValue, { color: (Number(invoice.amount_paid) || 0) > 0 ? colors.success : colors.text }]}>
            {money(Number(invoice.amount_paid) || 0)}
          </Text>
        </View>
      </View>

      {/* Download */}
      <TouchableOpacity
        style={styles.btnPrimary}
        activeOpacity={0.85}
        onPress={handleDownload}
        disabled={downloading}
      >
        {downloading ? (
          <ActivityIndicator size="small" color={colors.white} />
        ) : (
          <>
            <Ionicons name="download-outline" size={18} color={colors.white} />
            <Text style={styles.btnText}>Download receipt</Text>
          </>
        )}
      </TouchableOpacity>

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyTitle: { fontFamily: fonts.heading, fontSize: 15, fontWeight: '700', color: colors.text },

  statusBlock: { alignItems: 'center', paddingVertical: 22, gap: 6 },
  statusAmount: { fontFamily: fonts.headingExtra, fontSize: 28, fontWeight: '800', color: colors.text },
  statusSub: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusPillText: {
    fontFamily: fonts.bodySemi,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },

  breakdown: {
    backgroundColor: colors.white,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: spacing.md,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  breakdownLabel: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary, flex: 1, paddingRight: 12 },
  breakdownValue: { fontFamily: fonts.monoSemi, fontSize: 13, fontWeight: '600', color: colors.text },
  breakdownTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.line,
    marginTop: 8,
    paddingTop: 12,
  },
  breakdownTotalLabel: { fontFamily: fonts.heading, fontSize: 14, fontWeight: '700', color: colors.text },
  breakdownTotalValue: { fontFamily: fonts.headingExtra, fontSize: 15, fontWeight: '800', color: colors.text },

  metaCard: {
    backgroundColor: colors.white,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    marginBottom: spacing.lg,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  metaRowLast: { borderBottomWidth: 0 },
  metaLabel: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary },
  metaValue: { fontFamily: fonts.bodySemi, fontSize: 13, fontWeight: '600', color: colors.text, maxWidth: '65%', textAlign: 'right' },

  btnPrimary: {
    backgroundColor: colors.primary,
    borderRadius: radii.sm,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  btnText: { fontFamily: fonts.heading, fontSize: 14, fontWeight: '700', color: colors.white },
});