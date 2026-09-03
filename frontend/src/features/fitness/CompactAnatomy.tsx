import type { Injury, InjurySeverity } from '../../types';
import styles from './CompactAnatomy.module.css';

type CompactInjury = Pick<Injury, 'bodyRegion' | 'area' | 'side' | 'severity'>;
type Side = 'left' | 'right' | 'center';

const severityRank: Record<InjurySeverity, number> = { Minor: 1, Moderate: 2, Severe: 3 };

const zonePaths: Record<string, string> = {
  Head: 'M60 5C52.8 5 48 10.3 48 17c0 5.6 3.1 9.6 8 11.2V33h8v-4.8c4.9-1.6 8-5.6 8-11.2C72 10.3 67.2 5 60 5Z',
  Neck: 'M56 27.5h8v7.8c0 2-1.8 3.7-4 3.7s-4-1.7-4-3.7v-7.8Z',
  Chest: 'M45 35c4.7 2.2 9.7 3.3 15 3.3s10.3-1.1 15-3.3c3.2 4.8 4.7 11.6 3.9 19.8-.3 2.9-2.7 5.2-5.6 5.2H46.7c-2.9 0-5.3-2.3-5.6-5.2C40.3 46.6 41.8 39.8 45 35Z',
  'Abdomen / core': 'M46.7 59h26.6c.8 7.7-.5 14.5-3.4 21H50.1c-2.9-6.5-4.2-13.3-3.4-21Z',
  Pelvis: 'M50 79h20c4.5 3.6 6.7 7.8 6.5 12.8-4.9 3.4-10.4 5.1-16.5 5.1s-11.6-1.7-16.5-5.1C43.3 86.8 45.5 82.6 50 79Z',
  'left:Shoulder': 'M45.5 35.4c-6.9-1.8-12.2.3-15.5 6.1-1.9 3.4-.7 7.7 2.8 9.5 3.1 1.6 6.8.7 8.9-2.2 1.3-1.8 2.9-3.2 4.8-4.1-.1-3.2-.4-6.3-1-9.3Z',
  'right:Shoulder': 'M74.5 35.4c6.9-1.8 12.2.3 15.5 6.1 1.9 3.4.7 7.7-2.8 9.5-3.1 1.6-6.8.7-8.9-2.2-1.3-1.8-2.9-3.2-4.8-4.1.1-3.2.4-6.3 1-9.3Z',
  'left:Upper arm': 'M32.9 49.3c3.3-.1 6.1 2.3 6.3 5.6l.9 16.1c.2 3.7-2.7 6.8-6.4 6.8-3.3 0-6-2.6-6.2-5.9l-.8-16.1c-.2-3.5 2.6-6.4 6.2-6.5Z',
  'right:Upper arm': 'M87.1 49.3c-3.3-.1-6.1 2.3-6.3 5.6L79.9 71c-.2 3.7 2.7 6.8 6.4 6.8 3.3 0 6-2.6 6.2-5.9l.8-16.1c.2-3.5-2.6-6.4-6.2-6.5Z',
  'left:Elbow': 'M33.8 76.3c3.7 0 6.6 3 6.6 6.7s-2.9 6.7-6.6 6.7-6.6-3-6.6-6.7 2.9-6.7 6.6-6.7Z',
  'right:Elbow': 'M86.2 76.3c3.7 0 6.6 3 6.6 6.7s-2.9 6.7-6.6 6.7-6.6-3-6.6-6.7 2.9-6.7 6.6-6.7Z',
  'left:Forearm': 'M32.3 88.4c3.3-.6 6.5 1.5 7.2 4.8l3.1 15.3c.7 3.5-1.5 6.9-5 7.6-3.4.7-6.8-1.5-7.5-4.9L27 95.9c-.7-3.4 1.5-6.8 5.3-7.5Z',
  'right:Forearm': 'M87.7 88.4c-3.3-.6-6.5 1.5-7.2 4.8l-3.1 15.3c-.7 3.5 1.5 6.9 5 7.6 3.4.7 6.8-1.5 7.5-4.9L93 95.9c.7-3.4-1.5-6.8-5.3-7.5Z',
  'left:Wrist': 'M36.3 114.8c3.1-.6 6.1 1.5 6.7 4.6.6 3.2-1.5 6.2-4.7 6.8-3.1.6-6.1-1.5-6.7-4.6-.6-3.2 1.5-6.2 4.7-6.8Z',
  'right:Wrist': 'M83.7 114.8c-3.1-.6-6.1 1.5-6.7 4.6-.6 3.2 1.5 6.2 4.7 6.8 3.1.6 6.1-1.5 6.7-4.6.6-3.2-1.5-6.2-4.7-6.8Z',
  'left:Hand': 'M35 124.2c4.2-.9 8.3 1.8 9.2 6 .8 4.1-1.8 8.1-5.9 9-4.2.9-8.3-1.8-9.2-6-.8-4.1 1.8-8.1 5.9-9Z',
  'right:Hand': 'M85 124.2c-4.2-.9-8.3 1.8-9.2 6-.8 4.1 1.8 8.1 5.9 9 4.2.9 8.3-1.8 9.2-6 .8-4.1-1.8-8.1-5.9-9Z',
  'left:Hip': 'M44.2 90.4c4.5 2.8 8.7 4.3 12.6 4.6l-1.1 8.9c-.4 3.6-3.6 6.1-7.2 5.6-3.5-.4-6-3.6-5.6-7.1l1.3-12Z',
  'right:Hip': 'M75.8 90.4c-4.5 2.8-8.7 4.3-12.6 4.6l1.1 8.9c.4 3.6 3.6 6.1 7.2 5.6 3.5-.4 6-3.6 5.6-7.1l-1.3-12Z',
  'left:Thigh': 'M49.4 105.6c3.7-.5 7.1 2.1 7.6 5.8l2.7 20.3c.5 3.9-2.2 7.5-6.1 8-3.9.5-7.5-2.2-8-6.1l-2.7-20.3c-.5-3.9 2.2-7.3 6.5-7.7Z',
  'right:Thigh': 'M70.6 105.6c-3.7-.5-7.1 2.1-7.6 5.8l-2.7 20.3c-.5 3.9 2.2 7.5 6.1 8 3.9.5 7.5-2.2 8-6.1l2.7-20.3c.5-3.9-2.2-7.3-6.5-7.7Z',
  'left:Knee': 'M52.9 137.5c4 0 7.2 3.2 7.2 7.2s-3.2 7.2-7.2 7.2-7.2-3.2-7.2-7.2 3.2-7.2 7.2-7.2Z',
  'right:Knee': 'M67.1 137.5c4 0 7.2 3.2 7.2 7.2s-3.2 7.2-7.2 7.2-7.2-3.2-7.2-7.2 3.2-7.2 7.2-7.2Z',
  'left:Shin / calf': 'M51.1 150c3.9-.5 7.4 2.3 7.9 6.1l2.4 20.8c.5 4-2.3 7.6-6.3 8.1-3.9.5-7.5-2.3-8-6.2l-2.4-20.8c-.5-3.9 2.3-7.5 6.4-8Z',
  'right:Shin / calf': 'M68.9 150c-3.9-.5-7.4 2.3-7.9 6.1l-2.4 20.8c-.5 4 2.3 7.6 6.3 8.1 3.9.5 7.5-2.3 8-6.2l2.4-20.8c.5-3.9-2.3-7.5-6.4-8Z',
  'left:Ankle': 'M54.7 181.9c3.5-.5 6.7 1.9 7.2 5.4.5 3.5-1.9 6.7-5.4 7.2-3.5.5-6.7-1.9-7.2-5.4-.5-3.5 1.9-6.7 5.4-7.2Z',
  'right:Ankle': 'M65.3 181.9c-3.5-.5-6.7 1.9-7.2 5.4-.5 3.5 1.9 6.7 5.4 7.2 3.5.5 6.7-1.9 7.2-5.4.5-3.5-1.9-6.7-5.4-7.2Z',
  'left:Foot': 'M53.1 191.6c5.6-.4 10.5 1.1 14.5 4.7 1.7 1.5.6 4.3-1.7 4.3H47.8c-2.3 0-3.4-2.8-1.7-4.3 2-1.8 4.3-3.3 7-4.7Z',
  'right:Foot': 'M66.9 191.6c-5.6-.4-10.5 1.1-14.5 4.7-1.7 1.5-.6 4.3 1.7 4.3h18.1c2.3 0 3.4-2.8 1.7-4.3-2-1.8-4.3-3.3-7-4.7Z',
};

