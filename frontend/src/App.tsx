import { useAuth0 } from '@auth0/auth0-react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import styles from './App.module.css';
import { CoachConsole } from './features/dashboard/CoachConsole';
import { LandingPage } from './features/landing/LandingPage';
import { acceptWorkspaceInvitation } from './api/workspaces';
import { useWorkspace } from './features/auth/WorkspaceContext';

export default function App() {
  return <BrowserRouter><AppRoutes /></BrowserRouter>;
}

function AppRoutes() {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth0();
  const location = useLocation();
  const returnTo = `${location.pathname}${location.search}${location.hash}`;

  const openConsole = () => {
    void loginWithRedirect({ appState: { returnTo: returnTo.startsWith('/console') || /^\/invitations\/[^/]+$/.test(returnTo) ? returnTo : '/console' } });
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
    <Route path="/invitations/:token" element={<InvitationAcceptance />} />
    <Route path="/console/*" element={<CoachConsole />} />
    <Route path="*" element={<Navigate to="/console" replace />} />
  </Routes>;
}

function InvitationAcceptance() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { refreshWorkspaces } = useWorkspace();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    let active = true;
    void acceptWorkspaceInvitation(token).then(async (workspace) => {
      await refreshWorkspaces(workspace.id);
      if (active) navigate('/console', { replace: true });
    }).catch((acceptanceError: unknown) => {
      if (active) setError(acceptanceError instanceof Error ? acceptanceError.message : 'Could not accept this invitation.');
    });
    return () => { active = false; };
  }, [navigate, refreshWorkspaces, token]);

  return <main className={styles.loading} aria-busy={error ? undefined : 'true'}>
    {error ? <p role="alert">{error}</p> : <p role="status">Joining workspace...</p>}
  </main>;
}
