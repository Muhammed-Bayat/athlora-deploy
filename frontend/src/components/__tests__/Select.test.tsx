import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import styles from '../Select.module.css';
import { Select } from '../Select';

function mockTriggerRect(top: number, bottom: number) {
  return vi.fn(() => ({
    top, bottom, left: 20, right: 220, width: 200, height: bottom - top, x: 20, y: top, toJSON: () => ({}),
  })) as unknown as () => DOMRect;
}

describe('Select', () => {
  it('provides a scrollable options region for long searchable lists', async () => {
    const user = userEvent.setup();
    const options = Array.from({ length: 7 }, (_, index) => ({ value: `${index}`, label: `Athlete ${index + 1}` }));

    render(<Select aria-label="Select athlete" options={options} value="" onChange={vi.fn()} searchable />);

    await user.click(screen.getByRole('button', { name: 'Select athlete' }));

    const listbox = screen.getByRole('listbox');
    expect(listbox).toHaveClass(styles.scrollableOptions);
    expect(within(listbox).getAllByRole('option')).toHaveLength(7);
  });

  it('opens the menu downward with a viewport-capped height when there is room below the trigger', async () => {
    const user = userEvent.setup();
    render(<Select aria-label="Select club" options={[{ value: 'a', label: 'Club A' }]} value="" onChange={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: 'Select club' });
    trigger.getBoundingClientRect = mockTriggerRect(100, 146);

    await user.click(trigger);

    const menu = screen.getByRole('listbox').parentElement!;
    expect(menu).toHaveAttribute('data-placement', 'down');
    expect(menu.style.position).toBe('fixed');
    expect(menu.style.maxHeight).toBeTruthy();
  });

  it('flips the menu above the trigger when the viewport has no room below', async () => {
    const user = userEvent.setup();
    render(<Select aria-label="Select club" options={[{ value: 'a', label: 'Club A' }]} value="" onChange={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: 'Select club' });
    trigger.getBoundingClientRect = mockTriggerRect(700, 746);

    await user.click(trigger);

    const menu = screen.getByRole('listbox').parentElement!;
    expect(menu).toHaveAttribute('data-placement', 'up');
    expect(menu.style.maxHeight).toBe('680px');
  });

  it('renders the open menu in a body portal so page boxes cannot clip it', async () => {
    const user = userEvent.setup();
    render(<Select aria-label="Select club" options={[{ value: 'a', label: 'Club A' }]} value="" onChange={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: 'Select club' });
    await user.click(trigger);

    const listbox = screen.getByRole('listbox');
    expect(trigger.parentElement?.contains(listbox)).toBe(false);
    expect(document.body.contains(listbox)).toBe(true);
  });

  it('still selects an option when the menu is portaled outside the wrapper', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Select aria-label="Select club" options={[{ value: 'a', label: 'Club A' }]} value="" onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Select club' }));

    await user.click(screen.getByRole('option', { name: 'Club A' }));
    expect(onChange).toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('closes the portaled menu when pressing outside the control', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <Select aria-label="Select club" options={[{ value: 'a', label: 'Club A' }]} value="" onChange={vi.fn()} />
        <button type="button">Elsewhere</button>
      </div>,
    );
    await user.click(screen.getByRole('button', { name: 'Select club' }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Elsewhere' }));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
