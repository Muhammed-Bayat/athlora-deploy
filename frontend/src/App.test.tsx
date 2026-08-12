import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('App', () => {
  it('renders the Athlora shell and switches features', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByText('Athlora')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Athletes' }));
    expect(screen.getByRole('heading', { name: 'Roster' })).toBeInTheDocument();
  });
});