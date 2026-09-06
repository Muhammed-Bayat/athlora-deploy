import { useState, useCallback } from 'react';
import { Button } from '../../components';
import { acceptConsent } from '../../api/auth';
import styles from './Auth0TokenBridge.module.css';

interface ConsentGateProps {
  onConsented: () => void;
}

const CURRENT_CONSENT_VERSION = '1.0';

export function ConsentGate({ onConsented }: ConsentGateProps) {
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    if (!accepted) return;
    setSubmitting(true);
    setError(null);
    try {
      await acceptConsent(CURRENT_CONSENT_VERSION);
      onConsented();
    } catch {
      setError('Could not save your consent. Please try again.');
      setSubmitting(false);
    }
  }, [accepted, onConsented]);

  return (
    <main className={styles.gate} aria-labelledby="consent-title">
      <section className={styles.card} aria-labelledby="consent-title">
        <p className={styles.eyebrow}>Before you continue</p>
        <h1 id="consent-title">Welcome to Athlora</h1>
        <p className={styles.description}>
          Please review our legal documents before using the application.
        </p>

        <div className={styles.legalLinks}>
          <a href="/docs/legal/privacy-policy" target="_blank" rel="noopener noreferrer">
            Privacy Policy
          </a>
          <a href="/docs/legal/terms" target="_blank" rel="noopener noreferrer">
            Terms and Conditions
          </a>
        </div>

        <label className={styles.consentCheckbox}>
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            disabled={submitting}
          />
          <span>
            I have read and agree to the{' '}
            <a href="/docs/legal/privacy-policy" target="_blank" rel="noopener noreferrer">
              Privacy Policy
            </a>{' '}
            and{' '}
            <a href="/docs/legal/terms" target="_blank" rel="noopener noreferrer">
              Terms and Conditions
            </a>
          </span>
        </label>

        {error && (
          <p className={styles.description} role="alert">
            {error}
          </p>
        )}

        <Button onClick={handleSubmit} disabled={!accepted || submitting}>
          {submitting ? 'Saving...' : 'Continue'}
        </Button>
      </section>
    </main>
  );
}
