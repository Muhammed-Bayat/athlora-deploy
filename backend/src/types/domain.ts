export const USER_ROLES = ['coach', 'assistant'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export interface User {
  id: string;
  auth0Id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

// MVP discipline contract: fixed to 100m (track, timed) at the API/service boundary.
// The database stays permissive (discipline is TEXT) so future disciplines are added
// by new migrations without breaking this contract.
export const DISCIPLINE_100M = '100m' as const;
export type Discipline = typeof DISCIPLINE_100M;

export const RESULT_UNIT_SECONDS = 'seconds' as const;
export type ResultUnit = typeof RESULT_UNIT_SECONDS;

export const RESULT_OUTCOMES = ['no_result', 'valid', 'dq', 'dnf', 'dns'] as const;
export type ResultOutcome = (typeof RESULT_OUTCOMES)[number];

export const ATHLETE_LIFECYCLE_STATUSES = ['active', 'inactive', 'archived'] as const;
export type AthleteLifecycleStatus = (typeof ATHLETE_LIFECYCLE_STATUSES)[number];

export interface Athlete {
  id: string;
  coachId: string;
  name: string;
  dob: string | null;
  gender: string | null;
  squads?: Squad[];
  /** @deprecated migration-only compatibility; application reads use squads. */
  squad?: string | null;
  notes: string | null;
  archivedAt: string | null;
  status: AthleteLifecycleStatus;
  statusChangedAt: string;
  statusChangedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Squad {
  id: string;
  name: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const EVENT_TYPES = ['competition', 'training'] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_STATUSES = ['scheduled', 'in_progress', 'completed', 'cancelled'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export interface AthleticsEvent {
  id: string;
  createdBy: string;
  type: EventType;
  discipline: Discipline | null;
  title: string;
  date: string;
  time: string | null;
  locationName: string | null;
  latitude: number | null;
  longitude: number | null;
  status: EventStatus;
  createdAt: string;
  updatedAt: string;
}

export interface EventWeatherForecast {
  date: string;
  timezone: string;
  weatherCode: number;
  temperatureMinC: number;
  temperatureMaxC: number;
  precipitationProbabilityMaxPercent: number | null;
  windSpeedMaxKmh: number | null;
}

export interface CurrentWeather {
  timezone: string;
  temperatureC: number;
  apparentTemperatureC: number;
  humidityPercent: number;
  isDay: boolean;
  precipitationMm: number;
  weatherCode: number;
  windSpeedKmh: number;
}

export const RSVP_STATUSES = ['pending', 'yes', 'no', 'maybe'] as const;
export type RsvpStatus = (typeof RSVP_STATUSES)[number];

export interface EventParticipant {
  eventId: string;
  athleteId: string;
  rsvpStatus: RsvpStatus;
}

export interface EventParticipantAthleteSummary {
  id: string;
  name: string;
  squadNames?: string[];
  squad?: string | null;
  archivedAt: string | null;
  status?: AthleteLifecycleStatus;
}

export interface EventParticipantSummary extends EventParticipant {
  athlete: EventParticipantAthleteSummary;
  statusReviewRequired: boolean;
}

export const ENTRY_TYPES = ['attempt', 'split', 'penalty', 'note'] as const;
export type EntryType = (typeof ENTRY_TYPES)[number];

export const INCIDENT_TYPES = ['false_start', 'dq', 'dnf', 'dns', 'lane_infringement'] as const;
export type IncidentType = (typeof INCIDENT_TYPES)[number];

export interface TimelineEntry {
  id: string;
  eventId: string;
  athleteId: string;
  discipline: Discipline;
  entryType: EntryType;
  value: number | null;
  unit: ResultUnit | null;
  isFoul: boolean;
  incidentType: IncidentType | null;
  noteText: string | null;
  recordedBy: string | null;
  publicLoggerSessionId?: string | null;
  version: number;
  deviceId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export type InvitationStatus = 'active' | 'closed' | 'revoked';
export type GrantStatus = 'active' | 'revoked';

export interface EventHelperInvitation {
  id: string;
  eventId: string;
  secretHash: string;
  humanCode: string;
  maxCap: number;
  status: InvitationStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface EventHelperGrant {
  id: string;
  invitationId: string;
  eventId: string;
  auth0Sub: string;
  status: GrantStatus;
  redeemedAt: string;
}

export interface EventHelperAuditLog {
  id: string;
  eventId: string;
  invitationId: string | null;
  action: string;
  actorSub: string;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export interface Result {
  eventId: string;
  athleteId: string;
  discipline: Discipline;
  outcome: ResultOutcome;
  finalResult: number | null;
  unit: ResultUnit | null;
  placing: number | null;
  isPb: boolean;
  isSb: boolean;
  manualOverride: number | null;
  overrideReason: string | null;
  overriddenBy: string | null;
  overrideAt: string | null;
  updatedAt: string;
}

export interface AthleteStatistics {
  athleteId: string;
  discipline: Discipline;
  unit: ResultUnit;
  pb: number | null;
  sb: number | null;
  resultsCount: number;
  latestResult: number | null;
  latestOutcome: ResultOutcome;
  updatedAt: string;
}

export interface AggregateAthleteIdentity {
  id: string;
  name: string;
  squadNames?: string[];
  squad?: string | null;
  archivedAt: string | null;
  status?: AthleteLifecycleStatus;
}

export interface AggregateEventIdentity {
  id: string;
  title: string;
  type: EventType;
  discipline: Discipline;
  date: string;
  time: string | null;
  locationName: string | null;
  status: EventStatus;
}

export interface AthleteResultHistoryEntry {
  athlete: AggregateAthleteIdentity;
  event: AggregateEventIdentity;
  result: Result;
  effectiveResult: number | null;
  effectiveOutcome: ResultOutcome;
  countsTowardsStatistics: boolean;
}

export interface AthleteResultCounts {
  allTime: number;
  currentYear: number;
  competitionAllTime: number;
  trainingAllTime: number;
}

export interface AthleteStatisticsDetail extends AthleteStatistics {
  athlete: AggregateAthleteIdentity;
  resultCounts: AthleteResultCounts;
  latest: AthleteResultHistoryEntry | null;
  recentResults: {
    competitions: AthleteResultHistoryEntry[];
    training: AthleteResultHistoryEntry[];
  };
}

export interface RosterSnapshotEntry {
  athleteId: string;
  name: string;
  squadNames?: string[];
  squad?: string | null;
  discipline: Discipline;
  pb: number | null;
}

export interface DashboardUpcomingEvent {
  eventId: string;
  title: string;
  type: EventType;
  discipline: Discipline;
  date: string;
  time: string | null;
  locationName: string | null;
  status: EventStatus;
  athleteCount: number;
}

export interface DashboardTimelineEntry {
  entry: TimelineEntry;
  athlete: AggregateAthleteIdentity;
}

export interface DashboardActiveEvent {
  event: AggregateEventIdentity;
  progress: {
    participantCount: number;
    athletesWithEntriesCount: number;
    resolvedResultsCount: number;
    entryCount: number;
    completionPercent: number;
  };
  latestEntries: DashboardTimelineEntry[];
}

export interface DashboardSummary {
  state: 'live' | 'summary';
  asOfDate: string;
  athletesCount: number;
  activeAthletesCount: number;
  inactiveAthletesCount: number;
  archivedAthletesCount: number;
  statusReviewCount: number;
  upcomingEventCount: number;
  seasonPbs: number;
  activeEvent: DashboardActiveEvent | null;
  rosterSnapshot: RosterSnapshotEntry[];
  upcomingEvents: DashboardUpcomingEvent[];
  recentResults: AthleteResultHistoryEntry[];
  recentPbs: AthleteResultHistoryEntry[];
}

export const INJURY_REGIONS = {
  'Head & Neck': ['Head', 'Neck'],
  Torso: ['Chest', 'Abdomen / core', 'Pelvis', 'Upper back', 'Lower back'],
  Arm: ['Shoulder', 'Upper arm', 'Elbow', 'Forearm', 'Wrist', 'Hand'],
  Leg: ['Hip', 'Thigh', 'Knee', 'Shin / calf', 'Ankle', 'Foot'],
} as const;

export type InjuryRegion = keyof typeof INJURY_REGIONS;
export type InjuryArea = (typeof INJURY_REGIONS)[InjuryRegion][number];

export const INJURY_SIDES = ['Left', 'Right', 'Both', 'Center'] as const;
export type InjurySide = (typeof INJURY_SIDES)[number];

export const INJURY_SEVERITIES = ['Minor', 'Moderate', 'Severe'] as const;
export type InjurySeverity = (typeof INJURY_SEVERITIES)[number];

export interface AthleteInjury {
  id: string;
  workspaceId: string;
  athleteId: string;
  bodyRegion: InjuryRegion;
  region: InjuryRegion;
  area: InjuryArea;
  side: InjurySide;
  severity: InjurySeverity;
  notes: string | null;
  occurrenceDate: string | null;
  expectedReturnDate: string | null;
  resolvedDate: string | null;
  resolutionNotes: string | null;
  createdBy: string;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  deletedBy: string | null;
}

export interface AthleteInjuryAvailabilitySummary {
  hasActiveInjuries: boolean;
  activeSeverities: InjurySeverity[];
  availabilityStatus: 'available' | 'restricted' | 'unavailable';
}

export interface AthleteActiveInjurySummary {
  athleteId: string;
  activeInjuryCount: number;
  highestSeverity: InjurySeverity;
  activeInjuries: Array<Pick<AthleteInjury, 'bodyRegion' | 'area' | 'side' | 'severity'>>;
}

export interface ProgressionEntry {
  event: AggregateEventIdentity;
  result: Result;
  effectiveResult: number | null;
  effectiveOutcome: ResultOutcome;
  countsTowardsStatistics: boolean;
  runningPb: number | null;
  isNewPb: boolean;
}

export interface ProgressionSummary {
  allTimePb: number | null;
  totalResults: number;
  totalValid: number;
}

export interface ProgressionPagination {
  nextCursor: string | null;
  count: number;
  total: number;
}

export interface ProgressionDetail {
  athlete: AggregateAthleteIdentity;
  entries: ProgressionEntry[];
  pagination: ProgressionPagination;
  summary: ProgressionSummary;
}

export interface ComparisonAthleteAggregate {
  athlete: AggregateAthleteIdentity;
  pb: number | null;
  latestEffectiveResult: number | null;
  latestEffectiveOutcome: ResultOutcome;
  validResultCount: number;
  totalResultCount: number;
  average: number | null;
  consistency: number | null;
  improvement: number | null;
  progression: ProgressionEntry[];
}

export interface ComparisonDetail {
  athletes: [ComparisonAthleteAggregate, ComparisonAthleteAggregate];
}
