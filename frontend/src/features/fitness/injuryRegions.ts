export const INJURY_REGIONS = {
  'Head & Neck': ['Head', 'Neck'],
  Torso: ['Chest', 'Abdomen / core', 'Pelvis', 'Upper back', 'Lower back'],
  Arm: ['Shoulder', 'Upper arm', 'Elbow', 'Forearm', 'Wrist', 'Hand'],
  Leg: ['Hip', 'Thigh', 'Knee', 'Shin / calf', 'Ankle', 'Foot'],
} as const;

export type InjuryRegion = keyof typeof INJURY_REGIONS;
export type InjuryArea = (typeof INJURY_REGIONS)[InjuryRegion][number];
export type InjurySide = 'Left' | 'Right' | 'Both' | 'Center';
export type InjurySeverity = 'Minor' | 'Moderate' | 'Severe';

export interface Injury {
  id: string;
  region: InjuryRegion;
  area: InjuryArea;
  side: InjurySide;
  severity: InjurySeverity;
  notes: string;
  createdAt: string;
}

export type InjuryDraft = Omit<Injury, 'id' | 'createdAt'>;

export const SEVERITY_LABELS: Record<InjurySeverity, string> = {
  Minor: 'Minor · amber',
  Moderate: 'Moderate · orange',
  Severe: 'Severe · red',
};

export function injuryLabel(injury: Pick<Injury, 'area' | 'side'>): string {
  return injury.side === 'Center' ? injury.area : `${injury.side} ${injury.area}`;
}
