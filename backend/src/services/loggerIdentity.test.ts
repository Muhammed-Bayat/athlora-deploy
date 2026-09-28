import { describe, expect, it } from 'vitest';
import { normalizeLoggerIdentity, sameLoggerIdentity } from './loggerIdentity.js';

describe('logger identity normalization', () => {
  it('trims and lowercases logger identity text', () => {
    expect(normalizeLoggerIdentity('  Official ')).toBe('official');
    expect(normalizeLoggerIdentity('Club')).toBe('club');
    expect(normalizeLoggerIdentity('')).toBe('');
  });

  it('treats missing identities as empty strings', () => {
    expect(normalizeLoggerIdentity(null)).toBe('');
    expect(normalizeLoggerIdentity(undefined)).toBe('');
  });

  it('matches identities across case and whitespace differences', () => {
    expect(sameLoggerIdentity('  Official ', 'official')).toBe(true);
    expect(sameLoggerIdentity('North Stars', 'north  stars')).toBe(false);
    expect(sameLoggerIdentity('Club', 'Club ')).toBe(true);
  });

  it('separates different identities and empty ones', () => {
    expect(sameLoggerIdentity('Official', 'Other official')).toBe(false);
    expect(sameLoggerIdentity(null, '')).toBe(true);
    expect(sameLoggerIdentity(null, undefined)).toBe(true);
    expect(sameLoggerIdentity('Official', null)).toBe(false);
  });
});
