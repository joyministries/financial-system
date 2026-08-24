import React from 'react';
import { TextInput, View, Text, StyleSheet, type ViewStyle } from 'react-native';
import { colors, radii, spacing, fonts } from '../theme';

interface Props {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  multiline?: boolean;
  numberOfLines?: number;
  error?: string;
  style?: ViewStyle;
}

/**
 * Spec:
 *   Label: 12.5px, weight 700, ink, 7px margin below
 *   Input: 1.5px hairline border, radius 12px, padding 13px/14px
 *   Gap between fields: 16px
 */
export default function Input({ label, value, onChangeText, placeholder, secureTextEntry, keyboardType, autoCapitalize, multiline, numberOfLines, error, style }: Props) {
  return (
    <View style={[styles.wrap, style]}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        multiline={multiline}
        numberOfLines={numberOfLines}
        style={[styles.input, error && styles.inputError, multiline && { height: (numberOfLines || 3) * 20 + 26 }]}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 16 },
  label: { fontFamily: fonts.body, fontSize: 12.5, fontWeight: '700', color: colors.text, marginBottom: 7 },
  input: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    fontFamily: fonts.body,
    color: colors.text,
    backgroundColor: colors.white,
  },
  inputError: { borderColor: colors.danger },
  error: { fontFamily: fonts.body, fontSize: 12, color: colors.danger, marginTop: 4 },
});
