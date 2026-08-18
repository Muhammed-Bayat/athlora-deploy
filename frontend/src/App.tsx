import { useAuth0 } from '@auth0/auth0-react';
import styles from './App.module.css';
import { CoachConsole } from './features/dashboard/CoachConsole';
import { LandingPage } from './features/landing/LandingPage';

export default function App() {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth0();

  const openConsole = () => {
    void loginWithRedirect({ appState: { returnTo: '/console' } });
  };
  const createAccount = () => {
    void loginWithRedirect({ authorizationParams: { screen_hint: 'signup' }, appState: { returnTo: '/console' } });
  };
  const openPasswordHelp = () => {
    void loginWithRedirect({ authorizationParams: { prompt: 'login' }, appState: { returnTo: '/console' } });
  };

  if (isLoading) {
    return (
      <main className={styles.loading} aria-busy="true" aria-label="Loading Athlora">
        <img src="/logo-removebg.png" alt="" />
        <p>Preparing your season...</p>
      </main>
    );
  }

  return isAuthenticated ? (
    <CoachConsole />
  ) : (
    <LandingPage onLogin={openConsole} onSignup={createAccount} onPasswordHelp={openPasswordHelp} />
  );
}
