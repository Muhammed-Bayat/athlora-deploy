import type { Injury, InjurySeverity } from '../../types';
import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import styles from './CompactAnatomy.module.css';

type CompactInjury = Pick<Injury, 'bodyRegion' | 'area' | 'side' | 'severity'>;
const StaticAnatomy = lazy(() => import('./StaticAnatomy').then(({ StaticAnatomy: Model }) => ({ default: Model })));

class CompactViewerErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) return <button type="button" className={styles.fallback} onClick={() => this.setState({ failed: false })}>Retry body map</button>;
    return this.props.children;
  }
}

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
  const bodyRef = useRef<HTMLDivElement>(null);
  const [nearViewport, setNearViewport] = useState(() => typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setNearViewport(entry.isIntersecting), { rootMargin: '240px 0px' });
    const body = bodyRef.current;
    if (body) observer.observe(body);
    return () => observer.disconnect();
  }, []);

  return (
    <section className={`${styles.compact} ${size === 'large' ? styles.large : styles.small}`} aria-label={`Injury summary: ${summary}`}>
      <div ref={bodyRef} className={styles.body}>{nearViewport ? <CompactViewerErrorBoundary><Suspense fallback={<span className={styles.loading}>Loading body map</span>}><StaticAnatomy injuries={injuries} /></Suspense></CompactViewerErrorBoundary> : <span className={styles.loading}>Body map ready when visible</span>}</div>
      <div className={styles.copy}>
        <strong>{injuries.length === 0 ? 'Healthy' : `${injuries.length} active ${injuries.length === 1 ? 'injury' : 'injuries'}`}</strong>
        <span className={styles.status} data-severity={highestSeverity ?? 'none'}>{status}</span>
        <span className={styles.srOnly}>{summary}</span>
        {onOpenFitness && <button type="button" className={styles.link} onClick={onOpenFitness} disabled={disabled}>Open Fitness & injury map</button>}
      </div>
    </section>
  );
}
