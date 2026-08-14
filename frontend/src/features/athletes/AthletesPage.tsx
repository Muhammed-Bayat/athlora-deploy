import { useState, type FormEvent } from 'react';
import { ConsoleDialog } from '../dashboard/ConsoleDialog';
import {
  DISCIPLINES,
  SQUADS,
  STATUSES,
  fixtureAthletes,
  fixtureEvents,
  formatDate,
  initials,
  type Athlete,
  type AthleteStatus,
  type ConsoleEvent,
  type Squad,
} from '../dashboard/consoleData';
import styles from './AthletesPage.module.css';

export interface AthletesPageProps {
  athletes?: Athlete[];
  events?: ConsoleEvent[];
  onChange?: (athletes: Athlete[]) => void;
  onRemoveFromEvents?: (athleteId: number) => void;
}

type FormModel = Omit<Athlete, 'id' | 'history'>;
const newForm = (athletes: Athlete[]): FormModel => ({
  name: '', bib: Math.max(0, ...athletes.map((athlete) => athlete.bib)) + 1,
  discipline: '100m', squad: 'Sprint', status: 'Active', pb: '', notes: '',
});

function Sparkline({ values }: { values: number[] }) {
  const min = Math.min(...values);
  const range = Math.max(1, Math.max(...values) - min);
  const points = values.map((value, index) => `${index * 46.6},${52 - ((value - min) / range) * 44}`).join(' ');
  return <svg className={styles.sparkline} viewBox="0 0 280 56" role="img" aria-label="Seven trial performance trend"><polyline points={points} /></svg>;
}

