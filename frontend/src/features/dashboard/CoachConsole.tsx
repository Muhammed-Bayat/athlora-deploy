import { useEffect, useState } from 'react';
import { AthletesPage } from '../athletes/AthletesPage';
import { EventsPage } from '../events/EventsPage';
import {
  FIXTURE_TODAY,
  STATUSES,
  fixtureAthletes,
  fixtureEvents,
  initials,
  readiness,
  type Athlete,
  type ConsoleEvent,
  type ConsoleView,
  type WeatherPreset,
} from './consoleData';
import styles from './CoachConsole.module.css';
import dashboard from './DashboardPage.module.css';

type IconName = 'home' | 'athletes' | 'calendar' | 'trend' | 'activity';

const NAV: ReadonlyArray<{ id: ConsoleView; label: string; shortLabel: string; icon: IconName }> = [
  { id: 'dashboard', label: 'Dashboard', shortLabel: 'Home', icon: 'home' },
  { id: 'athletes', label: 'Athletes', shortLabel: 'Athletes', icon: 'athletes' },
  { id: 'events', label: 'Events', shortLabel: 'Events', icon: 'calendar' },
];
const WEATHER_PRESETS: ReadonlyArray<{ id: WeatherPreset; label: string; temperature: number }> = [
  { id: 'clear', label: 'Sunny', temperature: 27 }, { id: 'partly', label: 'Partly cloudy', temperature: 24 },
  { id: 'cloudy', label: 'Cloudy', temperature: 20 }, { id: 'fog', label: 'Fog', temperature: 16 },
  { id: 'rain', label: 'Rain', temperature: 15 }, { id: 'snow', label: 'Snow', temperature: -2 },
  { id: 'storm', label: 'Storm', temperature: 18 }, { id: 'night', label: 'Night', temperature: 12 },
  { id: 'night-rain', label: 'Night rain', temperature: 11 },
];
const PAGE_COPY: Record<ConsoleView, { title: string; subtitle: string }> = {
  dashboard: { title: 'Dashboard', subtitle: 'A live snapshot of your squad' },
  athletes: { title: 'Athletes', subtitle: 'Manage rosters, PBs and training status' },
  events: { title: 'Events', subtitle: 'Meets, trials and camps at a glance' },
};

function ConsoleIcon({ name }: { name: IconName }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}>
    {name === 'home' && <><path d="M3 11.5 12 4l9 7.5" /><path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" /></>}
    {name === 'athletes' && <><circle cx="9" cy="7" r="3.2" /><path d="M3.5 20c0-3.5 2.5-6 5.5-6s5.5 2.5 5.5 6" /><circle cx="17.5" cy="8" r="2.4" /><path d="M15.3 13.2c2.3.3 4.2 2.4 4.2 5.3" /></>}
    {name === 'calendar' && <><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 9.5h17M8 3v4M16 3v4" /></>}
    {name === 'trend' && <><path d="m3 17 6-6 4 4 8-8" /><path d="M15 7h6v6" /></>}
    {name === 'activity' && <path d="M22 12h-4l-3 9L9 3l-3 9H2" />}
  </svg>;
}

function LiveTime({ compact = false }: { compact?: boolean }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 1000); return () => window.clearInterval(timer); }, []);
  return compact ? <>{now.toLocaleTimeString('en-GB')}</> : <><time>{now.toLocaleTimeString('en-GB')}</time><span>{now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span></>;
}

interface DashboardViewProps {
  athletes: Athlete[];
  events: ConsoleEvent[];
  navigate: (view: ConsoleView) => void;
}

