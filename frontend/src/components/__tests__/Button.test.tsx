import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from '../Button';

describe('Button', () => {
  it('renders its children and responds to clicks', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(<Button onClick={onAction}>Log attempt</Button>);

    const button = screen.getByRole('button', { name: 'Log attempt' });
    expect(button).toBeInTheDocument();

    await user.click(button);
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});