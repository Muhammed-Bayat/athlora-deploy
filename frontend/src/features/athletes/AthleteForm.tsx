import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { listDisciplines } from '../../api/meets';
import { ApiError } from '../../api/client';
import { Button, DatePicker, Input, Select } from '../../components';
import type { Athlete, AthleteMutationPayload, AthleteSeasonGoalInput } from '../../types';
import type { DisciplineDefinition } from '../../types/meets';
import { athleteErrorMessage } from './athleteError';
import styles from './AthleteForm.module.css';

interface AthleteDraft {
  name: string;
  dob: string;
  gender: string;
  squadIds: string[];
  notes: string;
  preferredDisciplineIds: string[];
  seasonGoals: AthleteSeasonGoalInput[];
}

type FieldErrors = Partial<Record<keyof AthleteDraft, string>>;

function draftFor(athlete?: Athlete): AthleteDraft {
  return {
    name: athlete?.name ?? '',
    dob: athlete?.dob ?? '',
    gender: athlete?.gender ?? '',
    squadIds: athlete?.squads?.map((squad) => squad.id) ?? [],
    notes: athlete?.notes ?? '',
    preferredDisciplineIds: athlete?.preferredDisciplineIds ?? [],
    seasonGoals: athlete?.seasonGoals ?? [],
  };
}

function toPayload(draft: AthleteDraft): AthleteMutationPayload {
  const nullable = (value: string) => value.trim() || null;
  return {
    name: draft.name.trim(),
    dob: draft.dob || null,
    gender: nullable(draft.gender),
    squadIds: draft.squadIds,
    notes: nullable(draft.notes),
    preferredDisciplineIds: draft.preferredDisciplineIds,
    seasonGoals: draft.seasonGoals,
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
        && ['name', 'dob', 'gender', 'squadIds', 'notes', 'preferredDisciplineIds', 'seasonGoals'].includes(path)
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
  const [disciplines, setDisciplines] = useState<DisciplineDefinition[]>([]);
  const [disciplinesLoading, setDisciplinesLoading] = useState(true);
  const [disciplinesError, setDisciplinesError] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const loadDisciplines = useCallback(async () => {
    setDisciplinesLoading(true);
    setDisciplinesError(false);
    try {
      const { data } = await listDisciplines();
      setDisciplines(data);
    } catch {
      setDisciplinesError(true);
    } finally {
      setDisciplinesLoading(false);
    }
  }, []);

  useEffect(() => { void loadDisciplines(); }, [loadDisciplines]);

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

  const disciplineGroups = [
    { key: 'track', label: 'Track', items: disciplines.filter((discipline) => discipline.kind === 'track') },
    { key: 'field', label: 'Field', items: disciplines.filter((discipline) => discipline.kind === 'field' || discipline.kind === 'vertical') },
    { key: 'relay', label: 'Relays', items: disciplines.filter((discipline) => discipline.kind === 'relay') },
  ].filter((group) => group.items.length > 0);

  return (
    <form className={styles.formFields} onSubmit={submit} noValidate>
      {submitError && <p className={styles.formError} role="alert">{submitError}</p>}
      <label htmlFor="athlete-name">Athlete name</label>
      <Input ref={nameRef} id="athlete-name" value={draft.name} onChange={(event) => setField('name', event.target.value)} invalid={Boolean(errors.name)} aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? 'athlete-name-error' : undefined} required aria-required="true" disabled={submitting} />
      {errors.name && <span id="athlete-name-error" className={styles.fieldError}>{errors.name}</span>}

      <div className={styles.formRow}>
        <div>
          <label htmlFor="athlete-gender">Gender category <span>Optional</span></label>
          <Select id="athlete-gender" compact aria-label="Gender category" placeholder="Select gender" value={draft.gender} onChange={(event) => setField('gender', event.target.value)} aria-invalid={Boolean(errors.gender)} aria-describedby={errors.gender ? 'athlete-gender-error' : undefined} disabled={submitting} options={[{ value: 'Male', label: 'Male' }, { value: 'Female', label: 'Female' }]} />
          {errors.gender && <span id="athlete-gender-error" className={styles.fieldError}>{errors.gender}</span>}
        </div>
        <div>
          <label htmlFor="athlete-dob">Date of birth <span>Optional</span></label>
          <DatePicker id="athlete-dob" value={draft.dob} onChange={(value) => setField('dob', value)} invalid={Boolean(errors.dob)} aria-describedby={errors.dob ? 'athlete-dob-error' : undefined} aria-label="Date of birth" disabled={submitting} />
          {errors.dob && <span id="athlete-dob-error" className={styles.fieldError}>{errors.dob}</span>}
        </div>
      </div>

       <fieldset className={styles.disciplinePanel} disabled={submitting} aria-describedby={errors.preferredDisciplineIds ? 'athlete-disciplines-error' : 'athlete-disciplines-help'}>
         <legend>Disciplines <span>Choose one or more</span></legend>
         <div className={styles.disciplineHeader}>
           <p id="athlete-disciplines-help">Select every discipline this athlete trains or competes in.</p>
           <span className={styles.selectionCount}>{draft.preferredDisciplineIds.length} selected</span>
         </div>
         {disciplinesLoading ? <p className={styles.catalogueStatus} role="status">Loading disciplines...</p> : null}
         {disciplinesError ? <div className={styles.catalogueError} role="alert"><span>Disciplines could not be loaded.</span><button type="button" onClick={() => void loadDisciplines()}>Try again</button></div> : null}
         {!disciplinesLoading && !disciplinesError && disciplineGroups.map((group) => (
           <section className={styles.disciplineGroup} key={group.key} aria-labelledby={`discipline-group-${group.key}`}>
             <h3 id={`discipline-group-${group.key}`}>{group.label}</h3>
             <div className={styles.disciplineGrid}>
               {group.items.map((discipline) => {
                 const checked = draft.preferredDisciplineIds.includes(discipline.id);
                 return <label className={`${styles.disciplineChoice} ${checked ? styles.disciplineChoiceSelected : ''}`} key={discipline.id}>
                   <input type="checkbox" checked={checked} onChange={(event) => setField('preferredDisciplineIds', event.target.checked ? [...draft.preferredDisciplineIds, discipline.id] : draft.preferredDisciplineIds.filter((id) => id !== discipline.id))} />
                   <span><strong>{discipline.presentation.label}</strong><small>{discipline.kind === 'relay' ? 'Team relay' : discipline.unit === 'seconds' ? 'Timed event' : 'Measured event'}</small></span>
                 </label>;
               })}
             </div>
           </section>
         ))}
       </fieldset>
       {errors.preferredDisciplineIds && <span id="athlete-disciplines-error" className={styles.fieldError}>{errors.preferredDisciplineIds}</span>}

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
