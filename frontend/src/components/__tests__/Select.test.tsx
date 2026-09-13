import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import styles from '../Select.module.css';
import { Select } from '../Select';

describe('Select', () => {
  it('provides a scrollable options region for long searchable lists', async () => {
    const user = userEvent.setup();
    const options = Array.from({ length: 7 }, (_, index) => ({ value: `${index}`, label: `Athlete ${index + 1}` }));

    render(<Select aria-label="Select athlete" options={options} value="" onChange={vi.fn()} searchable />);

    await user.click(screen.getByRole('button', { name: 'Select athlete' }));

    const listbox = screen.getByRole('listbox');
    expect(listbox.querySelector(`.${styles.scrollableOptions}`)).toBeInTheDocument();
    expect(within(listbox).getAllByRole('option')).toHaveLength(7);
  });
});
