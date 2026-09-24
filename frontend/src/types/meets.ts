import type { EntryType, EventStatus, IncidentType, ResultOutcome } from './index';

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
    steeplechase?: boolean;
    raceWalk?: boolean;
    attempts?: number;
    failureLimit?: number;
    heightIncrement?: number;
    round?: 'qualification' | 'final';
  };
  precision: number; presentation: { label: string; unitLabel?: string }; createdAt: string; source: string;
}
export interface DisciplineSession {
  verticalConfig?: VerticalConfig | null;
  id: string; eventId: string; workspaceId: string; disciplineDefinitionId: string; label: string;
  status: EventStatus; version: number; createdBy: string; updatedBy: string; createdAt: string; updatedAt: string;
}
export interface MeetEntrant {
  id: string; eventId: string; workspaceId: string; kind: 'athlete' | 'guest' | 'relay';
  athleteId: string | null; name: string; clubName: string | null; details: string | null; memberIds: string[]; createdBy: string; createdAt: string;
}
export interface SessionRegistration extends SessionTarget {
  id: string; eventId: string; workspaceId: string; withdrawnAt: string | null;
  withdrawnBy: string | null; createdBy: string; createdAt: string;
}
export interface SessionEntryInput {
  verticalState?: 'clearance' | 'failure' | 'pass' | 'void' | null;
  entryType: EntryType; value: number | null; unit: DisciplineDefinition['unit'] | null;
  isFoul: boolean; incidentType: IncidentType | null; noteText: string | null; deviceId: string | null;
}
export interface SessionEntry extends SessionEntryInput, SessionTarget {
  attemptOrder?: number | null;
  id: string; eventId: string; workspaceId: string; recordedBy: string | null; publicLoggerSessionId: string | null;
  version: number; createdAt: string; updatedAt: string; deletedAt: string | null;
}
export interface SessionResult extends SessionTarget {
  vertical?: { failuresAtBest: number; totalFailuresToBest: number; consecutiveFailures: number; eliminated: boolean };
  isPb?: boolean; isSb?: boolean;
  id: string; eventId: string; workspaceId: string; outcome: ResultOutcome; finalResult: number | null;
  unit: DisciplineDefinition['unit']; manualOverride: number | null; overrideReason: string | null;
  overriddenBy: string | null; overrideAt: string | null; selectedEntryId: string | null;
  effectiveResult: number | null;
  effectiveOutcome: ResultOutcome; countsTowardsStatistics: boolean; placing: number | null;
  version: number; createdAt: string; updatedAt: string;
}
export interface SessionStatistics {
  disciplineSessionId: string; entrantId: string | null; disciplineDefinitionId: string;
  unit: DisciplineDefinition['unit']; direction: DisciplineDefinition['direction'];
  resultCount: number; validResultCount: number; best: number | null;
}
export type EntrantCreateInput = { kind: 'athlete'; athleteId: string }
  | { kind: 'guest'; name: string; clubName?: string | null; details?: string | null } | { kind: 'relay'; name: string; memberIds: string[] };
export interface EntrantUpdateInput { name?: string; memberIds?: string[] }
export interface SessionSelectionInput { entryId: string | null; expectedVersion: number }
export interface SafeRelayMember { leg: number; name: string; isGuest: boolean }
export interface SessionOverrideInput { manualOverride: number | null; overrideReason: string | null; expectedVersion: number }
export interface VerticalConfig { startingHeight: number; heightIncrement: number; failureLimit: number; round: 'qualification' | 'final' }

export function isSessionTarget(value: unknown): value is SessionTarget {
  if (!value || typeof value !== 'object') return false;
  const target = value as Partial<SessionTarget>;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return typeof target.disciplineSessionId === 'string' && uuid.test(target.disciplineSessionId)
    && typeof target.entrantId === 'string' && uuid.test(target.entrantId);
}
