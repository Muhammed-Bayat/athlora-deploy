import type { MeetEntrant } from '../../types/meets';

export function memberSummary(entrant: MeetEntrant | undefined, entrants: MeetEntrant[]): string {
  if (!entrant || entrant.kind !== 'relay') return '';
  return entrant.memberIds
    .map((id) => entrants.find((item) => item.id === id)?.name ?? 'Member')
    .join(' → ');
}

type TeamSource = Pick<MeetEntrant, 'kind' | 'name' | 'clubName'> & { workspaceName: string | null };

export function standingsTeam(entrant: TeamSource | undefined): string {
  if (!entrant) return 'Team';
  if (entrant.kind === 'relay') return entrant.name;
  if (entrant.kind === 'guest') return entrant.clubName ?? 'Guest';
  return entrant.workspaceName || 'Athlete';
}

export function standingsMembers(entrant: MeetEntrant | undefined, entrants: MeetEntrant[]): string {
  if (!entrant) return '';
  if (entrant.kind === 'relay') return memberSummary(entrant, entrants);
  return entrant.name;
}
