const DECIMAL_INPUT = /^\d+(?:[.,]\d+)?$/;

export function normalizeDecimalInput(value: string): string | null {
  const trimmed = value.trim();
  if (!DECIMAL_INPUT.test(trimmed)) return null;
  return trimmed.replace(',', '.');
}

export function parseDecimalInput(value: string): number | null {
  const normalized = normalizeDecimalInput(value);
  if (normalized === null) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}
