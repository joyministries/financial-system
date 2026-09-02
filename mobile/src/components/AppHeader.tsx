import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, radii, fonts } from '../theme';
import { useAuth } from '../contexts/AuthContext';

interface AppHeaderProps {
  /** Screen title — defaults to route name */
  title?: string;
  /** Optional subtitle below the title */
  subtitle?: string;
  /** Show the bell icon (default true) */
  showBell?: boolean;
  /** Callback when bell is pressed */
  onBellPress?: () => void;
  /** Number of unread notifications — shows badge when > 0 */
  unreadCount?: number;
  /** Optional right-side custom element (replaces bell) */
  right?: React.ReactNode;
  /** Flat white background instead of gradient (e.g. profile) */
  flat?: boolean;
  /** Show user initials chip instead of bell (profile tab) */
  showInitials?: boolean;
  /** Override gradient colors */
  gradientColors?: readonly [string, string, ...string[]];
  /** React Navigation header props (route, navigation, options) — used when
   *  AppHeader is rendered as a tab navigator's custom header. When these are
   *  provided, title/subtitle/showBell are read from options first, falling
   *  back to the explicit props above. */
  route?: any;
  navigation?: any;
  options?: Record<string, any>;
}

/**
 * Unified header component used across ALL screens.
 *
 * Tab screens: provide title/subtitle via navigation.setOptions()
 * Stack screens: pass title/subtitle as props
 *
 * Design spec:
 *   Ink gradient bg #132043 → #1D2E5A, radius 22 bottom-left/bottom-right
 *   Inner padding: 24px bottom, 20px sides
 *   Top row (safe-area-aware): Title left, Bell icon right
 *   Subtitle below title if set
 */
export default function AppHeader({
  title: titleProp = '',
  subtitle: subtitleProp,
  showBell: showBellProp = true,
  onBellPress,
  unreadCount = 0,
  right,
  flat = false,
  showInitials = false,
  gradientColors = ['#132043', '#1D2E5A'] as readonly [string, string, ...string[]],
  route,
  navigation,
  options,
}: AppHeaderProps) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  // Only show a back button on stack-pushed screens. The tab navigator
  // renders AppHeader as its header too, but tabs never need a back affordance.
  const TAB_ROUTE_NAMES = ['Dashboard', 'PaymentsTab', 'InvoicesTab', 'StatementsTab', 'ProfileTab'];
  const isTabScreen = TAB_ROUTE_NAMES.includes(route?.name);
  const canGoBack = Boolean(!isTabScreen && navigation?.canGoBack?.());
  const handleBack = () => {
    if (navigation?.goBack && canGoBack) navigation.goBack();
  };

  // When used as a tab navigator header, merge React Navigation options with explicit props
  const title = options?.headerTitle || titleProp || route?.params?.title || '';
  const subtitle = options?.headerSubtitle || subtitleProp;
  const showBell = options?.headerShowBell ?? showBellProp;
  const useFlat = options?.headerFlat ?? flat;
  const useInitials = options?.headerShowInitials ?? showInitials;
  const bellHandler = options?.headerOnBellPress || onBellPress;
  const badgeCount = options?.headerUnreadCount ?? unreadCount;

  const initials = user
    ? (user.full_name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || 'U')
    : 'U';

  const content = (
    <View style={styles.row}>
      {canGoBack ? (
        <TouchableOpacity style={styles.backBtn} onPress={handleBack} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={useFlat ? colors.text : colors.white} />
        </TouchableOpacity>
      ) : null}
      <View style={styles.textWrap}>
        <Text style={[styles.title, useFlat && styles.titleFlat]}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.subtitle, useFlat && styles.subtitleFlat]}>{subtitle}</Text>
        ) : null}
      </View>
      {right
        ? right
        : showBell && !useInitials ? (
          <TouchableOpacity style={styles.bell} onPress={bellHandler} activeOpacity={0.7}>
            <Ionicons name="notifications-outline" size={22} color={colors.white} />
            {badgeCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{badgeCount > 99 ? '99+' : badgeCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        ) : useInitials ? (
          <View style={styles.profileChip}>
            <Text style={styles.profileInitials}>{initials}</Text>
          </View>
        ) : null}
    </View>
  );

  return (
    <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
      {useFlat ? (
        <View style={styles.headerBgFlat} />
      ) : (
        <LinearGradient
          colors={gradientColors}
          style={styles.headerBg}
        />
      )}
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingBottom: 24,
    paddingHorizontal: spacing.lg,
    position: 'relative',
  },
  headerBg: {
    ...StyleSheet.absoluteFillObject,
    borderBottomLeftRadius: radii.lg,
    borderBottomRightRadius: radii.lg,
  },
  headerBgFlat: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.white,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    zIndex: 1,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
    marginTop: -4,
  },
  textWrap: { flex: 1 },
  title: {
    fontFamily: fonts.headingExtra,
    fontSize: 22,
    fontWeight: '800',
    color: colors.white,
  },
  titleFlat: {
    color: colors.text,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: '400',
    color: 'rgba(255,255,255,0.55)',
    marginTop: 2,
  },
  subtitleFlat: {
    color: colors.textSecondary,
  },
  bell: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  badge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.danger,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#132043',
  },
  badgeText: {
    fontFamily: fonts.body,
    fontSize: 10,
    fontWeight: '700',
    color: colors.white,
  },
  profileChip: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileInitials: {
    fontFamily: fonts.headingExtra,
    fontSize: 16,
    fontWeight: '800',
    color: colors.white,
  },
});
