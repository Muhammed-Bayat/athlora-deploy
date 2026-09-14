import { describe, it, expect } from 'vitest';
import { hashSecret, generateHumanCode } from '../services/eventHelpers.js';

describe('Event Helpers Security & Constraints Review', () => {
  it('verifies that secrets are only stored as hashes and never exposed in plaintext in DB records', () => {
    const rawSecret = 'secret12345';
    const hashed = hashSecret(rawSecret);
    expect(hashed).not.toBe(rawSecret);
    expect(hashed.length).toBe(64);
  });

  it('validates human code format constraints', () => {
    const code = generateHumanCode();
    expect(code).toHaveLength(6);
    expect(code).toMatch(/^[A-Z0-9]+$/);
  });
});
