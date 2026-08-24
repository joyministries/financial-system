import { colors, fonts, spacing, radii } from '../theme';

describe('Theme tokens', () => {
  it('exports required color tokens', () => {
    expect(colors.primary).toBeDefined();
    expect(colors.accent).toBeDefined();
    expect(colors.success).toBeDefined();
    expect(colors.warning).toBeDefined();
    expect(colors.danger).toBeDefined();
    expect(colors.white).toBe('#ffffff');
    expect(colors.bg).toBeDefined();
  });

  it('exports required font families', () => {
    expect(fonts.heading).toBeDefined();
    expect(fonts.headingExtra).toBeDefined();
    expect(fonts.body).toBeDefined();
    expect(fonts.mono).toBeDefined();
  });

  it('has correct color values', () => {
    expect(colors.primary).toBe('#132043');
    expect(colors.accent).toBe('#C08A34');
    expect(colors.success).toBe('#1E9E64');
    expect(colors.danger).toBe('#D14B3F');
  });

  it('exports spacing scale', () => {
    expect(spacing.xs).toBe(4);
    expect(spacing.sm).toBe(8);
    expect(spacing.md).toBe(16);
    expect(spacing.lg).toBe(20);
  });

  it('exports radius scale', () => {
    expect(radii.sm).toBe(12);
    expect(radii.md).toBe(16);
    expect(radii.lg).toBe(22);
    expect(radii.full).toBe(999);
  });
});
