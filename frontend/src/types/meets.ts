import type { EntryType, EventStatus, IncidentType, ResultOutcome, RsvpStatus } from './index';

export interface SessionTarget { disciplineSessionId: string; entrantId: string }
export interface DisciplineDefinition {
  id: string; code: string; version: number; kind: 'track' | 'field' | 'relay' | 'vertical';
  unit: 'seconds' | 'metres' | 'cm'; direction: 'lower' | 'higher';
  defaultRules: {
    aggregation: 'timed' | 'best' | 'vertical';
    entrantType: 'individual' | 'relay';
    teamSize?: number;
    distance?: number;
    hurdleHeight?: number;
    hurdleCount?: number;
    attempts?: number;
    failureLimit?: number;
    heightIncrement?: number;
    round?: 'qualification' | 'final';
  };
  precision: number; presentation: { label: string; unitLabel?: string }; createdAt: string; source: string;
}
export interface DisciplineSession {
  resultState?: 'provisional' | 'final' | 'reopened';
  verticalConfig?: VerticalConfig | null;
  id: string; eventId: string; workspaceId: string; disciplineDefinitionId: string; label: string;
  status: EventStatus; version: number; createdBy: string; updatedBy: string; createdAt: string; updatedAt: string;
}
export interface MeetEntrant {
  id: string; eventId: string; workspaceId: string; kind: 'athlete' | 'guest' | 'relay';
  athleteId: string | null; name: string; clubName: string | null; details: string | null; memberIds: string[]; createdBy: string; createdAt: string;
  members?: SafeRelayMember[];
  workspaceName: string; rsvpStatus: RsvpStatus | null;
}
export interface SessionRegistration extends SessionTarget {
  id: string; eventId: string; workspaceId: string; withdrawnAt: string | null;
  withdrawnBy: string | null; createdBy: string; createdAt: string;
}
export interface BulkRosterAddResult {
  participants: Array<{ eventId: string; athleteId: string; rsvpStatus: RsvpStatus }>;
  entrants: MeetEntrant[];
  registrations: SessionRegistration[];
}
// Type alias (not interface) so the shape stays assignable to the offline
// queue's Record<string, unknown> payload boundary.
export type SessionEntryInput = {
  verticalState?: 'clearance' | 'failure' | 'pass' | 'void' | null;
  relayMemberId?: string | null;
  entryType: EntryType; value: number | null; unit: DisciplineDefinition['unit'] | null;
  isFoul: boolean; incidentType: IncidentType | null; noteText: string | null; deviceId: string | null;
}
export interface SessionEntryReplacement extends SessionEntryInput { expectedVersion: number }
export interface SessionEntry extends SessionEntryInput, SessionTarget {
  attemptOrder?: number | null;
  id: string; eventId: string; workspaceId: string; recordedBy: string | null; publicLoggerSessionId: string | null;
  recorderName?: string | null;
  recordedWorkspaceId?: string | null;
  canEdit?: boolean;
  canUndo?: boolean;
  version: number; createdAt: string; updatedAt: string; deletedAt: string | null;
}
export interface RelayLegResult {
  relayMemberId: string; leg: number; name: string;
  value: number | null; outcome: ResultOutcome; selectedEntryId: string | null;
  isPb?: boolean; isSb?: boolean;
}
export interface SessionResult extends SessionTarget {
  relayLegs?: RelayLegResult[];
  finalPlace?: number | null;
  vertical?: { failuresAtBest: number; totalFailures: number; consecutiveFailures: number; eliminated: boolean };
  isPb?: boolean; isSb?: boolean;
  id: string; eventId: string; workspaceId: string; outcome: ResultOutcome; finalResult: number | null;
  unit: DisciplineDefinition['unit']; manualOverride: number | null; overrideReason: string | null;
  overriddenBy: string | null; overrideAt: string | null; selectedEntryId: string | null;
  effectiveResult: number | null;
  effectiveOutcome: ResultOutcome; countsTowardsStatistics: boolean; placing: number | null;
  version: number; createdAt: string; updatedAt: string;
}
export interface EventFinalResult {
  entrantId: string; name: string; clubName: string; discipline: string; disciplineLabel: string;
  finalResult: number | null; outcome: ResultOutcome; unit: DisciplineDefinition['unit']; precision: number;
  placing: number | null; relayMembers: string[];
  relayLegs?: RelayLegResult[];
}
export interface SessionStatistics {
  disciplineSessionId: string; entrantId: string | null; disciplineDefinitionId: string;
  unit: DisciplineDefinition['unit']; direction: DisciplineDefinition['direction'];
  resultCount: number; validResultCount: number; best: number | null;
}
export type EntrantCreateInput = { kind: 'athlete'; athleteId: string }
  | { kind: 'guest'; name: string; clubName?: string | null; details?: string | null } | { kind: 'relay'; name: string; memberIds: string[] };
export interface EntrantUpdateInput { name?: string; memberIds?: string[] }
export interface SessionSelectionInput { entryId: string | null; expectedVersion: number; relayMemberId?: string | null }
export interface SafeRelayMember { relayMemberId: string; leg: number; name: string; isGuest: boolean }
export interface SessionOverrideInput { manualOverride: number | null; overrideReason: string | null; expectedVersion: number }
export interface SafeRelayMember { relayMemberId: string; leg: number; name: string; isGuest: boolean }
export interface VerticalConfig { startingHeight: number; heightIncrement: number; failureLimit: number; round: 'qualification' | 'final' }

export interface PublicMeetEntrant {
  id: string;
  name: string;
  kind: MeetEntrant['kind'];
  workspaceName: string | null;
  clubName: string | null;
  attending: boolean;
  members: SafeRelayMember[];
}

export type PublicSessionEntry = Pick<SessionEntry,
  'id' | 'eventId' | 'disciplineSessionId' | 'entrantId' | 'verticalState' | 'attemptOrder' | 'relayMemberId'
  | 'entryType' | 'value' | 'unit' | 'isFoul' | 'incidentType' | 'version' | 'createdAt' | 'recorderName'
> & { canEdit: boolean; canUndo: boolean };

export interface PublicMeetSession {
  id: string;
  label: string;
  disciplineDefinitionId: string;
  status: EventStatus;
  resultState?: DisciplineSession['resultState'];
  version: number;
  verticalConfig?: VerticalConfig | null;
  entrantIds: string[];
  entries: PublicSessionEntry[];
  results: Array<Pick<SessionResult, 'entrantId' | 'outcome' | 'placing' | 'vertical' | 'selectedEntryId'>
    & { value: number | null; relayLegs?: RelayLegResult[] | null }>;
}

export interface PublicMeetLoggerSnapshot {
  disciplines: DisciplineDefinition[];
  entrants: PublicMeetEntrant[];
  sessions: PublicMeetSession[];
}

export function isSessionTarget(value: unknown): value is SessionTarget {
  if (!value || typeof value !== 'object') return false;
  const target = value as Partial<SessionTarget>;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return typeof target.disciplineSessionId === 'string' && uuid.test(target.disciplineSessionId)
    && typeof target.entrantId === 'string' && uuid.test(target.entrantId);
}