function DashboardView({ athletes, events, navigate }: DashboardViewProps) {
  const upcoming = [...events].filter((event) => event.date >= FIXTURE_TODAY).sort((a, b) => a.date.localeCompare(b.date));
  const active = athletes.filter((athlete) => athlete.status === 'Active' || athlete.status === 'Peaking').length;
  const upcoming14 = upcoming.filter((event) => (new Date(`${event.date}T00:00:00`).getTime() - new Date(`${FIXTURE_TODAY}T00:00:00`).getTime()) / 86400000 <= 14);
  const pbs = athletes.filter((athlete) => athlete.status === 'Peaking').length + 4;
  const score = readiness(athletes);
  const metrics = [
    { icon: 'athletes' as const, value: athletes.length, label: 'Athletes', delta: '+2 this month', context: `${active} active or peaking`, progress: score },
    { icon: 'calendar' as const, value: upcoming14.length, label: 'Next 14 days', delta: `${upcoming14.length} scheduled`, context: upcoming[0] ? `Next: ${upcoming[0].name}` : 'Calendar clear', progress: Math.min(100, upcoming14.length * 18) },
    { icon: 'trend' as const, value: pbs, label: 'Season PBs', delta: '+1 this week', context: 'Performance momentum', progress: Math.min(100, 55 + pbs * 4) },
    { icon: 'activity' as const, value: 9, label: 'Sessions this week', delta: 'on plan', context: 'Weekly load tracking', progress: 82 },
  ];
  const trend = [3, 4, 2, 5, 4, 6, pbs];

  return <section aria-label="Dashboard overview">
    <div className={dashboard.hero}>
      <div className={dashboard.heroCopy}><p className={dashboard.kicker}><i />Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, Coach</p><h2>Performance.<br /><span>In motion.</span></h2><p><b>{active} athletes</b> are active or peaking, with <b>{upcoming14.length} events</b> in the next 14 days and <b>{pbs} season PBs</b> on the board.</p><div className={dashboard.heroMeta}><span><small>Local time</small><b><LiveTime compact /></b></span><span><small>Squad readiness</small><b>{score}<i>%</i></b></span></div></div>
      <div className={dashboard.orbit} aria-hidden="true"><i /><i /><i /><span /><span /><span /><p><b>{active}</b> athletes active on today's plan</p></div>
    </div>
    <div className={dashboard.metrics}>{metrics.map((metric, index) => <article className={index === 0 ? dashboard.featured : ''} key={metric.label}><header><span><ConsoleIcon name={metric.icon} /></span><small>{metric.delta}</small></header><strong>{metric.value}</strong><h3>{metric.label}</h3><footer><i><i style={{ width: `${metric.progress}%` }} /></i><span>{metric.context}</span></footer></article>)}</div>
    <div className={dashboard.snapshots}>
      <section className={dashboard.panel}><header><div><p>Roster intelligence</p><h2>Roster Snapshot</h2></div><button type="button" onClick={() => navigate('athletes')}>View all ›</button></header>{[...athletes].sort((a, b) => Number(b.status === 'Peaking') - Number(a.status === 'Peaking')).slice(0, 5).map((athlete) => <button type="button" className={dashboard.rosterRow} onClick={() => navigate('athletes')} key={athlete.id}><span className={dashboard.avatar}>{initials(athlete.name)}</span><span><b>{athlete.name}</b><small>{athlete.discipline} · {athlete.squad}</small></span><i className={dashboard[`status${athlete.status}`]} title={athlete.status} /><strong>{athlete.pb}</strong></button>)}</section>
      <section className={dashboard.panel}><header><div><p>Competition calendar</p><h2>Upcoming Events</h2></div><button type="button" onClick={() => navigate('events')}>View all ›</button></header>{upcoming.slice(0, 4).map((event) => { const date = new Date(`${event.date}T00:00:00`); return <button type="button" className={dashboard.eventRow} onClick={() => navigate('events')} key={event.id}><span><b>{date.getDate()}</b><small>{date.toLocaleDateString('en-US', { month: 'short' })}</small></span><span><b>{event.name}</b><small>⌖ {event.location}</small></span></button>; })}</section>
    </div>
    <section className={dashboard.performance}><header><div><p>Performance signal</p><h2>Squad PB Trend</h2></div><span>Last 7 weeks</span></header><div className={dashboard.trendLayout}><div className={dashboard.bars}>{trend.map((value, index) => <span key={index}><i style={{ height: `${value / Math.max(...trend) * 100}%` }} /><small>{index === 6 ? 'Now' : `W${index + 1}`}</small></span>)}</div><aside><small>Current momentum</small><b>+{trend.at(-1)! - trend.at(-2)!}</b><p>PB movement versus last week. The squad is carrying positive performance momentum into the next competition block.</p></aside></div></section>
  </section>;
}

