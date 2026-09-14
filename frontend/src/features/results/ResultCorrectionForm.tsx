import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiError } from '../../api/client';
import { overrideResult } from '../../api/results';
import { Button, Input } from '../../components';
import type { Result, User } from '../../types';
import type { ResultCorrectionTarget } from './EventResultsView';
import {
  format100mSeconds,
  formatAuditDateTime,
  getEffectiveResult,
  getResultOutcomeLabel,
  has100mHundredthPrecision,
} from './resultPresentation';
import styles from './EventResults.module.css';

interface ResultCorrectionFormProps {
  target: ResultCorrectionTarget;
  currentUser: Pick<User, 'id' | 'name'> | null;
  onBack: () => void;
  onSaved: (message: string) => void;
  onBusyChange: (busy: boolean) => void;
}

interface CorrectionErrors {
  correctedTime?: string;
  reason?: string;
}

function correctionErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'NETWORK_ERROR') return 'Could not reach Athlora. Your correction was not changed.';
    if (error.status === 401) return 'Your session could not be authorized. Please sign in again.';
    return error.message;
  }
  return 'The correction could not be saved. Please try again.';
}

function actorLabel(actorId: string, currentUser: Pick<User, 'id' | 'name'> | null): string {
  return currentUser?.id === actorId ? `${currentUser.name} (you)` : `User ${actorId.slice(0, 8)}`;
}

function derivedLabel(result: Result): string {
  return result.finalResult !== null
    ? format100mSeconds(result.finalResult)
    : getResultOutcomeLabel(result.outcome);
}

