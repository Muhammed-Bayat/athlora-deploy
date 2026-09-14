import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SeasonSelector } from './SeasonSelector';
import { currentSeasonYear } from '../utils/season';

describe('SeasonSelector', () => {
  it('shows all-time, current, and supplied seasons in descending order', async () => {
    render(<SeasonSelector value="2024" onChange={vi.fn()} availableYears={[2023, 2025, 2024, 2025]} />);

    await userEvent.click(screen.getByRole('button', { name: 'Season: 2024' }));

    const currentYear = Number(currentSeasonYear());
    const expectedYears = Array.from(new Set([currentYear, 2025, 2024, 2023])).sort((left, right) => right - left);
    expect(within(screen.getByRole('listbox')).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'All time',
      ...expectedYears.map((year) => year === currentYear ? `${year} (current)` : String(year)),
    ]);
  });

  it('reports the selected season value', async () => {
    const onChange = vi.fn();
    render(<SeasonSelector value="2024" onChange={onChange} availableYears={[2024]} />);

    await userEvent.click(screen.getByRole('button', { name: 'Season: 2024' }));
    await userEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'All time' }));

    expect(onChange).toHaveBeenCalledWith('all');
  });
});
