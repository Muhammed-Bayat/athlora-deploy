import { describe, expect, it } from 'vitest';
import {
  isCanonicalUuid,
  isEnumValue,
  isGregorianDate,
  isLatitude,
  isLongitude,
  isPositiveRaceTime,
  normalizeLocalTime,
  normalizeRequiredString,
} from './primitives.js';

describe('isCanonicalUuid', () => {
  it('accepts PostgreSQL-shaped UUIDs without imposing version bits', () => {
    expect(isCanonicalUuid('00000000-0000-0000-0000-000000000000')).toBe(true);
    expect(isCanonicalUuid('A0B1C2D3-E4F5-6789-ABCD-EF0123456789')).toBe(true);
  });

  it('rejects non-canonical text and non-strings', () => {
    expect(isCanonicalUuid('a0b1c2d3e4f56789abcdef0123456789')).toBe(false);
    expect(isCanonicalUuid('{a0b1c2d3-e4f5-6789-abcd-ef0123456789}')).toBe(false);
    expect(isCanonicalUuid(123)).toBe(false);
  });
});

describe('isGregorianDate', () => {
  it('accepts real dates and Gregorian leap days', () => {
    expect(isGregorianDate('2026-08-14')).toBe(true);
    expect(isGregorianDate('2000-02-29')).toBe(true);
  });

  it('rejects invalid calendar dates and non-YYYY-MM-DD forms', () => {
    expect(isGregorianDate('1900-02-29')).toBe(false);
    expect(isGregorianDate('2025-04-31')).toBe(false);
    expect(isGregorianDate('0000-01-01')).toBe(false);
    expect(isGregorianDate('2026-8-14')).toBe(false);
  });
});

describe('normalizeLocalTime', () => {
  it('normalizes minute precision and preserves second precision', () => {
    expect(normalizeLocalTime('00:00')).toBe('00:00:00');
    expect(normalizeLocalTime('23:59:59')).toBe('23:59:59');
  });

  it('rejects out-of-range and loosely formatted times', () => {
    expect(normalizeLocalTime('24:00')).toBeNull();
    expect(normalizeLocalTime('12:60:00')).toBeNull();
    expect(normalizeLocalTime('9:30')).toBeNull();
    expect(normalizeLocalTime(930)).toBeNull();
  });
});

describe('coordinate predicates', () => {
  it('accepts inclusive latitude and longitude boundaries', () => {
    expect(isLatitude(-90)).toBe(true);
    expect(isLatitude(90)).toBe(true);
    expect(isLongitude(-180)).toBe(true);
    expect(isLongitude(180)).toBe(true);
  });

  it('rejects values outside the range, numeric strings, and non-finite numbers', () => {
    expect(isLatitude(90.000001)).toBe(false);
    expect(isLongitude(-180.000001)).toBe(false);
    expect(isLatitude('51.5')).toBe(false);
    expect(isLongitude(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isLongitude(Number.NaN)).toBe(false);
  });
});

describe('isPositiveRaceTime', () => {
  it('only accepts positive finite numbers', () => {
    expect(isPositiveRaceTime(Number.MIN_VALUE)).toBe(true);
    expect(isPositiveRaceTime(10.82)).toBe(true);
    expect(isPositiveRaceTime(0)).toBe(false);
    expect(isPositiveRaceTime(-0.01)).toBe(false);
    expect(isPositiveRaceTime(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isPositiveRaceTime('10.82')).toBe(false);
  });
});

describe('generic string primitives', () => {
  it('supports readonly string enums', () => {
    const values = ['scheduled', 'completed'] as const;
    expect(isEnumValue('scheduled', values)).toBe(true);
    expect(isEnumValue('SCHEDULED', values)).toBe(false);
    expect(isEnumValue(1, values)).toBe(false);
  });

  it('trims required strings and rejects blank or non-string values', () => {
    expect(normalizeRequiredString('  Race day  ')).toBe('Race day');
    expect(normalizeRequiredString(' \n\t ')).toBeNull();
    expect(normalizeRequiredString(null)).toBeNull();
  });
});
