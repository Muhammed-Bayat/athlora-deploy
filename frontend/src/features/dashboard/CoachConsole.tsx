import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AthletesPage } from '../athletes/AthletesPage';
import { EventsPage } from '../events/EventsPage';
import { EventDetailPage } from '../events/EventDetailPage';
import { LiveLoggingPage } from '../timeline/LiveLoggingPage';
import { AuthPage } from '../auth/AuthPage';
import { FixturesPage } from '../fixtures/FixturesPage';
import { ComparisonPage } from '../comparison/ComparisonPage';
import { IncomingFixtureInvitations } from '../fixtures/IncomingFixtureInvitations';
import { FixtureNotifications, type FixtureNotificationCounts } from '../fixtures/FixtureNotifications';
import type { DashboardSummary } from '../../types';
import { getCurrentWeather } from '../../api/weather';
import { ApiError } from '../../api/client';
import { weatherLabel, classifyWeather, type WeatherAtmosphere } from '../../utils/weatherConditions';
import { DashboardPage } from './DashboardPage';
import { useWorkspace } from '../auth/WorkspaceContext';
import type { ConsoleView, WeatherPreset } from './consoleData';
import styles from './CoachConsole.module.css';

type IconName = 'home' | 'athletes' | 'calendar' | 'activity';

const NAV: ReadonlyArray<{ id: ConsoleView; label: string; shortLabel: string; icon: IconName }> = [
  { id: 'dashboard', label: 'Dashboard', shortLabel: 'Home', icon: 'home' },
  { id: 'athletes', label: 'Athletes', shortLabel: 'Athletes', icon: 'athletes' },
  { id: 'comparison', label: 'Compare', shortLabel: 'Compare', icon: 'activity' },
  { id: 'events', label: 'Events', shortLabel: 'Events', icon: 'calendar' },
  { id: 'fixtures', label: 'Fixtures', shortLabel: 'Fixtures', icon: 'calendar' },
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
  stats: { title: 'Season Stats', subtitle: 'Teams, athletes, results, and performance trends' },
  athletes: { title: 'Athletes', subtitle: 'Manage your active and archived roster' },
  comparison: { title: 'Compare Athletes', subtitle: 'Compare all-time 100m progression for two athletes' },
  events: { title: 'Events', subtitle: 'Manage 100m competitions and training sessions' },
  fixtures: { title: 'Fixtures', subtitle: 'Manage your team in hosted fixtures' },
  live: { title: 'Live Race Logger', subtitle: 'Track-side race logging, incident control, and instant results' },
  account: { title: 'Account', subtitle: 'Manage security, sign-out, and account deletion' },
};
const THEME_STORAGE_KEY = 'athlora-theme';
const WEATHER_PREF_KEY = 'athlora-weather-effects';
const WEATHER_REFRESH_MS = 10 * 60 * 1000;
const WEATHER_GEOCODE_BASE = 'https://geocoding-api.open-meteo.com/v1/search';

interface LiveWeather {
  label: string;
  temperature: number;
  atmosphere: WeatherAtmosphere;
  isDay: boolean;
  source: 'device' | 'timezone';
}

interface Coordinates {
  latitude: number;
  longitude: number;
}

interface Particle {
  kind: 'rain' | 'snow' | 'spark';
  x: number;
  y: number;
  vx: number;
  vy: number;
  len: number;
  alpha: number;
  size: number;
  phase: number;
}

