import React, { useEffect, useState } from 'react';
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
import { authApi, gradesApi } from '../../api/client';
import { Grade } from '../../types';
import Input from '../../components/Input';
import Button from '../../components/Button';
import { colors, spacing, radii, fonts } from '../../theme';

/**
 * Full registration flow matching the web version:
 * Step 1: Account — email + password
 * Step 2: Parent details — first/last name, phone, address, PO box
 * Step 3: Child — first/last name, grade, relationship
 * Step 4: Other parent (optional)
 */

const STEPS = ['Account', 'Your Details', 'Child', 'Other Parent'];
const RELATIONSHIPS = ['father', 'mother'] as const;

export default function RegisterScreen({ navigation }: any) {
  const [step, setStep] = useState(0);

  // Step 1: Account
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);

  // Step 2: Parent details
  const [parentFirst, setParentFirst] = useState('');
  const [parentLast, setParentLast] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [poBox, setPoBox] = useState('');

  // Step 3: Child
  const [childFirst, setChildFirst] = useState('');
  const [childLast, setChildLast] = useState('');
  const [gradeId, setGradeId] = useState('');
  const [relationship, setRelationship] = useState<'father' | 'mother'>('father');

  // Step 4: Other parent (optional)
  const [otherFirst, setOtherFirst] = useState('');
  const [otherLast, setOtherLast] = useState('');
  const [otherPhone, setOtherPhone] = useState('');
  const [otherEmail, setOtherEmail] = useState('');

  // Grades
  const [grades, setGrades] = useState<Grade[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    gradesApi.list().then(res => {
      setGrades(res.data.filter(g => g.is_active && !g.is_archived));
    }).catch(() => {});
  }, []);

  const gradeName = grades.find(g => g.id === gradeId)?.name || '';

  const validateStep = (): boolean => {
    switch (step) {
      case 0:
        if (!email.trim()) { Alert.alert('Error', 'Enter your email'); return false; }
        if (password.length < 8) { Alert.alert('Error', 'Password must be at least 8 characters'); return false; }
        if (password !== confirmPassword) { Alert.alert('Error', 'Passwords do not match'); return false; }
        return true;
      case 1:
        if (!parentFirst.trim() || !parentLast.trim()) { Alert.alert('Error', 'Enter your first and last name'); return false; }
        return true;
      case 2:
        if (!childFirst.trim() || !childLast.trim()) { Alert.alert('Error', 'Enter child name'); return false; }
        if (!gradeId) { Alert.alert('Error', 'Select a grade'); return false; }
        return true;
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (validateStep()) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await authApi.registerParent({
        email: email.trim().toLowerCase(),
        password,
        first_name: parentFirst.trim(),
        last_name: parentLast.trim(),
        phone: phone.trim() || undefined,
        physical_address: address.trim() || undefined,
        po_box: poBox.trim() || undefined,
        relationship,
        student: {
          first_name: childFirst.trim(),
          last_name: childLast.trim(),
          grade_id: gradeId,
        },
        other_parent: otherFirst.trim() ? {
          first_name: otherFirst.trim(),
          last_name: otherLast.trim(),
          phone: otherPhone.trim() || undefined,
          email: otherEmail.trim() || undefined,
        } : null,
      });
      Alert.alert(
        'Application Submitted',
        `Registration for ${childFirst} ${childLast} is pending school approval.`,
        [{ text: 'Sign In', onPress: () => navigation.navigate('Login') }],
      );
    } catch (err: any) {
      Alert.alert('Registration failed', err?.response?.data?.detail || 'Please try again');
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
        {/* Logo */}
        <View style={styles.brand}>
          <View style={styles.brandIcon}>
            <Ionicons name="school" size={32} color={colors.white} />
          </View>
          <Text style={styles.brandTitle}>School Finance</Text>
          <Text style={styles.brandSubtitle}>Parent Registration</Text>
        </View>

        {/* Step indicator */}
        <View style={styles.stepsRow}>
          {STEPS.map((label, i) => (
            <View key={i} style={styles.stepItem}>
              <View style={[styles.stepDot, i === step && styles.stepDotActive, i < step && styles.stepDotDone]}>
                {i < step ? (
                  <Ionicons name="checkmark" size={12} color={colors.white} />
                ) : (
                  <Text style={[styles.stepDotText, i === step && styles.stepDotTextActive]}>{i + 1}</Text>
                )}
              </View>
              <Text style={[styles.stepLabel, i === step && styles.stepLabelActive]} numberOfLines={1}>{label}</Text>
            </View>
          ))}
        </View>

        {/* Card */}
        <View style={styles.card}>
          {/* Step 0: Account */}
          {step === 0 && (
            <>
              <Text style={styles.cardHeading}>Create Account</Text>
              <Input
                label="Email"
                value={email}
                onChangeText={setEmail}
                placeholder="you@email.com"
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <View style={styles.passWrap}>
                <Input
                  label="Password"
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Min 8 characters"
                  secureTextEntry={!showPass}
                  style={styles.passInput}
                />
                <TouchableOpacity onPress={() => setShowPass(!showPass)} style={styles.eyeBtn}>
                  <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
              <View style={styles.passWrap}>
                <Input
                  label="Confirm Password"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Repeat password"
                  secureTextEntry={!showPass}
                  style={styles.passInput}
                />
              </View>
              <Button title="Continue" onPress={handleNext} />
            </>
          )}

          {/* Step 1: Parent details */}
          {step === 1 && (
            <>
              <Text style={styles.cardHeading}>Your Details</Text>
              <View style={styles.row2}>
                <View style={styles.halfField}>
                  <Input label="First Name" value={parentFirst} onChangeText={setParentFirst} placeholder="e.g. John" autoCapitalize="words" />
                </View>
                <View style={styles.halfField}>
                  <Input label="Last Name" value={parentLast} onChangeText={setParentLast} placeholder="e.g. Smith" autoCapitalize="words" />
                </View>
              </View>
              <Input
                label="Phone Number"
                value={phone}
                onChangeText={setPhone}
                placeholder="+27 7X XXX XXXX"
                keyboardType="phone-pad"
              />
              <Input
                label="Physical Address"
                value={address}
                onChangeText={setAddress}
                placeholder="e.g. 123 Main St"
              />
              <Input
                label="PO Box"
                value={poBox}
                onChangeText={setPoBox}
                placeholder="e.g. PO Box 1234"
              />
              <View style={styles.navRow}>
                <Button title="Back" variant="outline" onPress={handleBack} style={styles.navBtn} />
                <Button title="Continue" onPress={handleNext} style={styles.navBtn} />
              </View>
            </>
          )}

          {/* Step 2: Child */}
          {step === 2 && (
            <>
              <Text style={styles.cardHeading}>Child Details</Text>
              <Text style={styles.sectionSub}>Who are you registering?</Text>
              <View style={styles.row2}>
                <View style={styles.halfField}>
                  <Input label="First Name" value={childFirst} onChangeText={setChildFirst} placeholder="e.g. James" autoCapitalize="words" />
                </View>
                <View style={styles.halfField}>
                  <Input label="Last Name" value={childLast} onChangeText={setChildLast} placeholder="e.g. Smith" autoCapitalize="words" />
                </View>
              </View>

              {/* Grade picker */}
              <Text style={styles.fieldLabel}>Grade Applying For</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.gradeScroll} contentContainerStyle={styles.gradeContent}>
                {grades.map(g => (
                  <TouchableOpacity
                    key={g.id}
                    style={[styles.gradeChip, gradeId === g.id && styles.gradeChipActive]}
                    onPress={() => setGradeId(g.id)}
                  >
                    <Text style={[styles.gradeChipText, gradeId === g.id && styles.gradeChipTextActive]}>
                      {g.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              {gradeName ? <Text style={styles.chipSummary}>Selected: {gradeName}</Text> : null}

              {/* Relationship */}
              <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Your Relationship</Text>
              <View style={styles.relRow}>
                {RELATIONSHIPS.map(r => (
                  <TouchableOpacity
                    key={r}
                    style={[styles.relChip, relationship === r && styles.relChipActive]}
                    onPress={() => setRelationship(r)}
                  >
                    <Ionicons name={r === 'father' ? 'man' : 'woman'} size={16} color={relationship === r ? colors.accentDark : colors.textMuted} />
                    <Text style={[styles.relText, relationship === r && styles.relTextActive]}>{r === 'father' ? 'Father' : 'Mother'}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.navRow}>
                <Button title="Back" variant="outline" onPress={handleBack} style={styles.navBtn} />
                <Button title="Continue" onPress={handleNext} style={styles.navBtn} />
              </View>
            </>
          )}

          {/* Step 3: Other parent (optional) */}
          {step === 3 && (
            <>
              <Text style={styles.cardHeading}>Other Parent</Text>
              <Text style={styles.sectionSub}>
                {relationship === 'father' ? "Mother's" : "Father's"} details (optional — skip if not applicable)
              </Text>
              <View style={styles.row2}>
                <View style={styles.halfField}>
                  <Input label="First Name" value={otherFirst} onChangeText={setOtherFirst} placeholder="First name" autoCapitalize="words" />
                </View>
                <View style={styles.halfField}>
                  <Input label="Last Name" value={otherLast} onChangeText={setOtherLast} placeholder="Last name" autoCapitalize="words" />
                </View>
              </View>
              <Input
                label="Phone Number"
                value={otherPhone}
                onChangeText={setOtherPhone}
                placeholder="Phone (optional)"
                keyboardType="phone-pad"
              />
              <Input
                label="Email"
                value={otherEmail}
                onChangeText={setOtherEmail}
                placeholder="Email (optional)"
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <Button
                title={loading ? 'Submitting...' : 'Submit Application'}
                onPress={handleSubmit}
                loading={loading}
                disabled={loading}
              />

              <TouchableOpacity onPress={handleBack} style={styles.backLink}>
                <Text style={styles.backLinkText}>Back to previous step</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.bottomLink}>
          <Text style={styles.bottomLinkText}>
            Already have an account? <Text style={styles.bottomLinkBold}>Sign In</Text>
          </Text>
        </TouchableOpacity>
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
  brand: { alignItems: 'center', marginBottom: 20 },
  brandIcon: {
    width: 64, height: 64, borderRadius: 20, backgroundColor: colors.primary,
    justifyContent: 'center', alignItems: 'center', marginBottom: 14,
    shadowColor: colors.primary, shadowOpacity: 0.3, shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  brandTitle: { fontFamily: fonts.headingExtra, fontSize: 22, fontWeight: '800', color: colors.text },
  brandSubtitle: { fontFamily: fonts.bodyMedium, fontSize: 13, fontWeight: '500', color: colors.textSecondary, marginTop: 4 },

  /* Step indicator */
  stepsRow: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginBottom: 20 },
  stepItem: { alignItems: 'center', gap: 4 },
  stepDot: {
    width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border,
    justifyContent: 'center', alignItems: 'center', backgroundColor: colors.white,
  },
  stepDotActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  stepDotDone: { backgroundColor: colors.success, borderColor: colors.success },
  stepDotText: { fontFamily: fonts.mono, fontSize: 11, fontWeight: '500', color: colors.textMuted },
  stepDotTextActive: { color: colors.white },
  stepLabel: { fontFamily: fonts.body, fontSize: 10, fontWeight: '500', color: colors.textMuted, maxWidth: 60, textAlign: 'center' },
  stepLabelActive: { color: colors.accentDark, fontWeight: '700' },

  /* Card */
  card: {
    backgroundColor: colors.white, borderRadius: 24, padding: 26, paddingBottom: 22,
    borderWidth: 1, borderColor: colors.border,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 }, elevation: 2,
  },
  cardHeading: {
    fontFamily: fonts.headingExtra, fontSize: 19, fontWeight: '800',
    color: colors.text, marginBottom: 6,
  },
  sectionSub: {
    fontFamily: fonts.body, fontSize: 13, fontWeight: '400',
    color: colors.textSecondary, marginBottom: 16,
  },

  /* Two-column row */
  row2: { flexDirection: 'row', gap: 10 },
  halfField: { flex: 1 },

  /* Password */
  passWrap: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 16 },
  passInput: { flex: 1, marginBottom: 0 },
  eyeBtn: { position: 'absolute', right: 14, bottom: 18, padding: 4 },

  /* Grade chips */
  fieldLabel: { fontFamily: fonts.body, fontSize: 12.5, fontWeight: '700', color: colors.text, marginBottom: 7 },
  gradeScroll: { marginBottom: 4 },
  gradeContent: { gap: 8, paddingVertical: 4 },
  gradeChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: radii.sm,
    backgroundColor: colors.bgCanvas, borderWidth: 1, borderColor: colors.line,
  },
  gradeChipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  gradeChipText: { fontFamily: fonts.body, fontSize: 13, fontWeight: '500', color: colors.textSecondary },
  gradeChipTextActive: { color: colors.accentDark, fontWeight: '700' },
  chipSummary: { fontFamily: fonts.body, fontSize: 12, fontWeight: '600', color: colors.accentDark, marginTop: 6 },

  /* Relationship */
  relRow: { flexDirection: 'row', gap: 10 },
  relChip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, borderRadius: radii.sm, borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.white,
  },
  relChipActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  relText: { fontFamily: fonts.body, fontSize: 14, fontWeight: '500', color: colors.textSecondary },
  relTextActive: { color: colors.accentDark, fontWeight: '700' },

  /* Nav buttons */
  navRow: { flexDirection: 'row', gap: 12, marginTop: 20 },
  navBtn: { flex: 1 },

  backLink: { alignItems: 'center', marginTop: 16 },
  backLinkText: { fontFamily: fonts.body, fontSize: 13, fontWeight: '500', color: colors.textSecondary },

  /* Bottom link */
  bottomLink: { alignItems: 'center', marginTop: 22, marginBottom: 16 },
  bottomLinkText: { fontFamily: fonts.body, fontSize: 13, fontWeight: '500', color: colors.textSecondary },
  bottomLinkBold: { color: colors.accentDark, fontWeight: '700' },
});
