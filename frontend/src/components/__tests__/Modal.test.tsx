import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Modal } from '../Modal';

function setup() {
  const user = userEvent.setup();
  const onClose = vi.fn();
  const result = render(
    <Modal open title="Test dialog" onClose={onClose}>
      <input aria-label="Name" />
      <button type="button">Confirm</button>
    </Modal>,
  );
  return { user, onClose, ...result };
}

function ControlledModal({ initialOpen = true }: { initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <>
      <button type="button" data-testid="trigger" onClick={() => setOpen(true)}>Open</button>
      <Modal open={open} title="Controlled" onClose={() => setOpen(false)}>
        <input aria-label="Name" />
      </Modal>
    </>
  );
}

describe('Modal', () => {
  it('renders title and children when open', () => {
    setup();
    expect(screen.getByRole('dialog', { name: 'Test dialog' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
  });

  it('renders nothing when closed', () => {
    render(
      <Modal open={false} title="Hidden" onClose={vi.fn()}>
        <p>Content</p>
      </Modal>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('focuses the first input on open', () => {
    setup();
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus();
  });

  it('calls onClose on Escape', async () => {
    const { user, onClose } = setup();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose on Escape when closeDisabled', async () => {
    const onClose = vi.fn();
    render(
      <Modal open title="Saving" onClose={onClose} closeDisabled>
        <button type="button">OK</button>
      </Modal>,
    );
    await userEvent.setup().keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose on backdrop click', async () => {
    const { user, onClose } = setup();
    const overlay = document.querySelector('[role="presentation"]')!;
    await user.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose on backdrop click when closeDisabled', async () => {
    const onClose = vi.fn();
    render(
      <Modal open title="Saving" onClose={onClose} closeDisabled>
        <button type="button">OK</button>
      </Modal>,
    );
    const overlay = document.querySelector('[role="presentation"]')!;
    void userEvent.setup().click(overlay);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('sets aria-busy when closeDisabled', () => {
    render(
      <Modal open title="Busy" onClose={vi.fn()} closeDisabled>
        <p>Saving...</p>
      </Modal>,
    );
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-busy', 'true');
  });

  it('locks body scroll while open', () => {
    const { rerender } = render(
      <Modal open title="Test" onClose={vi.fn()}>
        <p>Content</p>
      </Modal>,
    );
    expect(document.body.style.overflow).toBe('hidden');
    rerender(
      <Modal open={false} title="Test" onClose={vi.fn()}>
        <p>Content</p>
      </Modal>,
    );
    expect(document.body.style.overflow).toBe('');
  });

  it('restores focus to the trigger element on close', async () => {
    render(<ControlledModal />);
    const trigger = screen.getByTestId('trigger');
    trigger.focus();

    await userEvent.setup().click(trigger);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await userEvent.setup().keyboard('{Escape}');
    expect(trigger).toHaveFocus();
  });

  it('traps Tab within the dialog', async () => {
    const { user } = setup();
    const input = screen.getByRole('textbox', { name: 'Name' });
    const confirm = screen.getByRole('button', { name: 'Confirm' });
    const close = screen.getByRole('button', { name: 'Close' });

    confirm.focus();
    await user.tab();
    expect(close).toHaveFocus();

    await user.tab();
    expect(input).toHaveFocus();

    await user.tab({ shift: true });
    expect(close).toHaveFocus();
  });

  it('has accessible attributes', () => {
    setup();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby');
  });
});
