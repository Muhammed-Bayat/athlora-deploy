type PublicDestination = 'home' | 'stats' | 'leaderboard' | 'reports' | 'schedule';

const destinations: ReadonlyArray<{ id: PublicDestination; label: string; href: string }> = [
  { id: 'home', label: 'Home', href: '/' },
  { id: 'stats', label: 'Stats', href: '/stats' },
  { id: 'leaderboard', label: 'Leaderboard', href: '/stats/leaderboard' },
  { id: 'reports', label: 'Reports', href: '/stats/report' },
  { id: 'schedule', label: 'Schedule', href: '/schedule' },
];

export function PublicNavigation({ current }: { current: PublicDestination }) {
  return <nav aria-label="Public navigation">
    {destinations.filter((destination) => destination.id !== current).map((destination) => (
      <a key={destination.id} href={destination.href}>{destination.label}</a>
    ))}
  </nav>;
}
