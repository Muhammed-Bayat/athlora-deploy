import type { EntryType, EventStatus, IncidentType, ResultOutcome, RsvpStatus, UserRole } from './domain.js';

export interface SessionTarget {
  disciplineSessionId: string;
  entrantId: string;
}

export type MeetActor =
  | { userId: string; workspaceId: string; role: UserRole }
  | { publicLoggerSessionId: string; publicLoggerLinkId: string; publicLoggerName: string; publicLoggerClub: string };

export interface DisciplineDefinition {
  id: string;
  code: string;
  version: number;
  kind: 'track' | 'field' | 'relay' | 'vertical';
  unit: 'seconds' | 'metres' | 'cm';
  direction: 'lower' | 'higher';
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
  precision: number;
  presentation: { label: string; unitLabel?: string };
  createdAt: string;
  source: string;
}

export interface DisciplineSession {
  resultState?: 'provisional' | 'final' | 'reopened';
  verticalConfig?: VerticalConfig | null;
  id: string;
  eventId: string;
  workspaceId: string;
  disciplineDefinitionId: string;
  label: string;
  status: EventStatus;
  version: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface MeetEntrant {
  id: string;
  eventId: string;
  workspaceId: string;
  kind: 'athlete' | 'guest' | 'relay';
  athleteId: string | null;
  name: string;
  clubName: string | null;
  details: string | null;
  memberIds: string[];
  members?: SafeRelayMember[];
  workspaceName: string;
  rsvpStatus: RsvpStatus | null;
  createdBy: string;
  createdAt: string;
}

export interface SessionRegistration extends SessionTarget {
  id: string;
  eventId: string;
  workspaceId: string;
  withdrawnAt: string | null;
  withdrawnBy: string | null;
  createdBy: string;
  createdAt: string;
}
export interface BulkRosterAddInput { athleteIds: string[] }
export interface BulkRosterAddResult {
  participants: Array<{ eventId: string; athleteId: string; rsvpStatus: RsvpStatus }>;
  entrants: MeetEntrant[];
  registrations: SessionRegistration[];
}

export interface SessionEntry extends SessionTarget {
  verticalState?: VerticalState | null;
  attemptOrder?: number | null;
  relayMemberId?: string | null;
  id: string;
  eventId: string;
  workspaceId: string;
  entryType: EntryType;
  value: number | null;
  unit: DisciplineDefinition['unit'] | null;
  isFoul: boolean;
  incidentType: IncidentType | null;
  noteText: string | null;
  recordedBy: string | null;
  publicLoggerSessionId: string | null;
  recordedWorkspaceId?: string | null;
  recorderName?: string | null;
  canEdit?: boolean;
  canUndo?: boolean;
  version: number;
  deviceId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** One relay athlete's official leg inside a team result. */
export interface RelayLegResult {
  relayMemberId: string;
  leg: number;
  name: string;
  value: number | null;
  outcome: ResultOutcome;
  selectedEntryId: string | null;
  isPb?: boolean;
  isSb?: boolean;
}

export interface SessionResult extends SessionTarget {
  finalPlace?: number | null;
  vertical?: VerticalSummary;
  relayLegs?: RelayLegResult[];
  isPb?: boolean;
  isSb?: boolean;
  id: string;
  eventId: string;
  workspaceId: string;
  outcome: ResultOutcome;
  finalResult: number | null;
  unit: DisciplineDefinition['unit'];
  manualOverride: number | null;
  overrideReason: string | null;
  overriddenBy: string | null;
  overrideAt: string | null;
  selectedEntryId: string | null;
  effectiveResult: number | null;
  effectiveOutcome: ResultOutcome;
  countsTowardsStatistics: boolean;
  placing: number | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface EventFinalResult {
  entrantId: string;
  name: string;
  clubName: string;
  discipline: string;
  disciplineLabel: string;
  finalResult: number | null;
  outcome: ResultOutcome;
  unit: DisciplineDefinition['unit'];
  precision: number;
  placing: number | null;
  relayMembers: string[];
  relayLegs?: RelayLegResult[];
}

export interface SessionStatistics {
  disciplineSessionId: string;
  entrantId: string | null;
  disciplineDefinitionId: string;
  unit: DisciplineDefinition['unit'];
  direction: DisciplineDefinition['direction'];
  resultCount: number;
  validResultCount: number;
  best: number | null;
}

export type VerticalState = 'clearance' | 'failure' | 'pass' | 'void';
export interface VerticalConfig { startingHeight: number; heightIncrement: number; failureLimit: number; round: 'qualification' | 'final' }
export interface VerticalSummary { failuresAtBest: number; totalFailures: number; consecutiveFailures: number; eliminated: boolean }
export interface SessionCreateInput { disciplineDefinitionId: string; label: string; verticalConfig?: VerticalConfig }
export interface SessionStateInput { status: EventStatus; expectedVersion: number }
export type EntrantCreateInput =
  | { kind: 'athlete'; athleteId: string }
  | { kind: 'guest'; name: string; clubName: string | null; details: string | null }
  | { kind: 'relay'; name: string; memberIds: string[] };
export interface EntrantUpdateInput { name?: string; memberIds?: string[] }
export interface SessionSelectionInput { entryId: string | null; expectedVersion: number; relayMemberId?: string | null }
export interface SafeRelayMember { relayMemberId: string; leg: number; name: string; isGuest: boolean }
export interface SessionEntryInput {
  verticalState?: VerticalState | null;
  relayMemberId?: string | null;
  entryType: EntryType;
  value: number | null;
  unit: DisciplineDefinition['unit'] | null;
  isFoul: boolean;
  incidentType: IncidentType | null;
  noteText: string | null;
  deviceId: string | null;
}
export interface SessionEntryReplacement extends SessionEntryInput { expectedVersion: number }
export interface SessionOverrideInput { manualOverride: number | null; overrideReason: string | null; expectedVersion: number }
