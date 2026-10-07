import { describe, expect, it } from 'vitest';
import { DISCIPLINE_ORDER, compareDisciplineCodes, sortDisciplines } from './disciplineOrder';

describe('disciplineOrder', () => {
  it('lists track sprints by increasing distance, then hurdles, relay, and field events', () => {
    expect([...DISCIPLINE_ORDER]).toEqual([
      '100m', '200m', '400m', '800m', '1500m',
      '100mh', '110mh', '400mh',
      '4x100m',
      'high_jump', 'long_jump', 'triple_jump', 'javelin', 'discus', 'shot_put',
    ]);
  });

  it('sorts known codes into canonical order with unknown codes last', () => {
    const shuffled = ['shot_put', '110mh', '200m', 'high_jump', '100m', '4x100m', '5000m'];
    expect(sortDisciplines(shuffled, (code) => code)).toEqual([
      '100m', '200m', '110mh', '4x100m', 'high_jump', 'shot_put', '5000m',
    ]);
  });

  it('compares known codes by rank and unknown codes alphabetically', () => {
    expect(compareDisciplineCodes('100m', '200m')).toBeLessThan(0);
    expect(compareDisciplineCodes('4x100m', '110mh')).toBeGreaterThan(0);
    expect(compareDisciplineCodes('5000m', '100m')).toBeGreaterThan(0);
    expect(compareDisciplineCodes('pole_vault', 'hammer')).toBeGreaterThan(0);
    expect(compareDisciplineCodes('100m', '100m')).toBe(0);
  });

  it('sorts objects with an accessor without mutating the input', () => {
    const items = [{ code: 'long_jump' }, { code: '400m' }, { code: 'javelin' }];
    const sorted = sortDisciplines(items, (item) => item.code);
    expect(sorted.map((item) => item.code)).toEqual(['400m', 'long_jump', 'javelin']);
    expect(items.map((item) => item.code)).toEqual(['long_jump', '400m', 'javelin']);
  });
});
