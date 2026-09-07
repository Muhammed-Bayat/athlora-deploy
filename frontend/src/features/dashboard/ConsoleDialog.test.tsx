import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConsoleDialog } from './ConsoleDialog';

describe('ConsoleDialog', () => {
  it('renders dialog and closes through escape, button, and backdrop', () => {
    const close = vi.fn();
    const { container } = render(
      <ConsoleDialog title="Dialog" footer={<button>Save</button>} onClose={close}>
        <input aria-label="Name" />
      </ConsoleDialog>,
    );

    expect(screen.getByRole('dialog', { name: 'Dialog' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    fireEvent.mouseDown(container.firstElementChild!);
    expect(close).toHaveBeenCalledTimes(3);
  });

  it('does not render footer when not provided', () => {
    render(
      <ConsoleDialog title="No Footer" onClose={vi.fn()}>
        <p>Content</p>
      </ConsoleDialog>,
    );
    expect(screen.getByRole('dialog', { name: 'No Footer' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });
});
