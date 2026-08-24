import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import Input from '../../components/Input';
import Button from '../../components/Button';
import { colors, spacing, radii, fonts } from '../../theme';

/**
 * Spec (Sign In):
 * - Radial gradient bg: accent-soft #FBF2DD at top → app-bg #F7F4EE by ~55%
 * - 34px top, 26px sides, 40px bottom padding
 * - Logo: 64×64 rounded square (radius 20), ink gradient bg, gold graduation-cap icon, drop shadow, 18px below
 * - Title "School Finance": Manrope 800, 23px, ink, centered
 * - Subtitle "Parent Portal": Inter 500, 13px, text-secondary, centered, 4px below title
 * - 34px gap before card
 * - Card: white, radius 24px, padding 26px/22px, subtle shadow, 1px hairline border
 * - Heading "Welcome back": Manrope 800, 19px, 20px margin below
 * - Inputs: label 12.5px weight 700 ink, 7px below; 1.5px border, radius 12, 16px gap between fields
 * - Primary button full width below fields
 * - "Forgot password?" centered, gold accent-dark, weight 700, 13px, 16px margin above
 * - Divider: thin hairline + small caps muted "NEW HERE" + hairline, 22px above / 16px below
 * - Outline button "Create an account"
 */
export default function LoginScreen({ navigation }: any) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Error', 'Enter email and password');
      return;
    }
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
    } catch (err: any) {
      Alert.alert('Login failed', err?.response?.data?.detail || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Gradient background */}
      <LinearGradient
        colors={['#FBF2DD', '#F7F4EE']}
        locations={[0, 0.55]}
        style={StyleSheet.absoluteFillObject}
      />
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        {/* Logo mark */}
        <View style={styles.brand}>
          <View style={styles.brandIcon}>
            <Ionicons name="school" size={32} color={colors.white} />
          </View>
          <Text style={styles.brandTitle}>School Finance</Text>
          <Text style={styles.brandSubtitle}>Parent Portal</Text>
        </View>

        {/* Sign-in card */}
        <View style={styles.card}>
          <Text style={styles.cardHeading}>Welcome back</Text>

          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <View style={styles.passWrap}>
            <Input
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="Enter password"
              secureTextEntry={!showPass}
              style={styles.passInput}
            />
            <TouchableOpacity
              onPress={() => setShowPass(!showPass)}
              style={styles.eyeBtn}
            >
              <Ionicons
                name={showPass ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={colors.textMuted}
              />
            </TouchableOpacity>
          </View>

          <Button title="Sign In" onPress={handleLogin} loading={loading} />

          <TouchableOpacity
            onPress={() => navigation.navigate('ForgotPassword')}
            style={styles.forgotLink}
          >
            <Text style={styles.forgotText}>Forgot password?</Text>
          </TouchableOpacity>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerLabel}>NEW HERE</Text>
            <View style={styles.dividerLine} />
          </View>

          <Button
            title="Create an account"
            variant="outline"
            onPress={() => navigation.navigate('Register')}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flexGrow: 1,
    paddingTop: 34,
    paddingBottom: 40,
    paddingHorizontal: 26,
  },
  brand: {
    alignItems: 'center',
    marginBottom: 34,
  },
  brandIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
    shadowColor: colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  brandTitle: {
    fontFamily: fonts.headingExtra,
    fontSize: 23,
    fontWeight: '800',
    color: colors.text,
  },
  brandSubtitle: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
    marginTop: 4,
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
    marginBottom: 20,
  },
  passWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 16,
  },
  passInput: {
    flex: 1,
    marginBottom: 0,
  },
  eyeBtn: {
    position: 'absolute',
    right: 14,
    bottom: 18,
    padding: 4,
  },
  forgotLink: {
    alignItems: 'center',
    marginTop: 16,
  },
  forgotText: {
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: '700',
    color: colors.accentDark,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 22,
    marginBottom: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.line,
  },
  dividerLabel: {
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: '700',
    marginHorizontal: 14,
    color: colors.textMuted,
    letterSpacing: 1,
  },
});
