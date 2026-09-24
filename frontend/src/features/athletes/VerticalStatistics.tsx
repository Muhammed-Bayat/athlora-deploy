import { useState } from 'react';
import { request } from '../../api/client';
import { Button } from '../../components';

interface Performance { athleteId: string; discipline: string; precision: number; pb: number; sb: number | null; resultCount: number }
export function VerticalStatistics({ path, names = {} }: { path: string; names?: Record<string, string> }) {
  const [rows, setRows] = useState<Performance[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true); setError('');
    try { setRows((await request<{ data: Performance[] }>(path)).data); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to load vertical statistics'); }
    finally { setBusy(false); }
  }
  return <section aria-label="Vertical performance statistics"><Button disabled={busy} onClick={() => void load()}>Load High Jump / Pole Vault statistics</Button>{error && <p role="alert">{error}</p>}{rows && <><p>Finalized clearances only. PB is all-time; SB is the selected year (current year for all seasons).</p>{rows.length === 0 ? <p>No finalized vertical clearances.</p> : <table><thead><tr><th>Athlete</th><th>Discipline</th><th>PB</th><th>SB</th><th>Results</th></tr></thead><tbody>{rows.map(r => <tr key={`${r.athleteId}:${r.discipline}`}><td>{names[r.athleteId] ?? 'Athlete'}</td><td>{r.discipline === 'high_jump' ? 'High Jump' : 'Pole Vault'}</td><td>{r.pb.toFixed(r.precision)} m</td><td>{r.sb === null ? '—' : `${r.sb.toFixed(r.precision)} m`}</td><td>{r.resultCount}</td></tr>)}</tbody></table>}</>}</section>;
}