function seededNoise(index: number, salt = 0): number {
  const value = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function WeatherCanvas({ layers, precipitation, reducedMotion }: { layers: ReadonlyArray<string>; precipitation: number; reducedMotion: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const layersKey = layers.join(',');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || reducedMotion) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = 0;
    let height = 0;
    let rafId = 0;

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas, { passive: true });

    const particles: Particle[] = [];
    const precip = Number(precipitation) || 0;

    if (layersKey.includes('rain')) {
      const count = Math.min(125, 70 + Math.round(precip * 10));
      for (let index = 0; index < count; index += 1) {
        particles.push({
          kind: 'rain',
          x: seededNoise(index, 1) * width,
          y: seededNoise(index, 2) * height,
          vx: -(38 + seededNoise(index, 3) * 55),
          vy: 560 + seededNoise(index, 4) * 440,
          len: 14 + seededNoise(index, 5) * 28,
          alpha: 0.2 + seededNoise(index, 6) * 0.46,
          size: 0,
          phase: 0,
        });
      }
    }
    if (layersKey.includes('snow')) {
      for (let index = 0; index < 64; index += 1) {
        particles.push({
          kind: 'snow',
          x: seededNoise(index, 7) * width,
          y: seededNoise(index, 8) * height,
          vx: -10 + seededNoise(index, 9) * 20,
          vy: 30 + seededNoise(index, 10) * 48,
          len: 0,
          alpha: 0.28 + seededNoise(index, 12) * 0.5,
          size: 1.5 + seededNoise(index, 11) * 3.8,
          phase: seededNoise(index, 13) * Math.PI * 2,
        });
      }
    }
    if (layersKey.includes('sparks')) {
      for (let index = 0; index < 42; index += 1) {
        particles.push({
          kind: 'spark',
          x: seededNoise(index, 14) * width,
          y: seededNoise(index, 15) * height,
          vx: -(8 + seededNoise(index, 16) * 16),
          vy: 8 + seededNoise(index, 17) * 18,
          len: 0,
          alpha: 0.48 + seededNoise(index, 19) * 0.46,
          size: 1.05 + seededNoise(index, 18) * 2.45,
          phase: seededNoise(index, 20) * Math.PI * 2,
        });
      }
    }

    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.034, (now - last) / 1000 || 0.016);
      last = now;
      context.clearRect(0, 0, width, height);

      for (const particle of particles) {
        if (particle.kind === 'rain') {
          particle.x += particle.vx * dt;
          particle.y += particle.vy * dt;
          if (particle.y > height + 40 || particle.x < -60) { particle.x = Math.random() * width + 50; particle.y = -40; }
          const slope = particle.vx / particle.vy;
          context.beginPath();
          context.moveTo(particle.x, particle.y);
          context.lineTo(particle.x - slope * particle.len, particle.y - particle.len);
          context.strokeStyle = `rgba(69, 190, 215, ${particle.alpha})`;
          context.lineWidth = 1.2;
          context.stroke();
        } else if (particle.kind === 'snow') {
          particle.phase += dt * 0.8;
          particle.x += (particle.vx + Math.sin(particle.phase) * 13) * dt;
          particle.y += particle.vy * dt;
          if (particle.y > height + 12) { particle.y = -12; particle.x = Math.random() * width; }
          if (particle.x < -15) particle.x = width + 10;
          if (particle.x > width + 15) particle.x = -10;
          context.beginPath();
          context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
          context.fillStyle = `rgba(138, 233, 242, ${particle.alpha})`;
          context.fill();
        } else {
          particle.phase += dt * 0.55;
          particle.x += particle.vx * dt;
          particle.y += particle.vy * dt;
          if (particle.y > height + 10 || particle.x < -10) { particle.x = width + Math.random() * 80; particle.y = Math.random() * height * 0.42; }
          const twinkle = 0.72 + Math.sin(particle.phase) * 0.24;
          context.save();
          context.shadowBlur = 14;
          context.shadowColor = 'rgba(69, 190, 215, 0.95)';
          context.beginPath();
          context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
          context.fillStyle = `rgba(69, 190, 215, ${Math.max(0.34, particle.alpha * twinkle)})`;
          context.fill();
          context.restore();
        }
      }
      rafId = requestAnimationFrame(frame);
    };
    rafId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [layersKey, precipitation, reducedMotion]);

  return <canvas ref={canvasRef} className={styles.weatherCanvas} aria-hidden="true" />;
}

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function resolveTimezoneCoordinates(): Promise<Coordinates | null> {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    const zoneCity = timezone && !timezone.startsWith('Etc/')
      ? timezone.split('/').pop()?.replace(/_/g, ' ')
      : '';
    if (!zoneCity) return null;

    const params = new URLSearchParams({ name: zoneCity, count: '10', language: 'en', format: 'json' });
    const response = await fetch(`${WEATHER_GEOCODE_BASE}?${params.toString()}`);
    if (!response.ok) return null;
    const data = await response.json() as unknown;
    if (!isRecord(data) || !Array.isArray(data.results)) return null;

    const results = data.results as unknown[];
    const match = results.find((result) =>
      isRecord(result) && result.timezone === timezone &&
      typeof result.latitude === 'number' && typeof result.longitude === 'number')
      ?? results.find((result) =>
        isRecord(result) && typeof result.latitude === 'number' && typeof result.longitude === 'number');
    if (!isRecord(match) || typeof match.latitude !== 'number' || typeof match.longitude !== 'number') return null;
    return { latitude: match.latitude, longitude: match.longitude };
  } catch {
    return null;
  }
}

