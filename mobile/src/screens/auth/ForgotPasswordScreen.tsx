import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { authApi } from '../../api/client';
import Input from '../../components/Input';
import Button from '../../components/Button';
import { colors, spacing, radii, fonts } from '../../theme';

export default function ForgotPasswordScreen({ navigation }: any) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim()) {
      Alert.alert('Error', 'Enter your email address');
      return;
    }
    setLoading(true);
    try {
      await authApi.forgotPassword(email.trim());
      setSent(true);
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.detail || 'Could not send reset email');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <LinearGradient
        colors={['#FBF2DD', '#F7F4EE']}
        locations={[0, 0.55]}
        style={StyleSheet.absoluteFillObject}
      />
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brand}>
          <View style={styles.brandIcon}>
            <Ionicons name="key-outline" size={28} color={colors.white} />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardHeading}>Reset Password</Text>
          <Text style={styles.cardSub}>
            Enter your email and we will send you a reset link
          </Text>

          {sent ? (
            <View style={styles.sentWrap}>
              <View style={styles.sentIcon}>
                <Ionicons name="mail-open-outline" size={40} color={colors.success} />
              </View>
              <Text style={styles.sentTitle}>Check your email</Text>
              <Text style={styles.sentText}>
                We sent a password reset link to {email}
              </Text>
            </View>
          ) : (
            <>
              <Input
                label="Email"
                value={email}
                onChangeText={setEmail}
                placeholder="you@email.com"
                keyboardType="email-address"
              />
              <Button
                title="Send Reset Link"
                onPress={handleSubmit}
                loading={loading}
              />
            </>
          )}
        </View>

        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.bottomLink}
        >
          <Ionicons
            name="arrow-back-outline"
            size={16}
            color={colors.accentDark}
            style={{ marginRight: 6 }}
          />
          <Text style={styles.bottomLinkText}>Back to Sign In</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 26,
    paddingVertical: 40,
  },
  brand: {
    alignItems: 'center',
    marginBottom: 24,
  },
  brandIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 24,
    padding: 26,
    paddingBottom: 22,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cardHeading: {
    fontFamily: fonts.headingExtra,
    fontSize: 19,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 6,
  },
  cardSub: {
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: '400',
    color: colors.textSecondary,
    marginBottom: 24,
  },
  sentWrap: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  sentIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.successSoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  sentTitle: {
    fontFamily: fonts.headingExtra,
    fontSize: 19,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 8,
  },
  sentText: {
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: '400',
    color: colors.textSecondary,
    textAlign: 'center',
  },
  bottomLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    marginBottom: 16,
  },
  bottomLinkText: {
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: '600',
    color: colors.accentDark,
  },
});
