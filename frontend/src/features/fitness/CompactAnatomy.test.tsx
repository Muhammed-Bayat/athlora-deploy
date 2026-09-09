import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CompactAnatomy } from './CompactAnatomy';

const staticAnatomy = vi.hoisted(() => vi.fn());

vi.mock('./StaticAnatomy', () => ({
  StaticAnatomy: (props: { injuries: Array<{ area: string; side: string; severity: string }> }) => staticAnatomy(props),
}));

describe('CompactAnatomy', () => {
  beforeEach(() => {
    staticAnatomy.mockReset();
    staticAnatomy.mockImplementation(({ injuries }) => <output data-testid="static-anatomy" data-injuries={injuries.map((injury: { area: string; side: string; severity: string }) => `${injury.severity}:${injury.side}:${injury.area}`).join(',')} />);
  });

  it('renders an accessible healthy state with a static GLB model', async () => {
    render(<CompactAnatomy injuries={[]} highestSeverity={null} />);
    expect(screen.getByText('Healthy')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /No active injuries/i })).toBeInTheDocument();
    expect(await screen.findByTestId('static-anatomy')).toHaveAttribute('data-injuries', '');
  });

  it('passes active injuries to the static GLB model', async () => {
    render(<CompactAnatomy injuries={[{ bodyRegion: 'Leg', area: 'Knee', side: 'Both', severity: 'Severe' }]} highestSeverity="Severe" />);

    expect(await screen.findByTestId('static-anatomy')).toHaveAttribute('data-injuries', 'Severe:Both:Knee');
  });

  it('contains a failed model with a retry fallback', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    staticAnatomy.mockImplementation(() => { throw new Error('model unavailable'); });

    render(<CompactAnatomy injuries={[]} highestSeverity={null} />);

    expect(await screen.findByRole('button', { name: 'Retry body map' })).toBeInTheDocument();
    error.mockRestore();
  });
});
