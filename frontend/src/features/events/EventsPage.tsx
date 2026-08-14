import { useState, type FormEvent } from 'react';
import { ConsoleDialog } from '../dashboard/ConsoleDialog';
import { EVENT_TYPES, FIXTURE_TODAY, fixtureAthletes, fixtureEvents, formatDate, type Athlete, type ConsoleEvent, type EventType } from '../dashboard/consoleData';
import styles from './EventsPage.module.css';

export interface EventsPageProps {
  events?: ConsoleEvent[];
  athletes?: Athlete[];
  onChange?: (events: ConsoleEvent[]) => void;
}

type EventTab = 'upcoming' | 'past' | 'all';
type EventView = 'list' | 'calendar';
type EventForm = Omit<ConsoleEvent, 'id'>;
const emptyForm = (): EventForm => ({ name: '', type: 'Meet', date: FIXTURE_TODAY, location: '', notes: '', athleteIds: [] });

function dateParts(iso: string) {
  const date = new Date(`${iso}T00:00:00`);
  return { day: date.getDate(), month: date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase() };
}

function isoDate(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function EventsPage({ events: controlled, athletes = fixtureAthletes, onChange }: EventsPageProps = {}) {
  const [localEvents, setLocalEvents] = useState(() => fixtureEvents.map((item) => ({ ...item, athleteIds: [...item.athleteIds] })));
  const events = controlled ?? localEvents;
  const update = (next: ConsoleEvent[]) => onChange ? onChange(next) : setLocalEvents(next);
  const [tab, setTab] = useState<EventTab>('upcoming');
  const [view, setView] = useState<EventView>('list');
  const [month, setMonth] = useState(() => new Date(2026, 7, 1));
  const [selectedDay, setSelectedDay] = useState(FIXTURE_TODAY);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editing, setEditing] = useState<ConsoleEvent | 'new' | null>(null);
  const [form, setForm] = useState<EventForm>(emptyForm);

  const selected = events.find((item) => item.id === selectedId);
  const filtered = [...events].filter((item) => tab === 'all' || (tab === 'upcoming' ? item.date >= FIXTURE_TODAY : item.date < FIXTURE_TODAY)).sort((a, b) => tab === 'past' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date));
  const displayed = view === 'calendar' ? events.filter((item) => item.date === selectedDay) : filtered;
  const setField = <K extends keyof EventForm>(field: K, value: EventForm[K]) => setForm((current) => ({ ...current, [field]: value }));
  const beginEdit = (item: ConsoleEvent) => { setForm({ name: item.name, type: item.type, date: item.date, location: item.location, notes: item.notes, athleteIds: [...item.athleteIds] }); setSelectedId(null); setEditing(item); };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim() || !form.date) return;
    if (editing === 'new') {
      update([...events, { ...form, name: form.name.trim(), location: form.location.trim() || 'TBC', id: Math.max(199, ...events.map((item) => item.id)) + 1 }]);
    } else if (editing) {
      update(events.map((item) => item.id === editing.id ? { ...item, ...form, name: form.name.trim(), location: form.location.trim() || 'TBC' } : item));
    }
    setEditing(null);
  };
  const toggleAssignment = (athleteId: number) => {
    if (!selected) return;
    const athleteIds = selected.athleteIds.includes(athleteId) ? selected.athleteIds.filter((id) => id !== athleteId) : [...selected.athleteIds, athleteId];
    update(events.map((item) => item.id === selected.id ? { ...item, athleteIds } : item));
  };

  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const leading = first.getDay();
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const previousDays = new Date(month.getFullYear(), month.getMonth(), 0).getDate();
  const cells = Array.from({ length: 42 }, (_, index) => {
    const rawDay = index - leading + 1;
    if (rawDay < 1) return { day: previousDays + rawDay, current: false, iso: '' };
    if (rawDay > days) return { day: rawDay - days, current: false, iso: '' };
    return { day: rawDay, current: true, iso: isoDate(month.getFullYear(), month.getMonth(), rawDay) };
  });

  return (
    <section aria-labelledby="events-heading">
      <header className={styles.viewHeader}>
        <div><p className={styles.eyebrow}>Season command</p><h1 id="events-heading">Events</h1><p>{events.filter((item) => item.date >= FIXTURE_TODAY).length} upcoming · {events.filter((item) => item.date < FIXTURE_TODAY).length} completed</p></div>
        <div className={styles.controls}>
          <div className={styles.segmented} aria-label="Filter events">{(['upcoming', 'past', 'all'] as const).map((item) => <button type="button" key={item} aria-pressed={tab === item} onClick={() => setTab(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}</div>
          <div className={styles.viewToggle} aria-label="Event view"><button type="button" aria-label="List view" aria-pressed={view === 'list'} onClick={() => setView('list')}>☷</button><button type="button" aria-label="Calendar view" aria-pressed={view === 'calendar'} onClick={() => setView('calendar')}>□</button></div>
          <button type="button" className={styles.primaryButton} onClick={() => { setForm(emptyForm()); setEditing('new'); }}>＋ Add event</button>
        </div>
      </header>

      {view === 'calendar' && <div className={styles.calendar}>
        <header><h2>{first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h2><div><button type="button" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button><button type="button" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button></div></header>
        <div className={styles.calendarGrid}>{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => <span className={styles.dayName} key={`${day}-${index}`}>{day}</span>)}{cells.map((cell, index) => {
          const dayEvents = cell.iso ? events.filter((item) => item.date === cell.iso) : [];
          return <button type="button" disabled={!cell.current} className={`${styles.day} ${cell.iso === FIXTURE_TODAY ? styles.today : ''}`} aria-pressed={cell.iso === selectedDay} onClick={() => setSelectedDay(cell.iso)} key={`${cell.day}-${index}`}><span>{cell.day}</span><i>{dayEvents.slice(0, 3).map((item) => <i className={styles[`type${item.type.replace(/\s/g, '')}`]} key={item.id} />)}</i></button>;
        })}</div>
      </div>}

      {view === 'calendar' && <h2 className={styles.dayHeading}>Events on {formatDate(selectedDay, true)}</h2>}
      <div className={styles.list}>
        {displayed.map((item) => { const date = dateParts(item.date); return <button type="button" className={styles.eventCard} onClick={() => setSelectedId(item.id)} key={item.id}><span className={styles.dateBlock}><b>{date.day}</b><small>{date.month}</small></span><span className={styles.eventBody}><strong>{item.name}</strong><span><i className={styles[`type${item.type.replace(/\s/g, '')}`]}>{item.type}</i><span>⌖ {item.location}</span><span>♙ {item.athleteIds.length} athletes</span></span></span><span aria-hidden="true">›</span></button>; })}
        {!displayed.length && <div className={styles.empty}><span aria-hidden="true">⌕</span><h2>Nothing scheduled</h2><p>Pick another day, try another tab, or add an event.</p></div>}
      </div>

      {selected && <ConsoleDialog title={selected.name} onClose={() => setSelectedId(null)} footer={<><button type="button" className={styles.dangerButton} onClick={() => { update(events.filter((item) => item.id !== selected.id)); setSelectedId(null); }}>Delete event</button><button type="button" className={styles.secondaryButton} onClick={() => setSelectedId(null)}>Close</button><button type="button" className={styles.primaryButton} onClick={() => beginEdit(selected)}>Edit event</button></>}>
        <div className={styles.detailTags}><span className={styles[`type${selected.type.replace(/\s/g, '')}`]}>{selected.type}</span><span>{selected.date < FIXTURE_TODAY ? 'Completed' : 'Upcoming'}</span></div>
        <div className={styles.detailStats}><div><b>{formatDate(selected.date, true)}</b><small>Date</small></div><div><b>{selected.location}</b><small>Location</small></div></div>
        <h3 className={styles.sectionTitle}>Notes</h3><p className={styles.notes}>{selected.notes || 'No notes added.'}</p>
        <h3 className={styles.sectionTitle}>Assigned athletes ({selected.athleteIds.length})</h3><div className={styles.chips}>{athletes.filter((athlete) => selected.athleteIds.includes(athlete.id)).map((athlete) => <span key={athlete.id}>{athlete.name}</span>)}</div>
        <fieldset className={styles.assignments}><legend className={styles.srOnly}>Change athlete assignments</legend>{athletes.map((athlete) => <label key={athlete.id}><input type="checkbox" checked={selected.athleteIds.includes(athlete.id)} onChange={() => toggleAssignment(athlete.id)} /> <span>{athlete.name}</span><small>NO. {String(athlete.bib).padStart(3, '0')}</small></label>)}</fieldset>
      </ConsoleDialog>}

      {editing && <ConsoleDialog title={editing === 'new' ? 'Add Event' : 'Edit Event'} onClose={() => setEditing(null)} footer={<><button type="button" className={styles.secondaryButton} onClick={() => setEditing(null)}>Cancel</button><button type="submit" form="event-form" className={styles.primaryButton}>{editing === 'new' ? 'Add event' : 'Save changes'}</button></>}>
        <form id="event-form" className={styles.form} onSubmit={submit}>
          <label>Event name<input required value={form.name} onChange={(event) => setField('name', event.target.value)} placeholder="e.g. County Championships" /></label>
          <div><label>Type<select value={form.type} onChange={(event) => setField('type', event.target.value as EventType)}>{EVENT_TYPES.map((item) => <option key={item}>{item}</option>)}</select></label><label>Date<input required type="date" value={form.date} onChange={(event) => setField('date', event.target.value)} /></label></div>
          <label>Location<input value={form.location} onChange={(event) => setField('location', event.target.value)} placeholder="e.g. Central Stadium" /></label>
          <label>Notes<textarea value={form.notes} onChange={(event) => setField('notes', event.target.value)} placeholder="Travel, kit, qualifying standards..." /></label>
          <fieldset className={styles.assignments}><legend>Assign athletes <small>(optional)</small></legend>{athletes.map((athlete) => <label key={athlete.id}><input type="checkbox" checked={form.athleteIds.includes(athlete.id)} onChange={() => setField('athleteIds', form.athleteIds.includes(athlete.id) ? form.athleteIds.filter((id) => id !== athlete.id) : [...form.athleteIds, athlete.id])} /><span>{athlete.name}</span></label>)}</fieldset>
        </form>
      </ConsoleDialog>}
    </section>
  );
}
