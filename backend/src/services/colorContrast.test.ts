import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  hasAccessibleForeground,
  isHexColor,
  pickForeground,
  relativeLuminance,
  INK_FOREGROUND,
  MIN_CONTRAST_RATIO,
  WHITE_FOREGROUND,
} from './colorContrast.js';

describe('colorContrast', () => {
  it('accepts only #RRGGBB hex colours', () => {
    expect(isHexColor('#001D3C')).toBe(true);
    expect(isHexColor('#001d3c')).toBe(true);
    expect(isHexColor('#fff')).toBe(false);
    expect(isHexColor('rgb(0,29,60)')).toBe(false);
    expect(isHexColor(0x001d3c)).toBe(false);
  });

  it('computes WCAG relative luminance for known colours', () => {
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 5);
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5);
    expect(relativeLuminance('#001D3C')).toBeGreaterThan(0);
    expect(relativeLuminance('#001D3C')).toBeLessThan(0.2);
    expect(() => relativeLuminance('nope')).toThrow();
  });

  it('computes contrast ratios with the lighter colour as the numerator', () => {
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 3);
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 3);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
  });

  it('accepts backgrounds that can carry white or ink foreground text at AA', () => {
    expect(hasAccessibleForeground('#000000')).toBe(true);
    expect(hasAccessibleForeground('#FFFFFF')).toBe(true);
    expect(hasAccessibleForeground('#001D3C')).toBe(true);
    expect(hasAccessibleForeground('not-a-colour')).toBe(false);
    // Mid greys fail both foregrounds under AA.
    expect(hasAccessibleForeground('#777777')).toBe(false);
    expect(contrastRatio('#777777', WHITE_FOREGROUND)).toBeLessThan(MIN_CONTRAST_RATIO);
    expect(contrastRatio('#777777', INK_FOREGROUND)).toBeLessThan(MIN_CONTRAST_RATIO);
  });

  it('picks the foreground with the better contrast ratio', () => {
    expect(pickForeground('#000000')).toBe(WHITE_FOREGROUND);
    expect(pickForeground('#FFFFFF')).toBe(INK_FOREGROUND);
    expect(pickForeground('#001D3C')).toBe(WHITE_FOREGROUND);
    expect(pickForeground('invalid')).toBe(INK_FOREGROUND);
  });
});
