import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PublicNavigation } from './PublicNavigation';

describe('PublicNavigation', () => {
  it.each([
    ['home', ['Stats', 'Leaderboard', 'Standings', 'Reports', 'Schedule']],
    ['stats', ['Home', 'Leaderboard', 'Standings', 'Reports', 'Schedule']],
    ['leaderboard', ['Home', 'Stats', 'Standings', 'Reports', 'Schedule']],
    ['standings', ['Home', 'Stats', 'Leaderboard', 'Reports', 'Schedule']],
    ['reports', ['Home', 'Stats', 'Leaderboard', 'Standings', 'Schedule']],
    ['schedule', ['Home', 'Stats', 'Leaderboard', 'Standings', 'Reports']],
  ] as const)('lists every destination except %s', (current, expectedLinks) => {
    render(<PublicNavigation current={current} />);

    const links = screen.getAllByRole('link').map((link) => link.textContent);
    expect(links).toEqual(expectedLinks);
  });
});
