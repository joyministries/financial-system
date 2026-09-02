/**
 * School Finance — design tokens
 * Source: school-finance-ui-styling-prompt.md
 */

// ── Font families (loaded in App.tsx) ─────────────
export const fonts = {
  heading: 'Manrope_700Bold',
  headingExtra: 'Manrope_800ExtraBold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemi: 'Inter_600SemiBold',
  bodyBold: 'Inter_700Bold',
  mono: 'IBMPlexMono_500Medium',
  monoSemi: 'IBMPlexMono_600SemiBold',
};

// ── Colors ─────────────────────────────────────────
export const colors = {
  // Ink
  primary: '#132043',
  primaryLight: '#1D2E5A',
  primaryGlow: '#2B3E73',

  // Accent gold (used sparingly — brand only)
  accent: '#C08A34',
  accentDark: '#A6742A',
  accentSoft: '#EFEFEF',

  // Status (text/icon colors only — never as chip backgrounds)
  success: '#1E9E64',
  successSoft: '#ECF1EE',
  warning: '#C68A2E',
  warningSoft: '#F3F1EB',
  danger: '#D14B3F',
  dangerSoft: '#F4EEED',
  info: '#3b82f6',

  // Icons (neutral ink — the default for every icon)
  icon: '#5B6272',
  iconMuted: '#9AA0AE',

  // Neutrals — cool gray surfaces, no cream
  white: '#ffffff',
  black: '#000000',
  bg: '#F6F7F9',
  bgCanvas: '#EAECF0',
  card: '#ffffff',
  surface: '#F6F7F9',
  line: '#E4E7EC',
  border: '#E4E7EC',
  text: '#16213F',
  textSecondary: '#5B6272',
  textMuted: '#9AA0AE',
  placeholder: '#d1d5db',
};

// ── Spacing ────────────────────────────────────────
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

// ── Radii (spec: only 12, 16, 22) ─────────────────
export const radii = {
  sm: 12,
  md: 16,
  lg: 22,
  full: 999,
};

// ── Typography (spec-aligned) ──────────────────────
export const typography = {
  // Headings — Manrope
  h1: { fontFamily: fonts.headingExtra, fontSize: 28, fontWeight: '800' as const, color: colors.text },
  h2: { fontFamily: fonts.headingExtra, fontSize: 22, fontWeight: '800' as const, color: colors.text },
  h3: { fontFamily: fonts.heading, fontSize: 18, fontWeight: '700' as const, color: colors.text },
  h4: { fontFamily: fonts.heading, fontSize: 16, fontWeight: '700' as const, color: colors.text },
  heading2: { fontFamily: fonts.headingExtra, fontSize: 22, fontWeight: '800' as const, color: colors.text },
  heading3: { fontFamily: fonts.heading, fontSize: 18, fontWeight: '700' as const, color: colors.text },
  subtitle: { fontFamily: fonts.heading, fontSize: 15, fontWeight: '700' as const, color: colors.text },

  // Body — Inter
  body: { fontFamily: fonts.body, fontSize: 15, fontWeight: '400' as const, color: colors.text },
  bodySmall: { fontFamily: fonts.body, fontSize: 13, fontWeight: '400' as const, color: colors.text },
  small: { fontFamily: fonts.body, fontSize: 13, fontWeight: '500' as const, color: colors.textSecondary },
  caption: { fontFamily: fonts.body, fontSize: 12, fontWeight: '500' as const, color: colors.textSecondary },
  tiny: { fontFamily: fonts.body, fontSize: 11, fontWeight: '700' as const, color: colors.textMuted },

  // Mono — IBM Plex Mono (amounts, codes, receipt #s)
  mono: { fontFamily: fonts.mono, fontSize: 15, fontWeight: '500' as const, color: colors.text },
  monoBold: { fontFamily: fonts.monoSemi, fontSize: 17, fontWeight: '600' as const, color: colors.text },
  monoSmall: { fontFamily: fonts.mono, fontSize: 12.5, fontWeight: '500' as const, color: colors.text },
  monoTiny: { fontFamily: fonts.mono, fontSize: 10.5, fontWeight: '500' as const, color: colors.textMuted },

  bold: { fontWeight: '700' as const },
};

// ── Shared style fragments ─────────────────────────
export const cardBase = {
  backgroundColor: colors.white,
  borderRadius: radii.md,
  borderWidth: 1,
  borderColor: colors.border,
  padding: 14,
};

export const pillBase = {
  paddingHorizontal: 10,
  paddingVertical: 4,
  borderRadius: radii.full,
};

export const iconChip = (bg: string, size = 28) => ({
  width: size,
  height: size,
  borderRadius: 9,
  backgroundColor: bg,
  justifyContent: 'center' as const,
  alignItems: 'center' as const,
});