export function AthletesPage({ athletes: controlled, events = fixtureEvents, onChange, onRemoveFromEvents }: AthletesPageProps = {}) {
  const [localAthletes, setLocalAthletes] = useState(() => fixtureAthletes.map((athlete) => ({ ...athlete, history: [...athlete.history] })));
  const athletes = controlled ?? localAthletes;
  const update = (next: Athlete[]) => onChange ? onChange(next) : setLocalAthletes(next);
  const [query, setQuery] = useState('');
  const [squad, setSquad] = useState<'all' | Squad>('all');
  const [status, setStatus] = useState<'all' | AthleteStatus>('all');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editing, setEditing] = useState<Athlete | 'new' | null>(null);
  const [form, setForm] = useState<FormModel>(() => newForm(athletes));

  const selected = athletes.find((athlete) => athlete.id === selectedId);
  const filtered = athletes.filter((athlete) => {
    const term = query.trim().toLowerCase();
    return (!term || `${athlete.name} ${athlete.discipline}`.toLowerCase().includes(term))
      && (squad === 'all' || athlete.squad === squad)
      && (status === 'all' || athlete.status === status);
  });

  const beginAdd = () => { setForm(newForm(athletes)); setEditing('new'); };
  const beginEdit = (athlete: Athlete) => {
    setForm({ name: athlete.name, bib: athlete.bib, discipline: athlete.discipline, squad: athlete.squad, status: athlete.status, pb: athlete.pb, notes: athlete.notes });
    setSelectedId(null);
    setEditing(athlete);
  };
  const setField = <K extends keyof FormModel>(field: K, value: FormModel[K]) => setForm((current) => ({ ...current, [field]: value }));
  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) return;
    if (editing === 'new') {
      const id = Math.max(199, ...athletes.map((athlete) => athlete.id)) + 1;
      update([...athletes, { ...form, name: form.name.trim(), pb: form.pb.trim() || '-', notes: form.notes.trim() || 'No notes yet.', id, history: [60, 62, 63, 65, 64, 66, 68] }]);
    } else if (editing) {
      update(athletes.map((athlete) => athlete.id === editing.id ? { ...athlete, ...form, name: form.name.trim(), pb: form.pb.trim() || '-' } : athlete));
    }
    setEditing(null);
  };
  const remove = (athlete: Athlete) => {
    update(athletes.filter((item) => item.id !== athlete.id));
    onRemoveFromEvents?.(athlete.id);
    setSelectedId(null);
  };

  return (
    <section aria-labelledby="athletes-heading">
      <header className={styles.viewHeader}>
        <div><p className={styles.eyebrow}>Performance profiles</p><h1 id="athletes-heading">Athletes</h1><p>{filtered.length} of {athletes.length} athletes shown</p></div>
        <div className={styles.controls}>
          <label className={styles.search}><span aria-hidden="true">⌕</span><span className={styles.srOnly}>Search athletes</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search athletes..." /></label>
          <label className={styles.srOnly} htmlFor="squad-filter">Filter by squad</label>
          <select id="squad-filter" value={squad} onChange={(event) => setSquad(event.target.value as 'all' | Squad)}><option value="all">All squads</option>{SQUADS.map((item) => <option key={item}>{item}</option>)}</select>
          <label className={styles.srOnly} htmlFor="status-filter">Filter by status</label>
          <select id="status-filter" value={status} onChange={(event) => setStatus(event.target.value as 'all' | AthleteStatus)}><option value="all">All statuses</option>{STATUSES.map((item) => <option key={item}>{item}</option>)}</select>
          <button type="button" className={styles.primaryButton} onClick={beginAdd}><span aria-hidden="true">＋</span> Add athlete</button>
        </div>
      </header>

      <div className={styles.grid}>
        {filtered.map((athlete) => {
          const formScore = athlete.status === 'Peaking' ? 94 : athlete.status === 'Active' ? 86 : athlete.status === 'Resting' ? 68 : 42;
          return <button type="button" className={styles.card} key={athlete.id} onClick={() => setSelectedId(athlete.id)}>
            <span className={styles.cardTop}><span className={`${styles.avatar} ${styles[`squad${athlete.squad.replace(/\s/g, '')}`]}`}>{initials(athlete.name)}</span><span className={styles.bib}>NO. {String(athlete.bib).padStart(3, '0')}</span></span>
            <strong>{athlete.name}</strong><span className={styles.discipline}>{athlete.discipline} · {athlete.squad}</span>
            <span className={styles.meta}><span className={`${styles.status} ${styles[`status${athlete.status}`]}`}><i />{athlete.status}</span><span>Performance profile</span></span>
            <span className={styles.pb}><span><b>{athlete.pb}</b><small>Personal best</small></span><small>{athlete.squad}</small></span>
            <span className={styles.form}><span>Recent form <b>{formScore}%</b></span><i><i style={{ width: `${formScore}%` }} /></i></span>
          </button>;
        })}
        {!filtered.length && <div className={styles.empty}><span aria-hidden="true">⌕</span><h2>No athletes match your filters</h2><p>Try a different search term or clear your filters.</p><button type="button" onClick={() => { setQuery(''); setSquad('all'); setStatus('all'); }}>Clear filters</button></div>}
      </div>

      {selected && <ConsoleDialog title="Athlete Profile" onClose={() => setSelectedId(null)} footer={<><button type="button" className={styles.dangerButton} onClick={() => remove(selected)}>Delete athlete</button><button type="button" className={styles.secondaryButton} onClick={() => setSelectedId(null)}>Close</button><button type="button" className={styles.primaryButton} onClick={() => beginEdit(selected)}>Edit profile</button></>}>
        <div className={styles.profileHead}><span className={styles.avatar}>{initials(selected.name)}</span><div><h3>{selected.name}</h3><p>{selected.discipline} · Bib NO. {String(selected.bib).padStart(3, '0')}</p><span className={`${styles.status} ${styles[`status${selected.status}`]}`}><i />{selected.status}</span></div></div>
        <div className={styles.profileStats}><div><b>{selected.pb}</b><span>Personal best</span></div><div><b>{selected.squad}</b><span>Squad</span></div><div><b>{events.filter((item) => item.athleteIds.includes(selected.id) && item.date >= '2026-08-14').length}</b><span>Upcoming events</span></div></div>
        <h4 className={styles.sectionTitle}>Recent trial trend</h4><Sparkline values={selected.history} />
        <p className={selected.history.at(-1)! >= selected.history[0]! ? styles.positive : styles.negative}>{selected.history.at(-1)! >= selected.history[0]! ? '▲' : '▼'} {Math.abs(selected.history.at(-1)! - selected.history[0]!)}pt movement over 7 trials</p>
        <h4 className={styles.sectionTitle}>Upcoming events</h4><div className={styles.chips}>{events.filter((item) => item.athleteIds.includes(selected.id) && item.date >= '2026-08-14').map((item) => <span key={item.id}>{item.name} · {formatDate(item.date)}</span>)}</div>
        <h4 className={styles.sectionTitle}>Coach notes</h4><p className={styles.notes}>{selected.notes}</p>
      </ConsoleDialog>}

      {editing && <ConsoleDialog title={editing === 'new' ? 'Add Athlete' : 'Edit Athlete'} onClose={() => setEditing(null)} footer={<><button type="button" className={styles.secondaryButton} onClick={() => setEditing(null)}>Cancel</button><button type="submit" form="athlete-form" className={styles.primaryButton}>{editing === 'new' ? 'Add athlete' : 'Save changes'}</button></>}>
        <form id="athlete-form" className={styles.formFields} onSubmit={save}>
          <label>Athlete name<input required value={form.name} onChange={(event) => setField('name', event.target.value)} placeholder="e.g. Jordan Lee" /></label>
          <div><label>Discipline<select value={form.discipline} onChange={(event) => { const discipline = DISCIPLINES.find((item) => item.name === event.target.value)!; setField('discipline', discipline.name); setField('squad', discipline.squad); }}>{DISCIPLINES.map((item) => <option key={item.name}>{item.name}</option>)}</select></label><label>Squad<select value={form.squad} onChange={(event) => setField('squad', event.target.value as Squad)}>{SQUADS.map((item) => <option key={item}>{item}</option>)}</select></label></div>
          <div><label>Bib number<input required min="0" type="number" value={form.bib} onChange={(event) => setField('bib', Number(event.target.value))} /></label><label>Status<select value={form.status} onChange={(event) => setField('status', event.target.value as AthleteStatus)}>{STATUSES.map((item) => <option key={item}>{item}</option>)}</select></label></div>
          <label>Personal best<input value={form.pb} onChange={(event) => setField('pb', event.target.value)} placeholder={DISCIPLINES.find((item) => item.name === form.discipline)?.placeholder} /></label>
          <label>Coach notes<textarea value={form.notes} onChange={(event) => setField('notes', event.target.value)} placeholder="Training focus, injury history, goals..." /></label>
        </form>
      </ConsoleDialog>}
    </section>
  );
}
