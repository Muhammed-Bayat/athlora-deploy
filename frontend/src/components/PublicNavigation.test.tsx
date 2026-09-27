import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PublicNavigation } from './PublicNavigation';

describe('PublicNavigation', () => {
  it.each([
    ['home', ['Stats', 'Leaderboard', 'Reports', 'Schedule']],
    ['stats', ['Home', 'Leaderboard', 'Reports', 'Schedule']],
    ['leaderboard', ['Home', 'Stats', 'Reports', 'Schedule']],
    ['reports', ['Home', 'Stats', 'Leaderboard', 'Schedule']],
    ['schedule', ['Home', 'Stats', 'Leaderboard', 'Reports']],
  ] as const)('lists every destination except %s', (current, expectedLinks) => {
    render(<PublicNavigation current={current} />);

    const links = screen.getAllByRole('link').map((link) => link.textContent);
    expect(links).toEqual(expectedLinks);
  });
});
