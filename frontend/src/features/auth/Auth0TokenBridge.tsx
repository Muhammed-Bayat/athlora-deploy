import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { setAccessTokenGetter, syncCurrentUser } from '../../api/client';
import { Button } from '../../components';
import type { User } from '../../types';
import styles from './Auth0TokenBridge.module.css';
import { CurrentUserProvider } from './CurrentUserProvider';

interface Auth0TokenBridgeProps {
  children: ReactNode;
}

type SynchronizationState =
  | { status: 'idle' }
  | { status: 'synchronizing'; subject: string }
  | { status: 'ready'; subject: string; user: User }
  | { status: 'error'; subject: string };

interface SynchronizationAttempt {
  subject: string;
  retry: number;
  promise: Promise<User>;
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
      attempt = { subject, retry, promise: syncCurrentUser() };
      attemptRef.current = attempt;
    }

    void attempt.promise.then(
      (synchronizedUser) => {
        if (active) {
          setSynchronization({ status: 'ready', subject, user: synchronizedUser });
        }
      },
      () => {
        if (active) {
          setSynchronization({ status: 'error', subject });
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
      <CurrentUserProvider user={synchronization.user}>{children}</CurrentUserProvider>
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
