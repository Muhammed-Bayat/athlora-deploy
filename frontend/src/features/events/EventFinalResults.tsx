import { useEffect, useState } from 'react';
import { listEventFinalResults } from '../../api/meets';
import { Button } from '../../components';
import type { AthleticsEvent } from '../../types';
import type { EventFinalResult } from '../../types/meets';
import { downloadFile } from '../../utils/downloadFile';
import { formatResultUnit } from '../../utils/formatting';
import styles from './EventFinalResults.module.css';

function performance(result: EventFinalResult): string {
  if (result.finalResult !== null) return `${result.finalResult.toFixed(result.precision)} ${formatResultUnit(result.unit)}`;
  return result.outcome === 'no_result' ? 'No result' : result.outcome.toUpperCase();
}

function csvCell(value: string | number): string {
  const text = String(value);
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

function exportCsv(results: EventFinalResult[], event: AthleticsEvent): void {
  const rows: Array<Array<string | number>> = [
    ['Name', 'Relay members', 'Club', 'Discipline', 'Official result'],
    ...results.map((result) => [result.name, result.relayMembers.join('; '), result.clubName, result.disciplineLabel, performance(result)]),
  ];
  downloadFile(rows.map((row) => row.map(csvCell).join(',')).join('\r\n'), `${event.title.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-').replaceAll(/(^-|-$)/g, '') || 'event'}-final-results.csv`, 'text/csv;charset=utf-8');
}

export function EventFinalResults({ event, reloadKey }: { event: AthleticsEvent; reloadKey: number }) {
  const [results, setResults] = useState<EventFinalResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (event.status !== 'completed') {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void listEventFinalResults(event.id)
      .then((response) => { if (!controller.signal.aborted) setResults(response.data); })
      .catch(() => { if (!controller.signal.aborted) setError('Could not load final results.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [event.id, event.status, reloadKey]);

  if (event.status === 'scheduled') return <section className={styles.panel} aria-label="Event final results"><h2>Results</h2><p>No results yet</p></section>;
  if (event.status === 'in_progress') return <section className={styles.panel} aria-label="Event final results"><h2>Results</h2><p>Event has not yet been completed</p></section>;
  if (event.status === 'cancelled') return <section className={styles.panel} aria-label="Event final results"><h2>Results</h2><p>This event was cancelled.</p></section>;

  return <section className={styles.panel} aria-label="Event final results">
    <div className={styles.heading}><div><h2>Results</h2><p>Final official results from all participating clubs.</p></div><Button variant="secondary" onClick={() => exportCsv(results, event)} disabled={loading || results.length === 0}>Export final results CSV</Button></div>
    {loading && <p role="status">Loading final results...</p>}
    {error && <p role="alert">{error}</p>}
    {!loading && !error && results.length === 0 && <p>No final results yet</p>}
    {!loading && !error && results.length > 0 && <div className={styles.scroll}><table aria-label="Final event results"><thead><tr><th scope="col">Name</th><th scope="col">Club</th><th scope="col">Discipline</th><th scope="col">Official result</th></tr></thead><tbody>{results.map((result) => <tr key={`${result.discipline}-${result.entrantId}`}><th scope="row">{result.name}{result.relayMembers.length > 0 && <small>{result.relayMembers.join(', ')}</small>}</th><td>{result.clubName}</td><td>{result.disciplineLabel}</td><td className={styles.numeric}>{performance(result)}</td></tr>)}</tbody></table></div>}
  </section>;
}
