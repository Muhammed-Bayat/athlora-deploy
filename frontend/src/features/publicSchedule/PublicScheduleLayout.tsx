import type { ReactNode } from 'react';
import styles from './PublicSchedulePage.module.css';

interface PublicScheduleLayoutProps {
  activeNav: 'schedule' | 'stats';
  children: ReactNode;
}

export function PublicScheduleLayout({ activeNav, children }: PublicScheduleLayoutProps) {
  return (
    <div className={styles.page}>
      <div className={styles.aurora} aria-hidden="true"><i /><i /></div>
      <header className={styles.header}>
        <a className={styles.brand} href="/"><img src="/logo-removebg.png" alt="" /><span>Athlora<small>Performance OS</small></span></a>
        <nav aria-label="Public navigation">
          <a href="/">Home</a>
          <a href="/stats" aria-current={activeNav === 'stats' ? 'page' : undefined} className={activeNav === 'stats' ? styles.activeLink : undefined}>Stats</a>
          <a href="/schedule" aria-current={activeNav === 'schedule' ? 'page' : undefined} className={activeNav === 'schedule' ? styles.activeLink : undefined}>Schedule</a>
        </nav>
      </header>
      <main className={styles.content}>{children}</main>
      <footer className={styles.footer}><span>ATHLORA / PUBLIC SCHEDULE</span><p>Published by participating clubs.</p></footer>
    </div>
  );
}