export function ResultCorrectionForm({
  target,
  currentUser,
  onBack,
  onSaved,
  onBusyChange,
}: ResultCorrectionFormProps) {
  const { result, athleteName } = target;
  const effective = getEffectiveResult(result);
  const [correctedTime, setCorrectedTime] = useState(
    result.manualOverride === null ? '' : String(result.manualOverride),
  );
  const [reason, setReason] = useState(result.overrideReason ?? '');
  const [errors, setErrors] = useState<CorrectionErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const timeRef = useRef<HTMLInputElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const clearButtonRef = useRef<HTMLButtonElement>(null);
  const keepButtonRef = useRef<HTMLButtonElement>(null);
  const isVoid = result.outcome === 'dq' || result.outcome === 'dnf' || result.outcome === 'dns';

  useEffect(() => {
    if (isVoid) clearButtonRef.current?.focus();
    else timeRef.current?.focus();
  }, [isVoid]);

  useEffect(() => {
    if (confirmingClear) keepButtonRef.current?.focus();
  }, [confirmingClear]);

  useEffect(() => {
    onBusyChange(submitting);
  }, [onBusyChange, submitting]);

  useEffect(() => () => onBusyChange(false), [onBusyChange]);

  const submit = async (formEvent: FormEvent) => {
    formEvent.preventDefault();
    if (isVoid) return;

    const nextErrors: CorrectionErrors = {};
    const parsedTime = Number(correctedTime);
    if (!correctedTime.trim() || !Number.isFinite(parsedTime) || parsedTime <= 0) {
      nextErrors.correctedTime = 'Enter a corrected time greater than zero.';
    } else if (!has100mHundredthPrecision(correctedTime)) {
      nextErrors.correctedTime = 'Use no more than two decimal places for a 100m time.';
    }
    if (!reason.trim()) nextErrors.reason = 'A reason is required for every correction.';
    setErrors(nextErrors);
    if (nextErrors.correctedTime) {
      timeRef.current?.focus();
      return;
    }
    if (nextErrors.reason) {
      reasonRef.current?.focus();
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      await overrideResult(result.eventId, result.athleteId, {
        manualOverride: parsedTime,
        overrideReason: reason.trim(),
      });
      onSaved(`${athleteName}'s result corrected to ${format100mSeconds(parsedTime)}. All event placings were refreshed.`);
    } catch (error) {
      setSubmitError(correctionErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const clear = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await overrideResult(result.eventId, result.athleteId, {
        manualOverride: null,
        overrideReason: null,
      });
      onSaved(`${athleteName}'s manual correction was cleared. The timeline-derived result is authoritative again.`);
    } catch (error) {
      setSubmitError(correctionErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className={styles.correctionForm} onSubmit={submit} noValidate>
      <dl className={styles.correctionSummary}>
        <div>
          <dt>Athlete</dt>
          <dd>{athleteName}</dd>
        </div>
        <div>
          <dt>Derived value · read only</dt>
          <dd>{derivedLabel(result)}</dd>
        </div>
        <div>
          <dt>Derived outcome</dt>
          <dd>{getResultOutcomeLabel(result.outcome)}</dd>
        </div>
        <div>
          <dt>Current effective value</dt>
          <dd>{effective.value !== null ? format100mSeconds(effective.value) : getResultOutcomeLabel(effective.outcome)}</dd>
        </div>
      </dl>

      {result.manualOverride !== null && result.overriddenBy && result.overrideAt && (
        <div className={styles.correctionAudit}>
          <p>
            Current correction: <strong>{format100mSeconds(result.manualOverride)}</strong><br />
            Applied by <strong>{actorLabel(result.overriddenBy, currentUser)}</strong> on{' '}
            <time dateTime={result.overrideAt}>{formatAuditDateTime(result.overrideAt)}</time><br />
            Reason: <q>{result.overrideReason}</q>
          </p>
        </div>
      )}

      {isVoid && (
        <p className={styles.voidWarning} role="note">
          {getResultOutcomeLabel(result.outcome)} takes precedence over a corrected time. Resolve the incident in the live timeline before setting a time correction.
        </p>
      )}

      {!isVoid && !confirmingClear && (
        <>
          <div className={styles.correctionField}>
            <label htmlFor="result-corrected-time">Corrected time (seconds)</label>
            <Input
              ref={timeRef}
              id="result-corrected-time"
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              value={correctedTime}
              onChange={(input) => {
                setCorrectedTime(input.target.value);
                setErrors((current) => ({ ...current, correctedTime: undefined }));
              }}
              invalid={Boolean(errors.correctedTime)}
              aria-invalid={Boolean(errors.correctedTime)}
              aria-describedby={errors.correctedTime ? 'corrected-time-error' : undefined}
              required
              disabled={submitting}
            />
            {errors.correctedTime && <span id="corrected-time-error" className={styles.fieldError}>{errors.correctedTime}</span>}
          </div>

          <div className={styles.correctionField}>
            <label htmlFor="result-correction-reason">Reason for correction</label>
            <textarea
              ref={reasonRef}
              id="result-correction-reason"
              value={reason}
              onChange={(input) => {
                setReason(input.target.value);
                setErrors((current) => ({ ...current, reason: undefined }));
              }}
              aria-invalid={Boolean(errors.reason)}
              aria-describedby={errors.reason ? 'correction-reason-error' : undefined}
              required
              disabled={submitting}
            />
            {errors.reason && <span id="correction-reason-error" className={styles.fieldError}>{errors.reason}</span>}
          </div>
        </>
      )}

      {confirmingClear && (
        <div className={styles.clearConfirmation} role="region" aria-labelledby="clear-correction-heading">
          <p id="clear-correction-heading">
            Clear the <strong>{format100mSeconds(result.manualOverride!)}</strong> correction and its current actor, time, and reason metadata? The original timeline-derived value <strong>{derivedLabel(result)}</strong> will become authoritative again.
          </p>
        </div>
      )}

      {submitError && <p className={styles.formError} role="alert">{submitError}</p>}

      <div className={styles.correctionActions}>
        <Button
          ref={confirmingClear ? keepButtonRef : undefined}
          type="button"
          variant="secondary"
          onClick={confirmingClear ? () => {
            setConfirmingClear(false);
            window.requestAnimationFrame(() => clearButtonRef.current?.focus());
          } : onBack}
          disabled={submitting}
        >
          {confirmingClear ? 'Keep correction' : 'Back to event'}
        </Button>
        {result.manualOverride !== null && !confirmingClear && (
          <Button ref={clearButtonRef} type="button" variant="danger" onClick={() => setConfirmingClear(true)} disabled={submitting}>Clear correction</Button>
        )}
        {confirmingClear ? (
          <Button type="button" variant="danger" onClick={() => void clear()} disabled={submitting}>
            {submitting ? 'Clearing...' : 'Confirm clear'}
          </Button>
        ) : !isVoid ? (
          <Button type="submit" disabled={submitting}>{submitting ? 'Saving...' : result.manualOverride === null ? 'Apply correction' : 'Update correction'}</Button>
        ) : null}
      </div>
    </form>
  );
}
