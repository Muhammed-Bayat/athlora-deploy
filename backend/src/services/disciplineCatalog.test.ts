import { describe, expect, it, vi } from 'vitest';
import { listAvailableDisciplines, SUPPORTED_DISCIPLINE_CODES } from './disciplineCatalog.js';

describe('discipline catalogue', () => {
  it('returns track disciplines before field disciplines in the configured display order', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [
      { code: '100m', label: '100m', unit: 'seconds', precision: 2, direction: 'lower' },
      { code: '4x100m', label: '4x100m relay', unit: 'seconds', precision: 2, direction: 'lower' },
      { code: 'high_jump', label: 'High jump', unit: 'metres', precision: 2, direction: 'higher' },
      { code: 'long_jump', label: 'Long jump', unit: 'metres', precision: 2, direction: 'higher' },
    ] });

    await expect(listAvailableDisciplines({ query } as never)).resolves.toMatchObject([
      { discipline: '100m' },
      { discipline: '4x100m' },
      { discipline: 'high_jump' },
      { discipline: 'long_jump' },
    ]);
    expect(SUPPORTED_DISCIPLINE_CODES).toEqual([
      '100m', '200m', '400m', '800m', '1500m', '100mh', '400mh', '4x100m',
      'high_jump', 'long_jump', 'triple_jump', 'javelin', 'discus', 'shot_put',
    ]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('ORDER BY array_position($1::text[], code), version DESC'), [SUPPORTED_DISCIPLINE_CODES]);
  });
});
