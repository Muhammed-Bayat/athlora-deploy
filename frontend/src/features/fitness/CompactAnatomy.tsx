import type { Injury, InjurySeverity } from '../../types';
import styles from './CompactAnatomy.module.css';

type CompactInjury = Pick<Injury, 'bodyRegion' | 'area' | 'side' | 'severity'>;
type Side = 'left' | 'right' | 'center';

const severityRank: Record<InjurySeverity, number> = { Minor: 1, Moderate: 2, Severe: 3 };

const zonePaths: Record<string, { x: number; y: number; width: number; height: number; radius?: number }> = {
  Head: { x: 51, y: 6, width: 18, height: 18, radius: 9 },
  Neck: { x: 56, y: 24, width: 8, height: 10, radius: 3 },
  Chest: { x: 41, y: 35, width: 38, height: 22, radius: 8 },
  'Abdomen / core': { x: 45, y: 57, width: 30, height: 22, radius: 5 },
  Pelvis: { x: 44, y: 79, width: 32, height: 13, radius: 5 },
  'left:Shoulder': { x: 30, y: 38, width: 13, height: 13, radius: 6 },
  'right:Shoulder': { x: 77, y: 38, width: 13, height: 13, radius: 6 },
  'left:Upper arm': { x: 25, y: 51, width: 11, height: 24, radius: 5 },
  'right:Upper arm': { x: 84, y: 51, width: 11, height: 24, radius: 5 },
  'left:Elbow': { x: 24, y: 75, width: 12, height: 10, radius: 5 },
  'right:Elbow': { x: 84, y: 75, width: 12, height: 10, radius: 5 },
  'left:Forearm': { x: 22, y: 85, width: 11, height: 24, radius: 5 },
  'right:Forearm': { x: 87, y: 85, width: 11, height: 24, radius: 5 },
  'left:Wrist': { x: 21, y: 109, width: 12, height: 7, radius: 3 },
  'right:Wrist': { x: 87, y: 109, width: 12, height: 7, radius: 3 },
  'left:Hand': { x: 19, y: 116, width: 15, height: 12, radius: 5 },
  'right:Hand': { x: 86, y: 116, width: 15, height: 12, radius: 5 },
  'left:Hip': { x: 41, y: 88, width: 13, height: 13, radius: 5 },
  'right:Hip': { x: 66, y: 88, width: 13, height: 13, radius: 5 },
  'left:Thigh': { x: 43, y: 101, width: 12, height: 36, radius: 5 },
  'right:Thigh': { x: 65, y: 101, width: 12, height: 36, radius: 5 },
  'left:Knee': { x: 42, y: 137, width: 14, height: 12, radius: 5 },
  'right:Knee': { x: 64, y: 137, width: 14, height: 12, radius: 5 },
  'left:Shin / calf': { x: 43, y: 149, width: 12, height: 35, radius: 5 },
  'right:Shin / calf': { x: 65, y: 149, width: 12, height: 35, radius: 5 },
  'left:Ankle': { x: 42, y: 184, width: 13, height: 8, radius: 3 },
  'right:Ankle': { x: 65, y: 184, width: 13, height: 8, radius: 3 },
  'left:Foot': { x: 38, y: 192, width: 19, height: 9, radius: 4 },
  'right:Foot': { x: 63, y: 192, width: 19, height: 9, radius: 4 },
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
          return <rect key={key} {...path} className={severity ? styles[`severity${severity}`] : styles.neutral} />;
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
