import type { Injury, InjuryDraft, InjuryRegion, InjuryArea, InjurySide, InjurySeverity } from '../../types';
import { INJURY_REGIONS } from '../../types';

export { INJURY_REGIONS, type InjuryRegion, type InjuryArea, type InjurySide, type InjurySeverity, type Injury, type InjuryDraft };

export const SEVERITY_LABELS: Record<InjurySeverity, string> = {
  Minor: 'Minor · amber',
  Moderate: 'Moderate · orange',
  Severe: 'Severe · red',
};

export function injuryLabel(injury: Pick<Injury, 'area' | 'side'>): string {
  return injury.side === 'Center' ? injury.area : `${injury.side} ${injury.area}`;
}