function sides(injury: CompactInjury): Side[] {
  if (injury.bodyRegion === 'Head & Neck' || injury.bodyRegion === 'Torso' || injury.side === 'Center') return ['center'];
  if (injury.side === 'Both') return ['left', 'right'];
  return [injury.side.toLowerCase() as Side];
}

function zoneKey(injury: CompactInjury, side: Side): string {
  const area = injury.area === 'Upper back' ? 'Chest' : injury.area === 'Lower back' ? 'Abdomen / core' : injury.area;
  return side === 'center' ? area : `${side}:${area}`;
}

export function aggregateCompactInjuries(injuries: CompactInjury[]): Map<string, InjurySeverity> {
  const aggregate = new Map<string, InjurySeverity>();
  for (const injury of injuries) {
    for (const side of sides(injury)) {
      const key = zoneKey(injury, side);
      const current = aggregate.get(key);
      if (!current || severityRank[injury.severity] > severityRank[current]) aggregate.set(key, injury.severity);
    }
  }
  return aggregate;
}

export function injurySummaryText(injuries: CompactInjury[]): string {
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
  const zones = aggregateCompactInjuries(injuries);
  const summary = injurySummaryText(injuries);
  const status = highestSeverity ? `${highestSeverity} active injury status` : 'Healthy athlete';

  return (
    <section className={`${styles.compact} ${size === 'large' ? styles.large : styles.small}`} aria-label={`Injury summary: ${summary}`}>
      <svg className={styles.body} viewBox="0 0 120 208" role="img" aria-label={summary} focusable="false">
        {Object.entries(zonePaths).map(([key, path]) => {
          const severity = zones.get(key);
          return <path key={key} d={path} data-zone={key} className={severity ? styles[`severity${severity}`] : styles.neutral} />;
        })}
      </svg>
      <div className={styles.copy}>
        <strong>{injuries.length === 0 ? 'Healthy' : `${injuries.length} active ${injuries.length === 1 ? 'injury' : 'injuries'}`}</strong>
        <span data-severity={highestSeverity ?? 'none'}>{status}</span>
        <span className={styles.srOnly}>{summary}</span>
        {onOpenFitness && <button type="button" className={styles.link} onClick={onOpenFitness} disabled={disabled}>Open Fitness & injury map</button>}
      </div>
    </section>
  );
}
