export const DISCIPLINE_ORDER = [
  '100m', '200m', '400m', '800m', '1500m', '100mh', '110mh', '400mh',
  '4x100m', 'high_jump', 'long_jump', 'triple_jump', 'javelin', 'discus', 'shot_put',
] as const;

const disciplineRank = new Map<string, number>(DISCIPLINE_ORDER.map((code, index) => [code, index]));

export function compareDisciplineCodes(left: unknown, right: unknown): number {
  const leftRank = (typeof left === 'string' ? disciplineRank.get(left) : undefined) ?? Number.MAX_SAFE_INTEGER;
  const rightRank = (typeof right === 'string' ? disciplineRank.get(right) : undefined) ?? Number.MAX_SAFE_INTEGER;
  if (leftRank !== rightRank) return leftRank - rightRank;
  if (typeof left === 'string' && typeof right === 'string') return left.localeCompare(right);
  return 0;
}

export function sortDisciplines<T>(items: readonly T[], codeOf: (item: T) => string): T[] {
  return [...items].sort((left, right) => compareDisciplineCodes(codeOf(left), codeOf(right)));
}
