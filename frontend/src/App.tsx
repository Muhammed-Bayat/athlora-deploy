import { useEffect, useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import styles from './App.module.css';
import { CoachConsole } from './features/dashboard/CoachConsole';
import { LandingPage } from './features/landing/LandingPage';

export default function App() {
  const { isAuthenticated, isLoading } = useAuth0();
  const [route, setRoute] = useState(() => window.location.pathname);

  useEffect(() => {
    const handlePopState = () => setRoute(window.location.pathname);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const openConsole = () => {
    window.history.pushState({}, '', '/console');
    setRoute('/console');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (isLoading) {
    return (
      <main className={styles.loading} aria-busy="true" aria-label="Loading Athlora">
        <img src="/logo-removebg.png" alt="" />
        <p>Preparing your season...</p>
      </main>
    );
  }

  return isAuthenticated || route === '/console' ? (
    <CoachConsole />
  ) : (
    <LandingPage onLogin={openConsole} />
  );
}
