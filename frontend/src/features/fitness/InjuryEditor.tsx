import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components';
import {
  INJURY_REGIONS,
  SEVERITY_LABELS,
  type InjuryArea,
  type InjuryDraft,
  type InjuryRegion,
  type InjurySeverity,
  type InjurySide,
} from './injuryRegions';
import styles from './FitnessView.module.css';

interface InjuryEditorProps {
  onPreview: (injury: InjuryDraft | null) => void;
  onSave: (injury: InjuryDraft) => void;
}

interface DraftValues {
  region: InjuryRegion | '';
  area: InjuryArea | '';
  side: InjurySide | '';
  severity: InjurySeverity | '';
  notes: string;
}

interface InjurySelectProps {
  label: string;
  placeholder: string;
  value: string;
  options: { value: string; label: string; severity?: InjurySeverity }[];
  onChange: (value: string) => void;
}

const sideOptions = [{ value: 'Left', label: 'Left' }, { value: 'Right', label: 'Right' }, { value: 'Both', label: 'Both' }];
const severityOptions = (Object.keys(SEVERITY_LABELS) as InjurySeverity[]).map((value) => ({ value, label: SEVERITY_LABELS[value], severity: value }));

function usesCenterSide(region: InjuryRegion | '') {
  return region === 'Head & Neck' || region === 'Torso';
}

function InjurySelect({ label, placeholder, value, options, onChange }: InjurySelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = `${label.toLowerCase().replace(/[^a-z]+/g, '-')}-options`;
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, []);

  return <div className={`${styles.dropdown} ${open ? styles.dropdownOpen : ''}`} ref={rootRef}>
    <span className={styles.fieldLabel}>{label}</span>
    <button
      type="button"
      className={styles.dropdownTrigger}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={listboxId}
      aria-label={label}
      onClick={() => setOpen((current) => !current)}
      onKeyDown={(event) => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); } if (event.key === 'Escape') setOpen(false); }}
    >
      <span>{selected?.label ?? placeholder}</span><i aria-hidden="true" />
    </button>
    {open && <ul className={styles.dropdownMenu} id={listboxId} role="listbox" aria-label={label}>
      {options.map((option) => <li key={option.value}>
        <button type="button" role="option" aria-selected={option.value === value} onClick={() => { onChange(option.value); setOpen(false); }}>
          {option.severity && <i className={styles.severityDot} data-severity={option.severity.toLowerCase()} aria-hidden="true" />}{option.label}
        </button>
      </li>)}
    </ul>}
  </div>;
}

export function InjuryEditor({ onPreview, onSave }: InjuryEditorProps) {
  const [region, setRegion] = useState<InjuryRegion | ''>('');
  const [area, setArea] = useState<InjuryArea | ''>('');
  const [side, setSide] = useState<InjurySide | ''>('');
  const [severity, setSeverity] = useState<InjurySeverity | ''>('');
  const [notes, setNotes] = useState('');
  const draft = region && area && side && severity ? { region, area, side, severity, notes: notes.trim() } : null;

  const updatePreview = (next: Partial<DraftValues>) => {
    const candidate = { region, area, side, severity, notes, ...next };
    if (!candidate.region || !candidate.area || !candidate.side || !candidate.severity) {
      onPreview(null);
      return;
    }
    onPreview({ region: candidate.region, area: candidate.area, side: candidate.side, severity: candidate.severity, notes: candidate.notes.trim() });
  };

  const save = () => {
    if (!draft) return;
    onSave(draft);
    setRegion('');
    setArea('');
    setSide('');
    setSeverity('');
    setNotes('');
    onPreview(null);
  };

  return <section className={styles.editorCard} aria-labelledby="injury-editor-heading">
    <p className={styles.eyebrow}>Injury editor</p>
    <h2 id="injury-editor-heading">Map an injury</h2>
    <p className={styles.editorLead}>Select an anatomical area and severity. The surface heat map previews immediately before you save.</p>
    <InjurySelect label="1. Body region" placeholder="Select a region..." value={region} options={Object.keys(INJURY_REGIONS).map((value) => ({ value, label: value }))} onChange={(value) => { const next = value as InjuryRegion; setRegion(next); setArea(''); setSide(''); setSeverity(''); updatePreview({ region: next, area: '', side: '', severity: '' }); }} />
    {region && <InjurySelect label="2. Specific area" placeholder="Select an area..." value={area} options={INJURY_REGIONS[region].map((value) => ({ value, label: value }))} onChange={(value) => { const next = value as InjuryArea; const nextSide = usesCenterSide(region) ? 'Center' : ''; setArea(next); setSide(nextSide); setSeverity(''); updatePreview({ area: next, side: nextSide, severity: '' }); }} />}
    {area && !usesCenterSide(region) && <InjurySelect label="3. Side" placeholder="Select a side..." value={side} options={sideOptions} onChange={(value) => { const next = value as InjurySide; setSide(next); setSeverity(''); updatePreview({ side: next, severity: '' }); }} />}
    {side && <InjurySelect label="4. Severity" placeholder="Select severity..." value={severity} options={severityOptions} onChange={(value) => { const next = value as InjurySeverity; setSeverity(next); updatePreview({ severity: next }); }} />}
    {severity && <label className={styles.field}>
      <span>5. Coach notes <em>Optional</em></span>
      <textarea value={notes} onChange={(event) => { setNotes(event.target.value); updatePreview({ notes: event.target.value }); }} placeholder="Injury details, athlete feedback, training limits, physio guidance, recovery progress..." />
    </label>}
    <Button className={styles.saveButton} onClick={save} disabled={!draft}>Save injury</Button>
    <p className={styles.sessionNote}>Records remain available while this athlete Performance page is open.</p>
  </section>;
}
