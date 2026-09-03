import { useAuth0 } from '@auth0/auth0-react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import styles from './App.module.css';
import { CoachConsole } from './features/dashboard/CoachConsole';
import { LandingPage } from './features/landing/LandingPage';
import { acceptWorkspaceInvitation } from './api/workspaces';
import { respondToFixtureInvitation } from './api/fixtures';
import { ApiError } from './api/client';
import { Button, Input } from './components';
import { useWorkspace } from './features/auth/WorkspaceContext';

export default function App() {
  return <BrowserRouter><AppRoutes /></BrowserRouter>;
}

function AppRoutes() {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth0();
  const location = useLocation();
  const returnTo = `${location.pathname}${location.search}${location.hash}`;

  const openConsole = () => {
    void loginWithRedirect({ appState: { returnTo: returnTo.startsWith('/console') || /^\/(?:invitations|fixture-invitations)\/[^/]+$/.test(returnTo) ? returnTo : '/console' } });
  };
  const createAccount = () => {
    void loginWithRedirect({ authorizationParams: { screen_hint: 'signup' }, appState: { returnTo: returnTo.startsWith('/console') || /^\/(?:invitations|fixture-invitations)\/[^/]+$/.test(returnTo) ? returnTo : '/console' } });
  };
  const openPasswordHelp = () => {
    void loginWithRedirect({ authorizationParams: { prompt: 'login' }, appState: { returnTo: returnTo.startsWith('/console') || /^\/(?:invitations|fixture-invitations)\/[^/]+$/.test(returnTo) ? returnTo : '/console' } });
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
    <Route path="/fixture-invitations/:token" element={<FixtureInvitationAcceptance />} />
    <Route path="/console/*" element={<CoachConsole />} />
    <Route path="*" element={<Navigate to="/console" replace />} />
  </Routes>;
}

function FixtureInvitationAcceptance() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { activeWorkspace, workspaces, selectWorkspace } = useWorkspace();
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const respond = async (response: 'accepted' | 'declined' | 'change_requested') => {
    if (!token) return;
    setBusy(true); setError(null);
    try {
      await respondToFixtureInvitation(token, response, response === 'change_requested' ? message : undefined);
      navigate('/console/fixtures', { replace: true });
    } catch (responseError) {
      if (responseError instanceof ApiError && responseError.code === 'WORKSPACE_CAPABILITY_DENIED') {
        setError('This workspace has assistant access. Select a separate workspace where you are a coach to accept as a guest team.');
      } else if (responseError instanceof ApiError && responseError.code === 'FIXTURE_HOST_CANNOT_ACCEPT') {
        setError('The host workspace already has access to this event. Select a separate workspace to accept as a guest team.');
      } else {
        setError(responseError instanceof Error ? responseError.message : 'Could not respond to this fixture invitation.');
      }
    } finally { setBusy(false); }
  };
  const canRespond = activeWorkspace.role === 'coach';
  return <main className={styles.loading}>
    <h1>Fixture invitation</h1>
    <p>Accept as a coach in a separate guest workspace. The host workspace already has direct access to this event.</p>
    <label htmlFor="fixture-workspace">Guest workspace</label>
    <select id="fixture-workspace" value={activeWorkspace.id} onChange={(change) => selectWorkspace(change.target.value)} disabled={busy}>
      {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name} ({workspace.role})</option>)}
    </select>
    {!canRespond && <p role="status">Select a workspace where you are a coach to respond.</p>}
    {error && <p role="alert">{error}</p>}
    <div><Button onClick={() => void respond('accepted')} disabled={busy || !canRespond}>Accept fixture</Button><Button variant="secondary" onClick={() => void respond('declined')} disabled={busy || !canRespond}>Decline</Button></div>
    <label htmlFor="fixture-change-message">Request a change</label>
    <Input id="fixture-change-message" value={message} onChange={(change) => setMessage(change.target.value)} disabled={busy || !canRespond} />
    <Button variant="secondary" onClick={() => void respond('change_requested')} disabled={busy || !canRespond || !message.trim()}>Send change request</Button>
  </main>;
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
