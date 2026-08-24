import { injuryLabel, type Injury } from './injuryRegions';
import styles from './FitnessView.module.css';

interface ActiveInjuriesProps {
  injuries: Injury[];
  onResolve: (id: string) => void;
}

export function ActiveInjuries({ injuries, onResolve }: ActiveInjuriesProps) {
  return <section className={styles.activeInjuries} aria-labelledby="active-injuries-heading">
    <header><div><p className={styles.eyebrow}>Current session</p><h2 id="active-injuries-heading">Active injuries</h2></div><span>{injuries.length} active</span></header>
    {injuries.length === 0 ? <p className={styles.emptyInjuries}>No active injuries recorded. Use the editor to preview and add the first heat region.</p> : (
      <ol>
        {[...injuries].reverse().map((injury) => <li key={injury.id} className={styles.injuryItem} data-severity={injury.severity.toLowerCase()}>
          <i aria-hidden="true" />
          <div><strong>{injuryLabel(injury)}</strong><span>{injury.region} · {injury.severity} · {new Date(injury.createdAt).toLocaleDateString()}</span>{injury.notes && <p>{injury.notes}</p>}</div>
          <button type="button" onClick={() => onResolve(injury.id)} aria-label={`Resolve ${injuryLabel(injury)} injury`}>Resolve</button>
        </li>)}
      </ol>
    )}
  </section>;
}
