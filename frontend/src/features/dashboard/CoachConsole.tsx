import { useEffect, useState } from 'react';
import { AthletesPage } from '../athletes/AthletesPage';
import { EventsPage } from '../events/EventsPage';
import { LiveLoggingPage } from '../timeline/LiveLoggingPage';
import { AuthPage } from '../auth/AuthPage';
import type { DashboardSummary } from '../../types';
import { DashboardPage } from './DashboardPage';
import type { ConsoleView, WeatherPreset } from './consoleData';
import styles from './CoachConsole.module.css';

type IconName = 'home' | 'athletes' | 'calendar' | 'activity';

interface ConsoleDestination {
  view: ConsoleView;
  targetId?: string;
}

const NAV: ReadonlyArray<{ id: ConsoleView; label: string; shortLabel: string; icon: IconName }> = [
  { id: 'dashboard', label: 'Dashboard', shortLabel: 'Home', icon: 'home' },
  { id: 'athletes', label: 'Athletes', shortLabel: 'Athletes', icon: 'athletes' },
  { id: 'events', label: 'Events', shortLabel: 'Events', icon: 'calendar' },
  { id: 'live', label: 'Live Logger', shortLabel: 'Live', icon: 'activity' },
  { id: 'account', label: 'Account', shortLabel: 'Account', icon: 'athletes' },
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
  athletes: { title: 'Athletes', subtitle: 'Manage your active and archived roster' },
  events: { title: 'Events', subtitle: 'Manage 100m competitions and training sessions' },
  live: { title: 'Live Race Logger', subtitle: 'Track-side race logging, incident control, and instant results' },
  account: { title: 'Account', subtitle: 'Manage security, sign-out, and account deletion' },
};

function ConsoleIcon({ name }: { name: IconName }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}>
    {name === 'home' && <><path d="M3 11.5 12 4l9 7.5" /><path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" /></>}
    {name === 'athletes' && <><circle cx="9" cy="7" r="3.2" /><path d="M3.5 20c0-3.5 2.5-6 5.5-6s5.5 2.5 5.5 6" /><circle cx="17.5" cy="8" r="2.4" /><path d="M15.3 13.2c2.3.3 4.2 2.4 4.2 5.3" /></>}
    {name === 'calendar' && <><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 9.5h17M8 3v4M16 3v4" /></>}
    {name === 'activity' && <path d="M22 12h-4l-3 9L9 3l-3 9H2" />}
  </svg>;
}

function LiveTime({ compact = false }: { compact?: boolean }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 1000); return () => window.clearInterval(timer); }, []);
  return compact ? <>{now.toLocaleTimeString('en-GB')}</> : <><time>{now.toLocaleTimeString('en-GB')}</time><span>{now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span></>;
}

