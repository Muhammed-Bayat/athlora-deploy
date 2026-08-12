import { useState, type ComponentType } from 'react';
import styles from './App.module.css';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { AthletesPage } from './features/athletes/AthletesPage';
import { EventsPage } from './features/events/EventsPage';
import { LiveLoggingPage } from './features/timeline/LiveLoggingPage';
import { ResultsPage } from './features/results/ResultsPage';
import { AuthPage } from './features/auth/AuthPage';

type Section = 'dashboard' | 'athletes' | 'events' | 'timeline' | 'results' | 'auth';

const NAV: Array<{ id: Section; label: string }> = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'athletes', label: 'Athletes' },
  { id: 'events', label: 'Events' },
  { id: 'timeline', label: 'Live Logging' },
  { id: 'results', label: 'Results' },
  { id: 'auth', label: 'Sign in' },
];

const PAGES: Record<Section, ComponentType> = {
  dashboard: DashboardPage,
  athletes: AthletesPage,
  events: EventsPage,
  timeline: LiveLoggingPage,
  results: ResultsPage,
  auth: AuthPage,
};

export default function App() {
  const [active, setActive] = useState<Section>('dashboard');
  const Page = PAGES[active];

  return (
    <div className={styles.shell}>
      <nav aria-label="Main" className={`${styles.sideNav} ink`}>
        <span className={styles.brand}>
          <img className={styles.brandLogo} src="/logo-removebg.png" alt="" />
          Athlora
        </span>
        <ul className={styles.navList}>
          {NAV.map((item) => (
            <li key={item.id} className={styles.navItem}>
              <button
                type="button"
                className={styles.navButton}
                aria-current={active === item.id ? 'page' : undefined}
                onClick={() => setActive(item.id)}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <main className={styles.content}>
        <Page />
      </main>
    </div>
  );
}