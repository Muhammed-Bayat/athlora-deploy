import type { DisciplineDefinition, MeetEntrant, RelayLegResult, SafeRelayMember } from '../../types/meets';

export function memberSummary(entrant: MeetEntrant | undefined, entrants: MeetEntrant[]): string {
  if (!entrant || entrant.kind !== 'relay') return '';
  const fromIds = entrant.memberIds
    .map((id) => entrants.find((item) => item.id === id)?.name ?? '');
  const names = fromIds.some(Boolean) ? fromIds.filter(Boolean) : (entrant.members ?? []).map((member) => member.name);
  return names.join(' → ');
}

type TeamSource = Pick<MeetEntrant, 'kind' | 'name' | 'clubName'> & { workspaceName: string | null };

export function standingsTeam(entrant: TeamSource | undefined): string {
  if (!entrant) return 'Team';
  if (entrant.kind === 'relay') return entrant.name;
  if (entrant.kind === 'guest') return entrant.clubName ?? 'Guest';
  return entrant.workspaceName || 'Athlete';
}

export function standingsClub(entrant: TeamSource | undefined): string {
  if (!entrant) return 'Club';
  if (entrant.kind === 'relay') return entrant.clubName ?? entrant.workspaceName ?? 'Club';
  if (entrant.kind === 'guest') return entrant.clubName ?? 'Guest';
  return entrant.workspaceName || 'Athlete';
}

export function standingsMembers(entrant: MeetEntrant | undefined, entrants: MeetEntrant[]): string {
  if (!entrant) return '';
  if (entrant.kind === 'relay') return memberSummary(entrant, entrants);
  return entrant.name;
}

/** Relay members ordered by leg, whichever source (roster or official legs) is available. */
export function relayMembersOf(entrant: { members?: SafeRelayMember[] } | undefined, legs?: readonly RelayLegResult[] | null): Array<Pick<SafeRelayMember, 'relayMemberId' | 'leg' | 'name'>> {
  const fromRoster = (entrant?.members ?? []).map((member) => ({ relayMemberId: member.relayMemberId, leg: member.leg, name: member.name }));
  if (fromRoster.length > 0) return fromRoster;
  return (legs ?? []).map((leg) => ({ relayMemberId: leg.relayMemberId, leg: leg.leg, name: leg.name }));
}

/** One line per leg: the athlete's official split, or that they are still awaiting selection. */
export function relayLegLine(legs: readonly RelayLegResult[] | null | undefined, definition?: DisciplineDefinition): string {
  if (!legs || legs.length === 0) return 'Awaiting selection';
  return legs
    .map((leg) => `${leg.name} ${leg.value === null ? 'awaiting selection' : `${leg.value.toFixed(definition?.precision ?? 2)}${leg.isPb ? ' PB' : ''}${leg.isSb ? ' SB' : ''}`}`)
    .join(' · ');
}

export function relayLegCell(legs: readonly RelayLegResult[] | null | undefined, definition?: DisciplineDefinition): string {
  if (!legs || legs.length === 0) return '';
  return legs
    .map((leg) => `${leg.name} ${leg.value === null ? 'awaiting selection' : leg.value.toFixed(definition?.precision ?? 2)}`)
    .join('; ');
}
