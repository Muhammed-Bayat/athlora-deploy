import { describe, expect, it } from 'vitest';
import {
  clubInitials,
  contrastRatio,
  hasAccessibleForeground,
  pickForeground,
  relativeLuminance,
} from './colorContrast';

describe('colorContrast', () => {
  it('computes known luminance and contrast values', () => {
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 5);
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5);
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 3);
  });

  it('accepts colours with an accessible white or ink foreground', () => {
    expect(hasAccessibleForeground('#001D3C')).toBe(true);
    expect(hasAccessibleForeground('#FFFFFF')).toBe(true);
    expect(hasAccessibleForeground('#777777')).toBe(false);
    expect(hasAccessibleForeground('not-a-colour')).toBe(false);
  });

  it('picks the higher-contrast foreground', () => {
    expect(pickForeground('#001D3C')).toBe('#FFFFFF');
    expect(pickForeground('#FFFFFF')).toBe('#001D3C');
    expect(pickForeground('invalid')).toBe('#001D3C');
  });

  it('derives club initials', () => {
    expect(clubInitials('Open Track Club')).toBe('OT');
    expect(clubInitials('Sprinters')).toBe('SP');
    expect(clubInitials('')).toBe('?');
  });
});
