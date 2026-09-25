import { useCallback, useEffect, useState } from 'react';
import { request, requestPublic } from '../../api/client';
import { Button } from '../../components';

interface Performance { athleteId: string; athleteName: string; discipline: string; label: string; unit: string; precision: number; pb: number; sb: number | null; resultCount: number; seasonCount: number; seasonAverage: number | null; placing: number | null }
export function VerticalStatistics({ path, names = {} }: { path: string; names?: Record<string, string> }) {
  const [rows, setRows] = useState<Performance[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const load = useCallback(async () => {
    setBusy(true); setError('');
    try { setRows((await (path.includes('/public/') ? requestPublic : request)<{ data: Performance[] }>(path.replace('/vertical?', '/disciplines?'))).data); }
    catch (e) { setRows(null); setError(e instanceof Error ? e.message : 'Unable to load discipline statistics'); }
    finally { setBusy(false); }
  }, [path]);
  useEffect(() => {
    if (!enabled) return;
    const refresh = () => { void load(); };
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [enabled, load]);
  return <section aria-label="Discipline performance statistics"><Button disabled={busy} onClick={() => { setEnabled(true); void load(); }}>Load discipline statistics / leaderboards</Button>{error && <p role="alert">{error}</p>}{rows && <><p>Finalized individual performances only. PB is all-time; SB and leaderboard places use the selected year (current year for all seasons). Refreshes every 15 seconds.</p>{rows.length === 0 ? <p>No finalized performances.</p> : <table><thead><tr><th>Athlete</th><th>Discipline</th><th>Season place</th><th>PB</th><th>SB</th><th>Results</th><th>Season results</th><th>Season average</th></tr></thead><tbody>{rows.map(r => <tr key={`${r.athleteId}:${r.discipline}`}><td>{names[r.athleteId] ?? r.athleteName}</td><td>{r.label}</td><td>{r.placing ?? '—'}</td><td>{r.pb.toFixed(r.precision)} {r.unit}</td><td>{r.sb === null ? '—' : `${r.sb.toFixed(r.precision)} ${r.unit}`}</td><td>{r.resultCount}</td><td>{r.seasonCount}</td><td>{r.seasonAverage?.toFixed(r.precision) ?? '—'} {r.unit}</td></tr>)}</tbody></table>}</>}</section>;
}
