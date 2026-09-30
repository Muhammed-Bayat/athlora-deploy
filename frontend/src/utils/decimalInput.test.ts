import { describe, expect, it } from 'vitest';
import { normalizeDecimalInput, parseDecimalInput } from './decimalInput';

describe('decimal input', () => {
  it.each([
    ['10.25', '10.25', 10.25],
    ['10,25', '10.25', 10.25],
    ['  1,85  ', '1.85', 1.85],
    ['10', '10', 10],
  ])('normalizes %s', (input, normalized, parsed) => {
    expect(normalizeDecimalInput(input)).toBe(normalized);
    expect(parseDecimalInput(input)).toBe(parsed);
  });

  it.each(['', ' ', '.25', '10.', '10,2,5', '10.2,5', 'ten', '-10.25'])('rejects invalid input %j', (input) => {
    expect(normalizeDecimalInput(input)).toBeNull();
    expect(parseDecimalInput(input)).toBeNull();
  });
});
