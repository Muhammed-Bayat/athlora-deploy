import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { ApiError, setAccessTokenGetter, syncCurrentUser } from '../../api/client';
import { acceptWorkspaceInvitation, listWorkspaces } from '../../api/workspaces';
import { Button } from '../../components';
import type { User, Workspace } from '../../types';
import styles from './Auth0TokenBridge.module.css';
import { CurrentUserProvider } from './CurrentUserProvider';
import { WorkspaceProvider } from './WorkspaceProvider';
import { ClubOnboarding } from './ClubOnboarding';
import { ConsentGate } from './ConsentGate';

interface Auth0TokenBridgeProps {
  children: ReactNode;
}

type SynchronizationState =
  | { status: 'idle' }
  | { status: 'synchronizing'; subject: string }
  | { status: 'ready'; subject: string; user: User; workspaces: Workspace[]; activeWorkspace: Workspace }
  | { status: 'consent_required'; subject: string; user: User }
  | { status: 'onboarding'; subject: string; user: User }
  | { status: 'error'; subject: string; code: string; requestId?: string };

interface SynchronizationAttempt {
  subject: string;
  retry: number;
  promise: Promise<
    | { kind: 'ready'; user: User; workspaces: Workspace[]; activeWorkspace: Workspace }
    | { kind: 'consent_required'; user: User }
    | { kind: 'onboarding'; user: User }
  >;
}

export function Auth0TokenBridge({ children }: Auth0TokenBridgeProps) {
  const { getAccessTokenSilently, isAuthenticated, user } = useAuth0();
  const [retry, setRetry] = useState(0);
  const [synchronization, setSynchronization] = useState<SynchronizationState>({
    status: 'idle',
  });
  const attemptRef = useRef<SynchronizationAttempt>();
  const subject = user?.sub;

  useEffect(() => {
    return setAccessTokenGetter(isAuthenticated ? getAccessTokenSilently : undefined);
  }, [getAccessTokenSilently, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      attemptRef.current = undefined;
      return;
    }
    if (!subject) {
      return;
    }

    let active = true;
    setSynchronization({ status: 'synchronizing', subject });

    let attempt = attemptRef.current;
    if (!attempt || attempt.subject !== subject || attempt.retry !== retry) {
      attempt = {
        subject,
        retry,
        promise: syncCurrentUser().then(async (synchronizedUser) => {
            if (!synchronizedUser.consentAcceptedAt) {
              return { kind: 'consent_required' as const, user: synchronizedUser };
            }
            let response = await listWorkspaces();
            const storedWorkspaceId = (() => { try { return localStorage.getItem(`athlora-active-workspace:${subject}`); } catch { return null; } })();
            let activeWorkspace = response.data.find((workspace) => workspace.id === storedWorkspaceId)
              ?? response.data.find((workspace) => workspace.id === response.meta.activeWorkspaceId)
              ?? response.data[0];
            const invitationToken = /^\/invitations\/([^/]+)$/.exec(window.location.pathname)?.[1];
            if (!activeWorkspace && invitationToken) {
              const joinedWorkspace = await acceptWorkspaceInvitation(invitationToken);
              response = await listWorkspaces();
              activeWorkspace = response.data.find((workspace) => workspace.id === joinedWorkspace.id) ?? response.data[0];
              window.history.replaceState({}, '', '/console');
            }
            if (!activeWorkspace) return { kind: 'onboarding' as const, user: synchronizedUser };
            return { kind: 'ready' as const, user: synchronizedUser, workspaces: response.data, activeWorkspace };
        }),
      };
      attemptRef.current = attempt;
    }

    void attempt.promise.then(
      (session) => {
        if (active) {
          if (session.kind === 'consent_required') {
            setSynchronization({ status: 'consent_required', subject, user: session.user });
          } else if (session.kind === 'onboarding') {
            setSynchronization({ status: 'onboarding', subject, user: session.user });
          } else {
            setSynchronization({ status: 'ready', subject, user: session.user, workspaces: session.workspaces, activeWorkspace: session.activeWorkspace });
          }
        }
      },
      (error: unknown) => {
        if (active) {
          const requestId = error instanceof ApiError && typeof error.details.requestId === 'string'
            ? error.details.requestId
            : undefined;
          setSynchronization({
            status: 'error',
            subject,
            code: error instanceof ApiError ? error.code : 'UNEXPECTED_ERROR',
            requestId,
          });
        }
      },
    );

    return () => {
      active = false;
    };
  }, [isAuthenticated, retry, subject]);

  if (!isAuthenticated) {
    return <CurrentUserProvider user={null}>{children}</CurrentUserProvider>;
  }

  if (
    subject &&
    synchronization.status === 'ready' &&
    synchronization.subject === subject
  ) {
    return (
      <CurrentUserProvider user={synchronization.user}>
        <WorkspaceProvider subject={subject} initialWorkspace={synchronization.activeWorkspace} workspaces={synchronization.workspaces}>
          {children}
        </WorkspaceProvider>
      </CurrentUserProvider>
    );
  }

  if (
    subject &&
    synchronization.status === 'onboarding' &&
    synchronization.subject === subject
  ) {
    return <CurrentUserProvider user={synchronization.user}>
      <ClubOnboarding onMembershipAvailable={() => setRetry((currentRetry) => currentRetry + 1)} />
    </CurrentUserProvider>;
  }

  if (
    subject &&
    synchronization.status === 'consent_required' &&
    synchronization.subject === subject
  ) {
    return <CurrentUserProvider user={synchronization.user}>
      <ConsentGate onConsented={() => setRetry((currentRetry) => currentRetry + 1)} />
    </CurrentUserProvider>;
  }

  if (
    subject &&
    synchronization.status === 'error' &&
    synchronization.subject === subject
  ) {
    return (
      <main className={styles.gate} aria-labelledby="user-sync-error-title">
        <section className={styles.card} role="alert" aria-labelledby="user-sync-error-title">
          <p className={styles.eyebrow}>Account connection interrupted</p>
          <h1 id="user-sync-error-title">We could not finish signing you in</h1>
          <p className={styles.description}>
            Your account could not be synchronized. Try again before continuing to Athlora.
          </p>
          <p className={styles.reference}>
            Error code: {synchronization.code}
            {synchronization.requestId ? <> | Reference: {synchronization.requestId}</> : null}
          </p>
          <Button onClick={() => setRetry((currentRetry) => currentRetry + 1)}>Try again</Button>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.gate} aria-busy="true" aria-label="Synchronizing your account">
      <div className={styles.loadingScene}>
        <div className={styles.loadingBrand}><img src="/logo-removebg.png" alt="" /><span><strong>Athlora</strong><small>Athletics coaching</small></span></div>
        <div className={styles.loadingSignal} aria-hidden="true"><i /><i /><i /></div>
        <p className={styles.status} role="status">Preparing your account...</p>
      </div>
    </main>
  );
}
