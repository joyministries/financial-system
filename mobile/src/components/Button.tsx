import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet, type ViewStyle, type TextStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radii, spacing, fonts } from '../theme';

interface Props {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'outline' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
}

/**
 * Spec:
 *   Primary: gradient #D2A24C → #A6742A top-to-bottom, white text, weight 700,
 *            15px padding, radius 12px, soft drop shadow
 *   Outline: white bg, 1.5px border hairline, ink text, weight 700, radius 12px, no shadow
 *   Danger actions: Outline style with danger-colored border/text
 */
export default function Button({ title, onPress, variant = 'primary', disabled, loading, icon, style }: Props) {
  if (variant === 'primary') {
    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled || loading}
        activeOpacity={0.7}
        style={[styles.shadowWrap, disabled && { opacity: 0.5 }, style]}
      >
        <LinearGradient
          colors={['#D2A24C', '#A6742A']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.primaryBtn}
        >
          {loading ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <>
              {icon}
              <Text style={styles.primaryLabel}>{title}</Text>
            </>
          )}
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  const isDanger = variant === 'danger';
  const borderColor = isDanger ? colors.danger : colors.border;
  const textColor = isDanger ? colors.danger : colors.primary;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.7}
      style={[
        styles.outlineBtn,
        { borderColor },
        disabled && { opacity: 0.5 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={textColor} />
      ) : (
        <>
          {icon}
          <Text style={[styles.outlineLabel, { color: textColor }]}>{title}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  shadowWrap: {
    shadowColor: '#A6742A',
    shadowOpacity: 0.35,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: 15,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.sm,
  },
  primaryLabel: {
    fontFamily: fonts.heading,
    fontSize: 15,
    fontWeight: '700',
    color: colors.white,
    flexShrink: 1,
  },
  outlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: 15,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.sm,
    borderWidth: 1.5,
    backgroundColor: colors.white,
  },
  outlineLabel: {
    fontFamily: fonts.heading,
    fontSize: 15,
    fontWeight: '700',
    flexShrink: 1,
  },
});
