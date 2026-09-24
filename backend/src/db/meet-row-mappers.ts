// Restricted to the new domain: legacy row/DTO contracts are deliberately unchanged.
export function mapMeetRow<T>(row: Record<string, unknown>): T {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const name = key === 'session_id' ? 'disciplineSessionId' : key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
    result[name] = value instanceof Date ? value.toISOString()
      : ['value', 'final_result', 'manual_override'].includes(key) && value !== null ? Number(value)
      : key === 'member_ids' && Array.isArray(value) ? value.map((id) => String(id))
      : value;
  }
  return result as T;
}