function resolveDeviceCoordinates(): Promise<Coordinates | null> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator) || !window.isSecureContext) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 9000, maximumAge: 10 * 60 * 1000 },
    );
  });
}

export function CoachConsole() {
  const { activeWorkspace, workspaces, selectWorkspace } = useWorkspace();
  const location = useLocation();
  const routerNavigate = useNavigate();
  const [rosterCount, setRosterCount] = useState<number | null>(null);
  const [eventUpcomingCount, setEventUpcomingCount] = useState<number | null>(null);
  const [fixtureNotificationCounts, setFixtureNotificationCounts] = useState<FixtureNotificationCounts>({ events: 0, fixtures: 0 });
  const [weatherEnabled, setWeatherEnabled] = useState(() => { try { return localStorage.getItem(WEATHER_PREF_KEY) !== 'off'; } catch { return true; } });
  const [weather, setWeather] = useState<WeatherPreset>('partly');
  const [isNight, setIsNight] = useState(false);
  const [weatherPrecipitation, setWeatherPrecipitation] = useState(4);
  const [liveWeather, setLiveWeather] = useState<LiveWeather | null>(null);
  const [liveWeatherError, setLiveWeatherError] = useState<string | null>(null);
  const [themeLight, setThemeLight] = useState(() => { try { return localStorage.getItem(THEME_STORAGE_KEY) === 'light'; } catch { return false; } });
  const reducedMotion = useMemo(() => (typeof window === 'undefined' ? false : window.matchMedia('(prefers-reduced-motion: reduce)').matches), []);
  const weatherMeta = WEATHER_PRESETS.find((preset) => preset.id === weather)!;
  const destination: ConsoleView = location.pathname.includes('/athletes') ? 'athletes'
    : location.pathname.includes('/stats') ? 'stats'
    : location.pathname.includes('/comparison') ? 'comparison'
    : location.pathname.includes('/events') ? 'events'
      : location.pathname.includes('/fixtures') ? 'fixtures'
      : location.pathname.includes('/live') ? 'live'
        : location.pathname.includes('/account') ? 'account' : 'dashboard';
  const navigate = (view: ConsoleView, targetId?: string) => {
    const rootPath = view === 'dashboard' ? '/console' : `/console/${view}`;
    const search = !targetId && destination === view ? location.search : '';
    const path = `${targetId ? `${rootPath}/${targetId}` : rootPath}${search}`;
    if (`${location.pathname}${location.search}` === path) return;
    routerNavigate(path);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const updateDashboardCounts = (summary: DashboardSummary) => {
    setRosterCount(summary.activeAthletesCount);
    setEventUpcomingCount(summary.upcomingEventCount);
  };
  const toggleWeather = () => setWeatherEnabled((enabled) => { const next = !enabled; try { localStorage.setItem(WEATHER_PREF_KEY, next ? 'on' : 'off'); } catch { /* Preference persistence is optional. */ } return next; });
  const toggleTheme = () => setThemeLight((light) => { const next = !light; try { localStorage.setItem(THEME_STORAGE_KEY, next ? 'light' : 'dark'); } catch { /* Preference persistence is optional. */ } return next; });

  const changeWorkspace = (workspaceId: string) => {
    if (workspaceId === activeWorkspace.id) return;
    selectWorkspace(workspaceId);
    routerNavigate('/console');
    setRosterCount(null);
    setEventUpcomingCount(null);
  };

  useEffect(() => {
    document.documentElement.classList.toggle('theme-light', themeLight);
    return () => document.documentElement.classList.remove('theme-light');
  }, [themeLight]);

  useEffect(() => {
    if (!weatherEnabled) {
      setLiveWeather(null);
      setLiveWeatherError(null);
      return;
    }
    let current = true;

    const reportUnavailableWeather = (error?: unknown) => {
      if (!current) return;
      setLiveWeather(null);
      setLiveWeatherError(error instanceof ApiError && error.status === 401
        ? 'Sign in for live weather.'
        : 'Weather unavailable. Check location permissions or try again.');
    };

    const applyLiveWeather = (coords: Coordinates, source: 'device' | 'timezone') => {
      void getCurrentWeather(coords.latitude, coords.longitude)
        .then((data) => {
          if (!current) return;
          const atmosphere = classifyWeather(data.weatherCode);
          setLiveWeather({
            label: weatherLabel(data.weatherCode),
            temperature: Math.round(data.temperatureC),
            atmosphere,
            isDay: data.isDay,
            source,
          });
          setWeather(() => {
            const base = atmosphere === 'fog' ? 'fog' : atmosphere === 'rain' ? 'rain' : atmosphere === 'snow' ? 'snow' : atmosphere === 'storm' ? 'storm' : atmosphere === 'cloudy' ? 'cloudy' : atmosphere === 'partly' ? 'partly' : 'clear';
            return data.isDay ? base : base === 'rain' ? 'night-rain' : base === 'partly' || base === 'clear' ? 'night' : base;
          });
          setIsNight(!data.isDay);
          setWeatherPrecipitation(data.precipitationMm);
          setLiveWeatherError(null);
        })
        .catch(reportUnavailableWeather);
    };

    const load = async () => {
      setLiveWeatherError(null);
      const deviceCoords = await resolveDeviceCoordinates();
      if (!current) return;
      if (deviceCoords) { applyLiveWeather(deviceCoords, 'device'); return; }
      const zoneCoords = await resolveTimezoneCoordinates();
      if (!current) return;
      if (zoneCoords) {
        applyLiveWeather(zoneCoords, 'timezone');
      } else {
        reportUnavailableWeather();
      }
    };
    void load();

    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, WEATHER_REFRESH_MS);

    return () => { current = false; window.clearInterval(timer); };
  }, [weatherEnabled]);

  const liveReadout = liveWeather
    ? `${liveWeather.label} · ${liveWeather.temperature}°`
    : liveWeatherError
      ? 'Weather unavailable'
      : weatherEnabled
        ? 'Loading live weather...'
        : `${weatherMeta.label} · ${weatherMeta.temperature}°`;
  const readoutSource = liveWeather
    ? `${liveWeather.label} — current conditions from ${liveWeather.source === 'device' ? 'approximate device location' : 'timezone fallback'}`
    : liveWeatherError
      ? liveWeatherError
      : weatherEnabled
        ? 'Retrieving current conditions for this device.'
        : 'Weather effects use the selected local atmosphere preset.';

  const sceneLayers: string[] = [];
  if (isNight) sceneLayers.push('sparks');
  if (weather === 'rain' || weather === 'night-rain' || weather === 'storm') sceneLayers.push('rain');
  if (weather === 'snow') sceneLayers.push('snow');

  return <div className={styles.console} data-weather={weatherEnabled ? weather : undefined} data-weather-night={weatherEnabled && isNight ? true : undefined} data-weather-enabled={weatherEnabled}>
    <div className={styles.weatherScene} aria-hidden="true">
      <WeatherCanvas layers={sceneLayers} precipitation={weatherPrecipitation} reducedMotion={reducedMotion} />
      {weather === 'storm' && <i className={styles.lightning} />}
    </div>
    <aside className={styles.sidebar}>
      <div className={styles.brand}><img src="/logo-removebg.png" alt="" /><span><b>Athlora</b><small>Athletics Coaching</small></span></div>
      <label className={styles.workspaceSwitcher}>
        <span>Club</span>
         <select value={activeWorkspace.id} onChange={(event) => changeWorkspace(event.target.value)} aria-label="Active Club">
          {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
        </select>
      </label>
       <nav aria-label="Coach console"><ul>{NAV.map((item) => <li key={item.id}><button type="button" aria-current={destination === item.id ? 'page' : undefined} onClick={() => navigate(item.id)}><i><ConsoleIcon name={item.icon} /></i><span>{item.label}</span>{item.id === 'athletes' && <small>{rosterCount ?? '—'}</small>}{item.id === 'events' && fixtureNotificationCounts.events > 0 && <small aria-label={`${fixtureNotificationCounts.events} unread started fixture notifications`}>{fixtureNotificationCounts.events}</small>}{item.id === 'fixtures' && fixtureNotificationCounts.fixtures > 0 && <small aria-label={`${fixtureNotificationCounts.fixtures} unread fixture notifications`}>{fixtureNotificationCounts.fixtures}</small>}</button></li>)}</ul></nav>
      <section className={styles.readiness} aria-label="Squad readiness">
        <header><span>Squad readiness</span></header>
        <p>Active roster<b>{rosterCount ?? '—'}</b></p>
        <p>Upcoming events<b>{eventUpcomingCount ?? '—'}</b></p>
      </section>
      <footer><span>C</span><div><b>Coach Console</b><small>Head Coach access</small></div></footer>
    </aside>
    <div className={styles.main}>
      <header className={styles.topbar}>
         <div className={styles.title}><h1>{PAGE_COPY[destination].title}</h1><p>{PAGE_COPY[destination].subtitle}</p></div>
        <div className={styles.weatherOrigin} aria-hidden="true"><i className={styles.sun} /><i className={styles.moon} /><i className={styles.cloudOne} /><i className={styles.cloudTwo} /></div>
           <div className={styles.topControls}>
           <FixtureNotifications onCountsChange={setFixtureNotificationCounts} />
          <button type="button" className={styles.weatherToggle} aria-pressed={weatherEnabled} onClick={toggleWeather} title={weatherEnabled ? 'Turn weather effects off' : 'Turn weather effects on'}><span className={styles.weatherToggleLabel}>Weather FX</span><span className={styles.weatherToggleTrack} aria-hidden="true"><span className={styles.weatherToggleKnob} /></span></button>
          <details className={styles.weatherMenu}><summary aria-label="Preview weather presets">•••</summary><div><header><b>Weather preview</b><small>Visual presets</small></header>{WEATHER_PRESETS.map((preset) => <button type="button" aria-pressed={weather === preset.id} onClick={(event) => { setWeatherEnabled(true); setWeather(preset.id); setIsNight(preset.id === 'night' || preset.id === 'night-rain'); setWeatherPrecipitation(preset.id === 'storm' ? 9 : preset.id === 'night-rain' ? 5 : preset.id === 'rain' ? 4 : 2); (event.currentTarget.closest('details') as HTMLDetailsElement | null)?.removeAttribute('open'); }} key={preset.id}>{preset.label}</button>)}<p>Preview presets change atmosphere only. Live conditions follow this device.</p></div></details>
          <div className={styles.weatherReadout} aria-live="polite" title={readoutSource}><i /><span>{liveReadout}</span><a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a></div>
          <button type="button" className={`${styles.themeToggle} ${styles.weatherToggle}`} aria-pressed={themeLight} aria-label={themeLight ? 'Switch to dark theme' : 'Switch to light theme'} onClick={toggleTheme} title={themeLight ? 'Switch to dark mode' : 'Switch to light mode'}><span className={styles.themeToggleIcon} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="3.5" /><path d="M12 2.8v2.1M12 19.1v2.1M2.8 12h2.1M19.1 12h2.1M5.5 5.5 7 7M17 17l1.5 1.5M18.5 5.5 17 7M7 17l-1.5 1.5" /></svg></span><span className={styles.weatherToggleLabel}>Light mode</span><span className={styles.weatherToggleTrack} aria-hidden="true"><span className={styles.weatherToggleKnob} /></span></button>
          <div className={styles.clock}><LiveTime /></div>
        </div>
      </header>
      <main className={styles.content}>
        {location.pathname === '/console' && <><IncomingFixtureInvitations compact /><DashboardPage key={`dashboard:${activeWorkspace.id}`} onOpenRoster={() => navigate('athletes')} onOpenAthlete={(id) => navigate('athletes', id)} onOpenEvents={() => navigate('events')} onOpenEvent={(id) => navigate('events', id)} onResumeLogging={(id) => navigate('live', id)} onSummaryLoaded={updateDashboardCounts} /></>}
        {location.pathname === '/console/stats' && <DashboardPage key={`stats:${activeWorkspace.id}`} onOpenRoster={() => navigate('athletes')} onOpenAthlete={(id) => navigate('athletes', id)} onOpenEvents={() => navigate('events')} onOpenEvent={(id) => navigate('events', id)} onResumeLogging={(id) => navigate('live', id)} onSummaryLoaded={updateDashboardCounts} />}
        {location.pathname === '/console/athletes' && <AthletesPage key={`athletes:${activeWorkspace.id}`} onActiveCountChange={setRosterCount} onOpenAthlete={(id, openFitness) => routerNavigate(`/console/athletes/${id}${openFitness ? '?fitness=1' : ''}`)} />}
        {location.pathname.startsWith('/console/athletes/') && <AthletesPage key={`athletes:${activeWorkspace.id}:${location.pathname}${location.search}`} initialAthleteId={location.pathname.split('/').pop()} initialFitnessOpen={new URLSearchParams(location.search).get('fitness') === '1'} onActiveCountChange={setRosterCount} onBackToRoster={() => routerNavigate('/console/athletes')} />}
        {location.pathname === '/console/comparison' && <ComparisonPage key={`comparison:${activeWorkspace.id}`} />}
        {location.pathname === '/console/events' && <EventsPage key={`events:${activeWorkspace.id}`} onUpcomingCountChange={setEventUpcomingCount} onOpenEvent={(id) => routerNavigate(`/console/events/${id}${location.search}`)} />}
          {location.pathname.startsWith('/console/events/') && <EventDetailPage key={`event:${activeWorkspace.id}:${location.pathname}`} eventId={location.pathname.split('/').pop()!} onBack={() => routerNavigate(`/console/events${location.search}`)} />}
          {location.pathname === '/console/fixtures' && <><IncomingFixtureInvitations /><FixturesPage key={`fixtures:${activeWorkspace.id}`} /></>}
        {location.pathname === '/console/live' && <LiveLoggingPage key={`live:${activeWorkspace.id}`} onOpenEvent={(id) => navigate('live', id)} />}
        {location.pathname.startsWith('/console/live/') && <LiveLoggingPage key={`live:${activeWorkspace.id}:${location.pathname}`} initialEventId={location.pathname.split('/').pop()} onBackToEventList={() => routerNavigate('/console/live')} />}
        {location.pathname === '/console/account' && <AuthPage />}
      </main>
    </div>
    <nav className={styles.mobileNav} aria-label="Mobile coach console">{NAV.map((item) => <button type="button" aria-current={destination === item.id ? 'page' : undefined} onClick={() => navigate(item.id)} key={item.id}><i><ConsoleIcon name={item.icon} /></i>{item.shortLabel}</button>)}</nav>
  </div>;
}
