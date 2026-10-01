import type { IncidentType } from '../../types';
import type { DisciplineDefinition } from '../../types/meets';

export interface IncidentButton { value: IncidentType; label: string; title: string }

const FALSE_START: IncidentButton = { value: 'false_start', label: 'False Start', title: 'False Start' };
const LANE_INFRINGEMENT: IncidentButton = { value: 'lane_infringement', label: 'Lane Inf.', title: 'Lane Infringement' };
const DQ: IncidentButton = { value: 'dq', label: 'DQ', title: 'Disqualified' };
const DNF: IncidentButton = { value: 'dnf', label: 'DNF', title: 'Did Not Finish' };
const DNS: IncidentButton = { value: 'dns', label: 'DNS', title: 'Did Not Start' };

// Throws and horizontal jumps have no start or lane; races beyond one lap drop lane incidents.
export function incidentButtons(definition: DisciplineDefinition): IncidentButton[] {
  if (definition.kind === 'field') return [DQ, DNF, DNS];
  if (definition.kind === 'track' && (definition.defaultRules.distance ?? 0) > 400) {
    return [FALSE_START, DQ, DNF, DNS];
  }
  return [FALSE_START, LANE_INFRINGEMENT, DQ, DNF, DNS];
}
