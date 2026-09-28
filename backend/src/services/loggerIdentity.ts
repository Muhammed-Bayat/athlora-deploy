/** Public logger identity is the person behind a link: the name and club they entered. */
export function normalizeLoggerIdentity(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

export function sameLoggerIdentity(a: string | null | undefined, b: string | null | undefined): boolean {
  return normalizeLoggerIdentity(a) === normalizeLoggerIdentity(b);
}
