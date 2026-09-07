import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AsyncBoundary } from './AsyncBoundary';
describe('AsyncBoundary', () => {
  it('renders loading, error, empty, and content states', async () => {
    const retry = vi.fn(); const { rerender } = render(<AsyncBoundary loading error={null}>Content</AsyncBoundary>);
    expect(screen.getByRole('status')).toHaveTextContent('Loading...');
    rerender(<AsyncBoundary loading={false} error={new Error('Failed')} onRetry={retry}>Content</AsyncBoundary>);
    await userEvent.click(screen.getByRole('button', { name: 'Try again' })); expect(retry).toHaveBeenCalledOnce();
    rerender(<AsyncBoundary loading={false} empty emptyTitle="Nothing here" emptyDescription="Create one">Content</AsyncBoundary>);
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
    rerender(<AsyncBoundary loading={false}>Content</AsyncBoundary>); expect(screen.getByText('Content')).toBeInTheDocument();
  });
});