export function CoachConsole() {
  const [view, setView] = useState<ConsoleView>('dashboard');
  const [athletes, setAthletes] = useState(() => fixtureAthletes.map((athlete) => ({ ...athlete, history: [...athlete.history] })));
  const [events, setEvents] = useState(() => fixtureEvents.map((event) => ({ ...event, athleteIds: [...event.athleteIds] })));
  const [weatherEnabled, setWeatherEnabled] = useState(() => { try { return localStorage.getItem('athlora-weather-effects') !== 'off'; } catch { return true; } });
  const [weather, setWeather] = useState<WeatherPreset>('partly');
  const weatherMeta = WEATHER_PRESETS.find((preset) => preset.id === weather)!;
  const navigate = (next: ConsoleView) => { setView(next); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const toggleWeather = () => setWeatherEnabled((enabled) => { const next = !enabled; try { localStorage.setItem('athlora-weather-effects', next ? 'on' : 'off'); } catch { /* Preference persistence is optional. */ } return next; });
  const counts = Object.fromEntries(STATUSES.map((status) => [status, athletes.filter((athlete) => athlete.status === status).length]));

  return <div className={styles.console} data-weather={weather} data-weather-enabled={weatherEnabled}>
    <div className={styles.weatherScene} aria-hidden="true">{(weather.includes('rain') || weather === 'storm') && Array.from({ length: 36 }, (_, index) => <i className={styles.rain} style={{ left: `${(index * 17) % 101}%`, animationDelay: `${-(index % 13) / 3}s` }} key={index} />)}{weather === 'snow' && Array.from({ length: 30 }, (_, index) => <i className={styles.snow} style={{ left: `${(index * 23) % 101}%`, animationDelay: `${-(index % 11) / 2}s` }} key={index} />)}{weather === 'storm' && <i className={styles.lightning} />}</div>
    <aside className={styles.sidebar}>
      <div className={styles.brand}><img src="/logo-removebg.png" alt="" /><span><b>Athlora</b><small>Athletics Coaching</small></span></div>
      <nav aria-label="Coach console"><ul>{NAV.map((item) => <li key={item.id}><button type="button" aria-current={view === item.id ? 'page' : undefined} onClick={() => navigate(item.id)}><i><ConsoleIcon name={item.icon} /></i><span>{item.label}</span>{item.id !== 'dashboard' && <small>{item.id === 'athletes' ? athletes.length : events.filter((event) => event.date >= FIXTURE_TODAY).length}</small>}</button></li>)}</ul></nav>
      <section className={styles.readiness}><header><span>Squad Readiness</span><b>{readiness(athletes)}%</b></header><div><i style={{ width: `${readiness(athletes)}%` }} /></div>{STATUSES.map((status) => <p key={status}><i className={styles[`status${status}`]} />{status}<b>{counts[status]}</b></p>)}</section>
      <footer><span>C</span><div><b>Coach Console</b><small>Head Coach access</small></div></footer>
    </aside>
    <div className={styles.main}>
      <header className={styles.topbar}>
        <div className={styles.title}><h1>{PAGE_COPY[view].title}</h1><p>{PAGE_COPY[view].subtitle}</p></div>
        <div className={styles.weatherOrigin} aria-hidden="true"><i className={styles.sun} /><i className={styles.moon} /><i className={styles.cloudOne} /><i className={styles.cloudTwo} /></div>
        <div className={styles.topControls}>
          <button type="button" className={styles.weatherToggle} aria-pressed={weatherEnabled} onClick={toggleWeather}><span>Weather FX</span><i><i /></i></button>
          <details className={styles.weatherMenu}><summary aria-label="Preview weather presets">•••</summary><div><header><b>Weather preview</b><small>Visual presets</small></header>{WEATHER_PRESETS.map((preset) => <button type="button" aria-pressed={weather === preset.id} onClick={(event) => { setWeather(preset.id); (event.currentTarget.closest('details') as HTMLDetailsElement | null)?.removeAttribute('open'); }} key={preset.id}>{preset.label}</button>)}<p>Fixture presets change atmosphere only. No weather service is contacted.</p></div></details>
          <div className={styles.weatherReadout}><i /><span>{weatherMeta.label} · {weatherMeta.temperature}°</span></div>
          <div className={styles.clock}><LiveTime /></div>
        </div>
      </header>
      <main className={styles.content}>{view === 'dashboard' && <DashboardView athletes={athletes} events={events} navigate={navigate} />}{view === 'athletes' && <AthletesPage athletes={athletes} events={events} onChange={setAthletes} onRemoveFromEvents={(athleteId) => setEvents((current) => current.map((event) => ({ ...event, athleteIds: event.athleteIds.filter((id) => id !== athleteId) })))} />}{view === 'events' && <EventsPage events={events} athletes={athletes} onChange={setEvents} />}</main>
    </div>
    <nav className={styles.mobileNav} aria-label="Mobile coach console">{NAV.map((item) => <button type="button" aria-current={view === item.id ? 'page' : undefined} onClick={() => navigate(item.id)} key={item.id}><i><ConsoleIcon name={item.icon} /></i>{item.shortLabel}</button>)}</nav>
  </div>;
}
