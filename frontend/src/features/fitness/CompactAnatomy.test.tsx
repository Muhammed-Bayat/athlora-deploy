import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { aggregateCompactInjuries, CompactAnatomy, injurySummaryText } from './CompactAnatomy';
import styles from './CompactAnatomy.module.css';

vi.mock('three', () => { throw new Error('Compact anatomy must not import Three.js'); });

describe('CompactAnatomy', () => {
  it('uses the highest severity when active injuries overlap', () => {
    const zones = aggregateCompactInjuries([
      { bodyRegion: 'Arm', area: 'Forearm', side: 'Left', severity: 'Minor' },
      { bodyRegion: 'Arm', area: 'Forearm', side: 'Left', severity: 'Severe' },
      { bodyRegion: 'Leg', area: 'Knee', side: 'Both', severity: 'Moderate' },
    ]);

    expect(zones.get('left:Forearm')).toBe('Severe');
    expect(zones.get('left:Knee')).toBe('Moderate');
    expect(zones.get('right:Knee')).toBe('Moderate');
  });

  it('renders an accessible healthy state without WebGL', () => {
    render(<CompactAnatomy injuries={[]} highestSeverity={null} />);
    expect(screen.getByText('Healthy')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /No active injuries/i })).toBeInTheDocument();
    expect(injurySummaryText([])).toBe('No active injuries. Athlete is healthy.');
  });

  it('renders contoured paths and applies injury severity to mapped regions', () => {
    render(<CompactAnatomy injuries={[{ bodyRegion: 'Leg', area: 'Knee', side: 'Both', severity: 'Severe' }]} highestSeverity="Severe" />);

    const body = screen.getByRole('img', { name: /1 active injury/i });
    expect(body.querySelectorAll('path')).not.toHaveLength(0);
    expect(body.querySelectorAll('rect')).toHaveLength(0);
    expect(body.querySelector('[data-zone="left:Knee"]')).toHaveClass(styles.severitySevere);
    expect(body.querySelector('[data-zone="right:Knee"]')).toHaveClass(styles.severitySevere);
  });
});
