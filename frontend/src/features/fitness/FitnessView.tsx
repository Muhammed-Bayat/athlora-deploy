import { useState } from 'react';
import { Button } from '../../components';
import { ActiveInjuries } from './ActiveInjuries';
import { BodyViewer } from './BodyViewer';
import { InjuryEditor } from './InjuryEditor';
import type { Injury, InjuryDraft } from './injuryRegions';
import styles from './FitnessView.module.css';

interface FitnessViewProps {
  athleteName: string;
  athleteSquad: string | null;
  injuries: Injury[];
  onAddInjury: (injury: Injury) => void;
  onResolveInjury: (injuryId: string) => void;
  onBack: () => void;
}

function createInjury(draft: InjuryDraft): Injury {
  return {
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `injury-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    ...draft,
    createdAt: new Date().toISOString(),
  };
}

export function FitnessView({ athleteName, athleteSquad, injuries, onAddInjury, onResolveInjury, onBack }: FitnessViewProps) {
  const [preview, setPreview] = useState<InjuryDraft | null>(null);
  const initials = athleteName.split(/\s+/).filter(Boolean).slice(0, 2).map((name) => name[0]).join('').toUpperCase();

  return <section className={styles.fitness} aria-labelledby="fitness-heading">
    <header className={styles.header}>
      <div className={styles.headerIdentity}><span aria-hidden="true">{initials}</span><div><p className={styles.eyebrow}>Athlete performance</p><h1 id="fitness-heading">Fitness & injury map</h1><small>{athleteName} · {athleteSquad ?? 'Athletics'} squad</small></div></div>
      <div className={styles.headerActions}><span>{injuries.length} active {injuries.length === 1 ? 'injury' : 'injuries'}</span><Button variant="secondary" onClick={onBack}>Back to performance</Button></div>
    </header>
    <div className={styles.layout}>
      <InjuryEditor onPreview={setPreview} onSave={(draft) => onAddInjury(createInjury(draft))} />
      <BodyViewer injuries={injuries} preview={preview} />
      <ActiveInjuries injuries={injuries} onResolve={onResolveInjury} />
    </div>
  </section>;
}
