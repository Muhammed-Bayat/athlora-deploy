import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { ApiError, setAccessTokenGetter, syncCurrentUser } from '../../api/client';
import { listWorkspaces } from '../../api/workspaces';
import { Button } from '../../components';
import type { User, Workspace } from '../../types';
import styles from './Auth0TokenBridge.module.css';
import { CurrentUserProvider } from './CurrentUserProvider';
import { WorkspaceProvider } from './WorkspaceProvider';

interface Auth0TokenBridgeProps {
  children: ReactNode;
}

type SynchronizationState =
  | { status: 'idle' }
  | { status: 'synchronizing'; subject: string }
  | { status: 'ready'; subject: string; user: User; workspaces: Workspace[]; activeWorkspace: Workspace }
  | { status: 'error'; subject: string; code: string; requestId?: string };

interface SynchronizationAttempt {
  subject: string;
  retry: number;
  promise: Promise<{ user: User; workspaces: Workspace[]; activeWorkspace: Workspace }>;
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
          const response = await listWorkspaces();
          const storedWorkspaceId = (() => { try { return localStorage.getItem(`athlora-active-workspace:${subject}`); } catch { return null; } })();
          const activeWorkspace = response.data.find((workspace) => workspace.id === storedWorkspaceId)
            ?? response.data.find((workspace) => workspace.id === response.meta.activeWorkspaceId)
            ?? response.data[0];
          if (!activeWorkspace) throw new Error('No workspace is available for this account');
          return { user: synchronizedUser, workspaces: response.data, activeWorkspace };
        }),
      };
      attemptRef.current = attempt;
    }

    void attempt.promise.then(
      (session) => {
        if (active) {
          setSynchronization({ status: 'ready', subject, ...session });
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
      <p className={styles.status} role="status">
        Preparing your account...
      </p>
    </main>
  );
}
