import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../contexts/AuthContext';
import { colors, spacing, radii, fonts } from '../../theme';
import useNotifications from '../../hooks/useNotifications';

export default function ProfileScreen() {
  const navigation = useNavigation<any>();
  const { user, logout } = useAuth();
  const unreadCount = useNotifications();

  useEffect(() => {
    navigation.setOptions({
      headerSubtitle: user?.email || '',
      headerShowBell: true,
      headerShowInitials: true,
      headerOnBellPress: () => navigation.navigate('Notifications'),
    });
  }, [navigation, user]);

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => logout() },
    ]);
  };

  const initials = user
    ? user.full_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U'
    : 'U';

  return (
    <View style={styles.root}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Avatar + name card */}
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text style={styles.name}>{user?.full_name || 'Parent'}</Text>
          <Text style={styles.email}>{user?.email}</Text>
          <Text style={styles.roleText}>PARENT ACCOUNT</Text>
        </View>

        {/* Account actions */}
        <View style={styles.actionsCard}>
          <TouchableOpacity style={styles.actionRow} onPress={() => navigation.navigate('EditProfile')} activeOpacity={0.7}>
            <Ionicons name="create-outline" size={18} color={colors.icon} />
            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>Edit Profile</Text>
              <Text style={styles.actionSub}>Update your name, email, phone</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.iconMuted} />
          </TouchableOpacity>

          <View style={styles.actionDivider} />

          <TouchableOpacity style={styles.actionRow} onPress={() => navigation.navigate('ChangePassword')} activeOpacity={0.7}>
            <Ionicons name="lock-closed-outline" size={18} color={colors.icon} />
            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>Change Password</Text>
              <Text style={styles.actionSub}>Update your account password</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.iconMuted} />
          </TouchableOpacity>
        </View>

        {/* Info rows */}
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Ionicons name="person-outline" size={18} color={colors.icon} />
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Full Name</Text>
              <Text style={styles.infoValue}>{user?.full_name || '—'}</Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <Ionicons name="mail-outline" size={18} color={colors.icon} />
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Email</Text>
              <Text style={styles.infoValue}>{user?.email || '—'}</Text>
            </View>
          </View>

          {user?.phone && (
            <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
              <Ionicons name="call-outline" size={18} color={colors.icon} />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Phone</Text>
                <Text style={styles.infoValue}>{user.phone}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Sign out — outline danger */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.7}>
          <Ionicons name="log-out-outline" size={18} color={colors.danger} />
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  scrollContent: { paddingTop: 16 },

  /* Avatar card */
  profileCard: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radii.md,
    marginHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: {
    fontFamily: fonts.headingExtra,
    fontSize: 26,
    fontWeight: '800',
    color: colors.white,
  },
  name: {
    fontFamily: fonts.headingExtra,
    fontSize: 19,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 2,
  },
  email: {
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: '400',
    color: colors.textSecondary,
    marginBottom: 6,
  },
  roleText: {
    fontFamily: fonts.bodySemi,
    fontSize: 10,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },

  /* Action rows */
  actionsCard: {
    backgroundColor: colors.white,
    borderRadius: radii.md,
    marginHorizontal: spacing.lg,
    marginTop: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  actionContent: { flex: 1 },
  actionTitle: {
    fontFamily: fonts.heading,
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  actionSub: {
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '400',
    color: colors.textSecondary,
    marginTop: 1,
  },
  actionDivider: {
    height: 1,
    backgroundColor: colors.line,
    marginLeft: 14,
  },

  /* Info rows */
  infoCard: {
    backgroundColor: colors.white,
    borderRadius: radii.md,
    marginHorizontal: spacing.lg,
    marginTop: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    gap: 12,
  },
  infoContent: { flex: 1 },
  infoLabel: {
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  infoValue: {
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },

  /* Logout */
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: spacing.lg,
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: radii.sm,
    borderWidth: 1.5,
    borderColor: colors.danger,
    backgroundColor: colors.white,
  },
  logoutText: {
    fontFamily: fonts.heading,
    fontSize: 15,
    fontWeight: '700',
    color: colors.danger,
  },
});
