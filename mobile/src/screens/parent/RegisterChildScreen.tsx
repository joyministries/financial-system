import React, { useState, useEffect } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { studentsApi, gradesApi } from '../../api/client';
import { colors, spacing, radii, fonts } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import Input from '../../components/Input';
import Button from '../../components/Button';
import type { Grade } from '../../types';

const PAYMENT_OPTIONS = ['monthly', 'cumulative'] as const;

export default function RegisterChildScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();

  // Child info
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [gradeId, setGradeId] = useState('');
  const [guardianId, setGuardianId] = useState('');
  const [paymentPref, setPaymentPref] = useState<'monthly' | 'cumulative'>('monthly');

  // Contact info
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [physicalAddress, setPhysicalAddress] = useState('');
  const [poBox, setPoBox] = useState('');

  // Relationship
  const [relationship, setRelationship] = useState<'father' | 'mother'>('father');

  // Other parent (optional)
  const [showOtherParent, setShowOtherParent] = useState(false);
  const [otherFirst, setOtherFirst] = useState('');
  const [otherLast, setOtherLast] = useState('');
  const [otherPhone, setOtherPhone] = useState('');
  const [otherEmail, setOtherEmail] = useState('');
  const [otherAddress, setOtherAddress] = useState('');
  const [otherPoBox, setOtherPoBox] = useState('');

  // Grades from API
  const [grades, setGrades] = useState<Grade[]>([]);
  const [showGrades, setShowGrades] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    gradesApi.list().then(res => {
      setGrades(res.data.filter(g => g.is_active && !g.is_archived));
    }).catch(() => {});
  }, []);

  const canSubmit = firstName.trim() && lastName.trim() && gradeId.trim();
  const selectedGrade = grades.find(g => g.id === gradeId);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    try {
      await studentsApi.registerChild({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        grade_id: gradeId,
        guardian_id: guardianId.trim() || undefined,
        payment_preference: paymentPref,
        relationship,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        physical_address: physicalAddress.trim() || undefined,
        po_box: poBox.trim() || undefined,
        other_parent: showOtherParent && otherFirst.trim() && otherLast.trim()
          ? {
              first_name: otherFirst.trim(),
              last_name: otherLast.trim(),
              phone: otherPhone.trim() || undefined,
              email: otherEmail.trim() || undefined,
              physical_address: otherAddress.trim() || undefined,
              po_box: otherPoBox.trim() || undefined,
            }
          : undefined,
      } as any);
      Alert.alert('Success', 'Child registered successfully! The school will review the application.');
      navigation.goBack();
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.detail || err?.message || 'Failed to register child.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Form intro card */}
        <View style={styles.introCard}>
          <View style={styles.introIcon}>
            <Ionicons name="person-add" size={22} color={colors.accent} />
          </View>
          <Text style={styles.introTitle}>Add a new child</Text>
          <Text style={styles.introSub}>Fill in the details below to register your child.</Text>
        </View>

        {/* Child Information */}
        <View style={styles.formCard}>
          <Text style={styles.sectionLabel}>CHILD INFORMATION</Text>
          <Input label="First Name" value={firstName} onChangeText={setFirstName} placeholder="e.g. James" autoCapitalize="words" />
          <Input label="Last Name" value={lastName} onChangeText={setLastName} placeholder="e.g. Smith" autoCapitalize="words" />
          <Input label="Guardian ID Number" value={guardianId} onChangeText={setGuardianId} placeholder="e.g. National ID or Passport" autoCapitalize="characters" />

          {/* Grade picker from API */}
          <Text style={[styles.sectionLabel, { marginTop: 16 }]}>GRADE LEVEL</Text>
          <TouchableOpacity style={styles.gradePicker} onPress={() => setShowGrades(!showGrades)}>
            <Text style={selectedGrade ? styles.gradePickerText : styles.gradePickerPlaceholder}>
              {selectedGrade ? selectedGrade.name : 'Select a grade...'}
            </Text>
            <Ionicons name={showGrades ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
          </TouchableOpacity>
          {showGrades && (
            <View style={styles.gradeList}>
              {grades.map(g => (
                <TouchableOpacity
                  key={g.id}
                  style={[styles.gradeItem, gradeId === g.id && styles.gradeItemActive]}
                  onPress={() => { setGradeId(g.id); setShowGrades(false); }}
                >
                  <Text style={[styles.gradeItemText, gradeId === g.id && styles.gradeItemTextActive]}>{g.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Payment Preference */}
          <Text style={[styles.sectionLabel, { marginTop: 16 }]}>PAYMENT PREFERENCE</Text>
          <View style={styles.segmentRow}>
            {PAYMENT_OPTIONS.map(opt => (
              <TouchableOpacity key={opt} style={[styles.segment, paymentPref === opt && styles.segmentActive]}
                onPress={() => setPaymentPref(opt)}>
                <Text style={[styles.segmentText, paymentPref === opt && styles.segmentTextActive]}>
                  {opt === 'monthly' ? 'Monthly' : 'Cumulative'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.hint}>
            {paymentPref === 'monthly' ? 'Pay month by month. Each month is billed separately.' : 'Pay cumulatively. Full year fees at once.'}
          </Text>
        </View>

        {/* Contact Information */}
        <View style={[styles.formCard, { marginTop: 12 }]}>
          <Text style={styles.sectionLabel}>CONTACT INFORMATION</Text>
          <Input label="Phone Number" value={phone} onChangeText={setPhone} placeholder="e.g. +27 60 123 4567" keyboardType="phone-pad" />
          <Input label="Email (optional)" value={email} onChangeText={setEmail} placeholder="e.g. parent@email.com" keyboardType="email-address" autoCapitalize="none" />
          <Input label="Physical Address" value={physicalAddress} onChangeText={setPhysicalAddress} placeholder="e.g. 123 Main St, Pretoria" />
          <Input label="PO Box (optional)" value={poBox} onChangeText={setPoBox} placeholder="e.g. PO Box 1234" />
        </View>

        {/* Relationship */}
        <View style={[styles.formCard, { marginTop: 12 }]}>
          <Text style={styles.sectionLabel}>YOUR RELATIONSHIP TO THE CHILD</Text>
          <View style={styles.segmentRow}>
            {(['father', 'mother'] as const).map(r => (
              <TouchableOpacity key={r} style={[styles.segment, relationship === r && styles.segmentActive]}
                onPress={() => setRelationship(r)}>
                <Text style={[styles.segmentText, relationship === r && styles.segmentTextActive]}>
                  {r === 'father' ? 'Father' : 'Mother'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Other Parent (optional) */}
        <View style={[styles.formCard, { marginTop: 12 }]}>
          <TouchableOpacity style={styles.toggleRow} onPress={() => setShowOtherParent(!showOtherParent)}>
            <Ionicons name="people-outline" size={18} color={colors.textSecondary} />
            <Text style={styles.toggleText}>
              {relationship === 'father' ? "Mother's" : "Father's"} Details {showOtherParent ? '(added)' : ''}
            </Text>
            <Text style={styles.toggleHint}>{showOtherParent ? 'Tap to remove' : 'Optional'}</Text>
          </TouchableOpacity>

          {showOtherParent && (
            <View style={styles.otherParentFields}>
              <View style={styles.row2}>
                <View style={styles.half}>
                  <Input label="First Name" value={otherFirst} onChangeText={setOtherFirst} placeholder="First name" />
                </View>
                <View style={styles.half}>
                  <Input label="Last Name" value={otherLast} onChangeText={setOtherLast} placeholder="Last name" />
                </View>
              </View>
              <Input label="Phone" value={otherPhone} onChangeText={setOtherPhone} placeholder="Phone number" keyboardType="phone-pad" />
              <Input label="Email" value={otherEmail} onChangeText={setOtherEmail} placeholder="Email" keyboardType="email-address" autoCapitalize="none" />
              <Input label="Physical Address" value={otherAddress} onChangeText={setOtherAddress} placeholder="Address" />
              <Input label="PO Box" value={otherPoBox} onChangeText={setOtherPoBox} placeholder="PO Box" />
            </View>
          )}
        </View>

        <Button
          title={loading ? 'Registering...' : 'Register Child'}
          onPress={handleSubmit}
          disabled={!canSubmit || loading}
          loading={loading}
          style={{ marginTop: 20 }}
        />
        <View style={{ height: 100 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  introCard: { marginHorizontal: spacing.lg, marginBottom: 16, backgroundColor: colors.bgCanvas, borderRadius: radii.md, padding: spacing.lg, alignItems: 'center' },
  introIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accentSoft, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  introTitle: { fontFamily: fonts.heading, fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 4 },
  introSub: { fontFamily: fonts.body, fontSize: 13, fontWeight: '500', color: colors.textSecondary, textAlign: 'center' },
  formCard: {
    marginHorizontal: spacing.lg, backgroundColor: colors.card, borderRadius: radii.md,
    padding: spacing.lg, shadowColor: colors.black, shadowOpacity: 0.03, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  sectionLabel: {
    fontFamily: fonts.body, fontSize: 11, fontWeight: '700', color: colors.textMuted,
    textTransform: 'uppercase' as const, letterSpacing: 0.8, marginBottom: 10,
  },
  gradePicker: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radii.sm,
    paddingHorizontal: spacing.md, paddingVertical: 13, backgroundColor: colors.white,
  },
  gradePickerText: { fontFamily: fonts.body, fontSize: 15, fontWeight: '500', color: colors.text },
  gradePickerPlaceholder: { fontFamily: fonts.body, fontSize: 15, color: colors.placeholder },
  gradeList: { marginTop: 6, backgroundColor: colors.white, borderRadius: radii.sm, borderWidth: 1, borderColor: colors.border, maxHeight: 200 },
  gradeItem: { paddingHorizontal: spacing.md, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line },
  gradeItemActive: { backgroundColor: colors.accentSoft },
  gradeItemText: { fontFamily: fonts.body, fontSize: 14, fontWeight: '500', color: colors.textSecondary },
  gradeItemTextActive: { color: colors.accent, fontWeight: '700' as const },
  segmentRow: { flexDirection: 'row', backgroundColor: colors.bgCanvas, borderRadius: radii.sm, padding: 3, gap: 4 },
  segment: { flex: 1, paddingVertical: 10, borderRadius: radii.sm - 2, alignItems: 'center' },
  segmentActive: { backgroundColor: colors.card, shadowColor: colors.black, shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  segmentText: { fontFamily: fonts.body, fontSize: 13, fontWeight: '500', color: colors.textSecondary },
  segmentTextActive: { color: colors.text, fontWeight: '700' as const },
  hint: { fontFamily: fonts.body, fontSize: 13, fontWeight: '400', color: colors.textMuted, marginTop: 10, lineHeight: 20 },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.bgCanvas, borderRadius: radii.sm,
    paddingHorizontal: spacing.md, paddingVertical: 12,
  },
  toggleText: { fontFamily: fonts.body, fontSize: 14, fontWeight: '600', color: colors.text, flex: 1 },
  toggleHint: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
  otherParentFields: { marginTop: 14 },
  row2: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
});
