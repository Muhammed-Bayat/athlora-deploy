import type { Injury, InjurySeverity } from '../../types';
import { lazy, Suspense } from 'react';
import styles from './CompactAnatomy.module.css';

type CompactInjury = Pick<Injury, 'bodyRegion' | 'area' | 'side' | 'severity'>;
const StaticAnatomy = lazy(() => import('./StaticAnatomy').then(({ StaticAnatomy: Model }) => ({ default: Model })));

function injurySummaryText(injuries: CompactInjury[]): string {
  if (injuries.length === 0) return 'No active injuries. Athlete is healthy.';
  const labels = injuries.map((injury) => `${injury.severity.toLowerCase()} ${injury.side === 'Center' ? injury.area : `${injury.side.toLowerCase()} ${injury.area}`}`);
  return `${injuries.length} active ${injuries.length === 1 ? 'injury' : 'injuries'}: ${labels.join('; ')}.`;
}

export function CompactAnatomy({
  injuries,
  highestSeverity,
  size = 'small',
  onOpenFitness,
  disabled = false,
}: {
  injuries: CompactInjury[];
  highestSeverity: InjurySeverity | null;
  size?: 'small' | 'large';
  onOpenFitness?: () => void;
  disabled?: boolean;
}) {
  const summary = injurySummaryText(injuries);
  const status = highestSeverity ? `${highestSeverity} active injury status` : 'Healthy athlete';

  return (
    <section className={`${styles.compact} ${size === 'large' ? styles.large : styles.small}`} aria-label={`Injury summary: ${summary}`}>
      <div className={styles.body} role="img" aria-label={summary}><Suspense fallback={null}><StaticAnatomy injuries={injuries} /></Suspense></div>
      <div className={styles.copy}>
        <strong>{injuries.length === 0 ? 'Healthy' : `${injuries.length} active ${injuries.length === 1 ? 'injury' : 'injuries'}`}</strong>
        <span className={styles.status} data-severity={highestSeverity ?? 'none'}>{status}</span>
        <span className={styles.srOnly}>{summary}</span>
        {onOpenFitness && <button type="button" className={styles.link} onClick={onOpenFitness} disabled={disabled}>Open Fitness & injury map</button>}
      </div>
    </section>
  );
}
