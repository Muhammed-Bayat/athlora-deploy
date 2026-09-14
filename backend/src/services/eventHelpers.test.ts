import { describe, it, expect } from 'vitest';
import { hashSecret, generateHumanCode } from '../services/eventHelpers.js';

describe('Event Helpers Service', () => {
  it('hashes secrets securely using sha256', () => {
    const h1 = hashSecret('test-secret');
    const h2 = hashSecret('test-secret');
    const h3 = hashSecret('other-secret');
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
    expect(h1.length).toBe(64);
  });

  it('generates 6-character human readable codes', () => {
    const code = generateHumanCode();
    expect(code.length).toBe(6);
    expect(/^[A-Z0-9]+$/.test(code)).toBe(true);
  });
});
