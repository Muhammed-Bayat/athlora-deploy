import { useAuth0 } from '@auth0/auth0-react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import styles from './App.module.css';
import { CoachConsole } from './features/dashboard/CoachConsole';
import { LandingPage } from './features/landing/LandingPage';

export default function App() {
  return <BrowserRouter><AppRoutes /></BrowserRouter>;
}

function AppRoutes() {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth0();
  const location = useLocation();
  const returnTo = `${location.pathname}${location.search}${location.hash}`;

  const openConsole = () => {
    void loginWithRedirect({ appState: { returnTo: returnTo.startsWith('/console') ? returnTo : '/console' } });
  };
  const createAccount = () => {
    void loginWithRedirect({ authorizationParams: { screen_hint: 'signup' }, appState: { returnTo: returnTo.startsWith('/console') ? returnTo : '/console' } });
  };
  const openPasswordHelp = () => {
    void loginWithRedirect({ authorizationParams: { prompt: 'login' }, appState: { returnTo: returnTo.startsWith('/console') ? returnTo : '/console' } });
  };

  if (isLoading) {
    return (
      <main className={styles.loading} aria-busy="true" aria-label="Loading Athlora">
        <img src="/logo-removebg.png" alt="" />
        <p>Preparing your season...</p>
      </main>
    );
  }

  if (!isAuthenticated) return <LandingPage onLogin={openConsole} onSignup={createAccount} onPasswordHelp={openPasswordHelp} />;

  return <Routes>
    <Route path="/" element={<Navigate to="/console" replace />} />
    <Route path="/console/*" element={<CoachConsole />} />
    <Route path="*" element={<Navigate to="/console" replace />} />
  </Routes>;
}
