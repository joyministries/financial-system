import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, fonts } from '../theme';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'neutral' | 'info';

const badgeColors: Record<BadgeVariant, { bg: string; text: string }> = {
  success: { bg: '#dcfce7', text: '#166534' },
  warning: { bg: '#fef9c3', text: '#854d0e' },
  danger: { bg: '#fee2e2', text: '#991b1b' },
  neutral: { bg: '#f3f4f6', text: '#6b7280' },
  info: { bg: '#dbeafe', text: '#1e40af' },
};

interface Props {
  variant: BadgeVariant;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
}

export default function Badge({ variant, label, icon }: Props) {
  const c = badgeColors[variant];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      {icon && <Ionicons name={icon} size={12} color={c.text} style={{ marginRight: 4 }} />}
      <Text style={[styles.text, { color: c.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.full,
  },
  text: { fontFamily: fonts.body, fontSize: 11, fontWeight: '700', color: colors.textMuted },
});
