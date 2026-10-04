import type { DisciplineDefinition, RelayLegResult, SessionEntry } from '../types/meets.js';
import { deriveTrackTime, type Derivation } from './resultDerivation.js';

export interface RelayMemberRow {
  relayMemberId: string;
  leg: number;
  name: string;
  athleteId?: string | null;
}

export type RelaySelections = ReadonlyMap<string, string>;

function isLegAttempt(entry: SessionEntry | undefined): entry is SessionEntry {
  return Boolean(entry
    && !entry.deletedAt
    && entry.entryType === 'attempt'
    && !entry.isFoul
    && entry.incidentType === null
    && entry.value !== null
    && entry.value > 0);
}

/** Official result for each ordered relay leg; a leg is official only through its coach selection. */
export function relayLegResults(
  members: readonly RelayMemberRow[],
  entries: readonly SessionEntry[],
  selections: RelaySelections,
  precision: number,
): RelayLegResult[] {
  const active = entries.filter((entry) => !entry.deletedAt);
  return members.map((member) => {
    const selectedId = selections.get(member.relayMemberId) ?? null;
    const selected = selectedId ? active.find((entry) => entry.id === selectedId) : undefined;
    const official = isLegAttempt(selected) && selected.relayMemberId === member.relayMemberId ? selected : null;
    return {
      relayMemberId: member.relayMemberId,
      leg: member.leg,
      name: member.name,
      value: official && official.value !== null ? Number(official.value.toFixed(precision)) : null,
      outcome: official ? ('valid' as const) : ('no_result' as const),
      selectedEntryId: official ? official.id : null,
    };
  });
}

/** Team result = sum of the four official leg results; team-level incidents void the team. */
export function deriveRelayResult(
  definition: DisciplineDefinition,
  members: readonly RelayMemberRow[],
  entries: readonly SessionEntry[],
  selections: RelaySelections,
): Derivation {
  const teamLevel = entries
    .filter((entry) => !entry.deletedAt && entry.relayMemberId == null)
    // Legacy team-wide numbers are history, not relay splits: only incidents still count.
    .map((entry) => (entry.incidentType ? entry : { ...entry, value: null }));
  const team = deriveTrackTime(teamLevel, 'competition');
  if (team.outcome === 'dq' || team.outcome === 'dnf' || team.outcome === 'dns') return team;

  const legs = relayLegResults(members, entries, selections, definition.precision);
  if (legs.length === 0 || legs.some((leg) => leg.value === null)) {
    return { value: null, incident: null, outcome: 'no_result' };
  }
  const sum = legs.reduce((total, leg) => total + (leg.value ?? 0), 0);
  return { value: Number(sum.toFixed(definition.precision)), incident: null, outcome: 'valid' };
}
