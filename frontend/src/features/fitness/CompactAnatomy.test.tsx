import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CompactAnatomy } from './CompactAnatomy';

vi.mock('./StaticAnatomy', () => ({
  StaticAnatomy: ({ injuries }: { injuries: Array<{ area: string; side: string; severity: string }> }) => (
    <output data-testid="static-anatomy" data-injuries={injuries.map((injury) => `${injury.severity}:${injury.side}:${injury.area}`).join(',')} />
  ),
}));

describe('CompactAnatomy', () => {
  it('renders an accessible healthy state with a static GLB model', async () => {
    render(<CompactAnatomy injuries={[]} highestSeverity={null} />);
    expect(screen.getByText('Healthy')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /No active injuries/i })).toBeInTheDocument();
    expect(await screen.findByTestId('static-anatomy')).toHaveAttribute('data-injuries', '');
  });

  it('passes active injuries to the static GLB model', async () => {
    render(<CompactAnatomy injuries={[{ bodyRegion: 'Leg', area: 'Knee', side: 'Both', severity: 'Severe' }]} highestSeverity="Severe" />);

    expect(await screen.findByTestId('static-anatomy')).toHaveAttribute('data-injuries', 'Severe:Both:Knee');
  });
});
