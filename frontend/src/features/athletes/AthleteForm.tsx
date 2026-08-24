import { useRef, useState, type FormEvent } from 'react';
import { ApiError } from '../../api/client';
import { Button, Input } from '../../components';
import type { Athlete, AthleteMutationPayload } from '../../types';
import { athleteErrorMessage } from './athleteError';
import styles from './AthleteForm.module.css';

interface AthleteDraft {
  name: string;
  dob: string;
  gender: string;
  squad: string;
  notes: string;
}

type FieldErrors = Partial<Record<keyof AthleteDraft, string>>;

function draftFor(athlete?: Athlete): AthleteDraft {
  return {
    name: athlete?.name ?? '',
    dob: athlete?.dob ?? '',
    gender: athlete?.gender ?? '',
    squad: athlete?.squad ?? '',
    notes: athlete?.notes ?? '',
  };
}

function toPayload(draft: AthleteDraft): AthleteMutationPayload {
  const nullable = (value: string) => value.trim() || null;
  return {
    name: draft.name.trim(),
    dob: draft.dob || null,
    gender: nullable(draft.gender),
    squad: nullable(draft.squad),
    notes: nullable(draft.notes),
  };
}

function validationErrors(error: unknown): FieldErrors {
  if (!(error instanceof ApiError) || error.code !== 'VALIDATION_ERROR') return {};
  const issues = error.details.issues;
  if (!Array.isArray(issues)) return {};
  const fields: FieldErrors = {};
  for (const value of issues) {
    if (typeof value !== 'object' || value === null) continue;
    const path = 'path' in value ? value.path : undefined;
    const message = 'message' in value ? value.message : undefined;
    if (
      typeof path === 'string'
      && typeof message === 'string'
      && ['name', 'dob', 'gender', 'squad', 'notes'].includes(path)
    ) {
      fields[path as keyof AthleteDraft] ??= message;
    }
  }
  return fields;
}

interface AthleteFormProps {
  athlete?: Athlete;
  onSave: (payload: AthleteMutationPayload) => Promise<void>;
  onCancel: () => void;
  onSubmittingChange: (submitting: boolean) => void;
}

export function AthleteForm({ athlete, onSave, onCancel, onSubmittingChange }: AthleteFormProps) {
  const [draft, setDraft] = useState(() => draftFor(athlete));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const setField = <K extends keyof AthleteDraft>(field: K, value: AthleteDraft[K]) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const nextErrors: FieldErrors = {};
    if (!draft.name.trim()) nextErrors.name = 'Athlete name is required.';
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      nameRef.current?.focus();
      return;
    }

    setSubmitting(true);
    onSubmittingChange(true);
    setSubmitError(null);
    try {
      await onSave(toPayload(draft));
    } catch (error) {
      const fields = validationErrors(error);
      setErrors(fields);
      setSubmitError(athleteErrorMessage(error));
      if (fields.name) nameRef.current?.focus();
    } finally {
      setSubmitting(false);
      onSubmittingChange(false);
    }
  };

  return (
    <form className={styles.formFields} onSubmit={submit} noValidate>
      {submitError && <p className={styles.formError} role="alert">{submitError}</p>}
      <label htmlFor="athlete-name">Athlete name</label>
      <Input ref={nameRef} id="athlete-name" value={draft.name} onChange={(event) => setField('name', event.target.value)} invalid={Boolean(errors.name)} aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? 'athlete-name-error' : undefined} required aria-required="true" disabled={submitting} />
      {errors.name && <span id="athlete-name-error" className={styles.fieldError}>{errors.name}</span>}

      <div className={styles.formRow}>
        <div>
          <label htmlFor="athlete-dob">Date of birth <span>Optional</span></label>
          <Input id="athlete-dob" type="date" value={draft.dob} onChange={(event) => setField('dob', event.target.value)} invalid={Boolean(errors.dob)} aria-invalid={Boolean(errors.dob)} aria-describedby={errors.dob ? 'athlete-dob-error' : undefined} disabled={submitting} />
          {errors.dob && <span id="athlete-dob-error" className={styles.fieldError}>{errors.dob}</span>}
        </div>
        <div>
          <label htmlFor="athlete-gender">Gender category <span>Optional</span></label>
          <Input id="athlete-gender" value={draft.gender} onChange={(event) => setField('gender', event.target.value)} invalid={Boolean(errors.gender)} aria-invalid={Boolean(errors.gender)} aria-describedby={errors.gender ? 'athlete-gender-error' : undefined} disabled={submitting} />
          {errors.gender && <span id="athlete-gender-error" className={styles.fieldError}>{errors.gender}</span>}
        </div>
      </div>

      <label htmlFor="athlete-squad">Discipline group / squad <span>Optional</span></label>
      <Input id="athlete-squad" value={draft.squad} onChange={(event) => setField('squad', event.target.value)} invalid={Boolean(errors.squad)} aria-invalid={Boolean(errors.squad)} aria-describedby={errors.squad ? 'athlete-squad-error' : undefined} disabled={submitting} />
      {errors.squad && <span id="athlete-squad-error" className={styles.fieldError}>{errors.squad}</span>}

      <label htmlFor="athlete-notes">Coach notes <span>Optional</span></label>
      <textarea id="athlete-notes" value={draft.notes} onChange={(event) => setField('notes', event.target.value)} aria-invalid={Boolean(errors.notes)} aria-describedby={errors.notes ? 'athlete-notes-error' : undefined} disabled={submitting} />
      {errors.notes && <span id="athlete-notes-error" className={styles.fieldError}>{errors.notes}</span>}

      <div className={styles.formActions}>
        <Button variant="secondary" onClick={onCancel} disabled={submitting}>Cancel</Button>
        <Button type="submit" disabled={submitting}>{submitting ? 'Saving...' : athlete ? 'Save changes' : 'Add athlete'}</Button>
      </div>
    </form>
  );
}