export function CoachConsole() {
  const [destination, setDestination] = useState<ConsoleDestination>({ view: 'dashboard' });
  const [rosterCount, setRosterCount] = useState<number | null>(null);
  const [eventUpcomingCount, setEventUpcomingCount] = useState<number | null>(null);
  const [weatherEnabled, setWeatherEnabled] = useState(() => { try { return localStorage.getItem('athlora-weather-effects') !== 'off'; } catch { return true; } });
  const [weather, setWeather] = useState<WeatherPreset>('partly');
  const weatherMeta = WEATHER_PRESETS.find((preset) => preset.id === weather)!;
  const navigate = (view: ConsoleView, targetId?: string) => { setDestination({ view, targetId }); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const updateDashboardCounts = (summary: DashboardSummary) => {
    setRosterCount(summary.activeAthletesCount);
    setEventUpcomingCount(summary.upcomingEventCount);
  };
  const toggleWeather = () => setWeatherEnabled((enabled) => { const next = !enabled; try { localStorage.setItem('athlora-weather-effects', next ? 'on' : 'off'); } catch { /* Preference persistence is optional. */ } return next; });

  return <div className={styles.console} data-weather={weatherEnabled ? weather : undefined} data-weather-enabled={weatherEnabled}>
    <div className={styles.weatherScene} aria-hidden="true">{(weather.includes('rain') || weather === 'storm') && Array.from({ length: 36 }, (_, index) => <i className={styles.rain} style={{ left: `${(index * 17) % 101}%`, animationDelay: `${-(index % 13) / 3}s` }} key={index} />)}{weather === 'snow' && Array.from({ length: 30 }, (_, index) => <i className={styles.snow} style={{ left: `${(index * 23) % 101}%`, animationDelay: `${-(index % 11) / 2}s` }} key={index} />)}{weather === 'storm' && <i className={styles.lightning} />}</div>
    <aside className={styles.sidebar}>
      <div className={styles.brand}><img src="/logo-removebg.png" alt="" /><span><b>Athlora</b><small>Athletics Coaching</small></span></div>
      <nav aria-label="Coach console"><ul>{NAV.map((item) => <li key={item.id}><button type="button" aria-current={destination.view === item.id ? 'page' : undefined} onClick={() => navigate(item.id)}><i><ConsoleIcon name={item.icon} /></i><span>{item.label}</span>{item.id === 'athletes' && <small>{rosterCount ?? '—'}</small>}{item.id === 'events' && <small>{eventUpcomingCount ?? '—'}</small>}</button></li>)}</ul></nav>
      <section className={styles.readiness} aria-label="Workspace summary"><header><span>Workspace</span></header><p>Active roster<b>{rosterCount ?? '—'}</b></p><p>Upcoming events<b>{eventUpcomingCount ?? '—'}</b></p></section>
      <footer><span>C</span><div><b>Coach Console</b><small>Head Coach access</small></div></footer>
    </aside>
    <div className={styles.main}>
      <header className={styles.topbar}>
        <div className={styles.title}><h1>{PAGE_COPY[destination.view].title}</h1><p>{PAGE_COPY[destination.view].subtitle}</p></div>
        <div className={styles.weatherOrigin} aria-hidden="true"><i className={styles.sun} /><i className={styles.moon} /><i className={styles.cloudOne} /><i className={styles.cloudTwo} /></div>
        <div className={styles.topControls}>
          <button type="button" className={styles.weatherToggle} aria-pressed={weatherEnabled} onClick={toggleWeather}><span>Weather FX</span><i><i /></i></button>
          <details className={styles.weatherMenu}><summary aria-label="Preview weather presets">•••</summary><div><header><b>Weather preview</b><small>Visual presets</small></header>{WEATHER_PRESETS.map((preset) => <button type="button" aria-pressed={weather === preset.id} onClick={(event) => { setWeatherEnabled(true); setWeather(preset.id); (event.currentTarget.closest('details') as HTMLDetailsElement | null)?.removeAttribute('open'); }} key={preset.id}>{preset.label}</button>)}<p>Preview presets change atmosphere only. No weather service is contacted.</p></div></details>
          <div className={styles.weatherReadout} aria-live="polite"><i /><span>{weatherMeta.label} · {weatherMeta.temperature}°</span></div>
          <div className={styles.clock}><LiveTime /></div>
        </div>
      </header>
      <main className={styles.content}>
        {destination.view === 'dashboard' && <DashboardPage onOpenRoster={() => navigate('athletes')} onOpenAthlete={(id) => navigate('athletes', id)} onOpenEvents={() => navigate('events')} onOpenEvent={(id) => navigate('events', id)} onResumeLogging={(id) => navigate('live', id)} onSummaryLoaded={updateDashboardCounts} />}
        {destination.view === 'athletes' && <AthletesPage key={`athletes:${destination.targetId ?? 'index'}`} initialAthleteId={destination.targetId} onActiveCountChange={setRosterCount} />}
        {destination.view === 'events' && <EventsPage key={`events:${destination.targetId ?? 'index'}`} initialEventId={destination.targetId} onUpcomingCountChange={setEventUpcomingCount} />}
        {destination.view === 'live' && <LiveLoggingPage key={`live:${destination.targetId ?? 'index'}`} initialEventId={destination.targetId} />}
        {destination.view === 'account' && <AuthPage />}
      </main>
    </div>
    <nav className={styles.mobileNav} aria-label="Mobile coach console">{NAV.map((item) => <button type="button" aria-current={destination.view === item.id ? 'page' : undefined} onClick={() => navigate(item.id)} key={item.id}><i><ConsoleIcon name={item.icon} /></i>{item.shortLabel}</button>)}</nav>
  </div>;
}
