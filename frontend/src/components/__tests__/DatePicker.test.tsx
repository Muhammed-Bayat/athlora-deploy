import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DatePicker } from '../DatePicker';

describe('DatePicker', () => {
  it('provides a scrollable custom year list and updates the displayed year', async () => {
    const user = userEvent.setup();
    render(<DatePicker aria-label="Date of birth" value="" onChange={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /date of birth, no date selected/i }));
    const calendar = screen.getByRole('dialog', { name: 'Date of birth calendar' });
    await user.click(within(calendar).getByRole('button', { name: 'Year' }));

    const listbox = screen.getByRole('listbox');
    expect(within(listbox).getByRole('option', { name: '1900' })).toBeInTheDocument();

    await user.click(within(listbox).getByRole('option', { name: '1900' }));
    expect(within(calendar).getByRole('button', { name: 'Year' })).toHaveTextContent('1900');
  });
});
