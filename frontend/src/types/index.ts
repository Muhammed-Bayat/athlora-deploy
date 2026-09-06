export type UserRole = 'coach' | 'assistant';

export interface User {
  id: string;
  auth0Id: string;
  name: string;
  email: string;
  role: UserRole;
  consentAcceptedAt: string | null;
  consentVersion: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  timezone: string;
  role: UserRole;
}

export interface WorkspaceMember {
  userId: string;
  name: string;
  email: string;
  role: 'coach' | 'assistant';
  createdAt: string;
}

export interface WorkspaceInvitation {
  id: string;
  email: string;
  role: 'coach' | 'assistant';
  expiresAt: string;
  createdAt: string;
  token?: string;
}

export interface Club {
  id: string;
  workspaceId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export type ClubJoinRequestStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';

export interface ClubJoinRequest {
  id: string;
  clubId: string;
  userId: string;
  status: ClubJoinRequestStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  clubName?: string;
  userName?: string;
  userEmail?: string;
}

// MVP discipline contract: fixed to 100m (track, timed) at the API/service boundary.
export const DISCIPLINE_100M = '100m' as const;
export type Discipline = typeof DISCIPLINE_100M;

export const RESULT_UNIT_SECONDS = 'seconds' as const;
export type ResultUnit = typeof RESULT_UNIT_SECONDS;

export type ResultOutcome = 'no_result' | 'valid' | 'dq' | 'dnf' | 'dns';
export type AthleteStatus = 'active' | 'inactive' | 'archived';

export interface Athlete {
  id: string;
  coachId: string;
  name: string;
  dob: string | null;
  gender: string | null;
  squads?: Squad[];
  squad?: string | null;
  notes: string | null;
  archivedAt: string | null;
  status: AthleteStatus;
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

export interface AthleteMutationPayload {
  name: string;
  dob: string | null;
  gender: string | null;
  squadIds?: string[];
  squad?: string | null;
  notes: string | null;
}

export interface AthleteListFilters {
  includeArchived?: boolean;
  status?: AthleteStatus;
  name?: string;
  squadId?: string;
  squad?: string;
}

export type EventType = 'competition' | 'training';
export type EventStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

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

export interface VenueSearchResult {
  displayName: string;
  latitude: number;
  longitude: number;
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

export interface EventMutationPayload {
  type: EventType;
  discipline: Discipline;
  title: string;
  date: string;
  time: string | null;
  locationName: string | null;
  latitude: number | null;
  longitude: number | null;
  status: EventStatus;
}

export interface EventListFilters {
  type?: EventType;
  status?: EventStatus;
  dateFrom?: string;
  dateTo?: string;
}

export type RsvpStatus = 'pending' | 'yes' | 'no' | 'maybe';

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
  status: AthleteStatus;
}

export interface EventParticipantSummary extends EventParticipant {
  athlete: EventParticipantAthleteSummary;
  statusReviewRequired: boolean;
}

export type FixtureInvitationStatus = 'pending' | 'accepted' | 'declined' | 'change_requested' | 'revoked';
export type FixtureWorkspaceStatus = 'accepted' | 'reacceptance_required' | 'withdrawn';

export interface FixtureInvitation {
  id: string;
  eventId: string;
  email: string | null;
  revision: number;
  status: FixtureInvitationStatus;
  expiresAt: string;
  createdAt: string;
  targetWorkspaceId: string | null;
  targetWorkspaceName?: string | null;
  responseMessage: string | null;
  respondedAt: string | null;
  respondedWorkspaceId: string | null;
  respondedWorkspaceName: string | null;
  respondedByName: string | null;
}

export interface IncomingFixtureInvitation extends FixtureInvitation {
  event: AthleticsEvent;
}

export interface FixtureTeam {
  workspaceId: string;
  workspaceName: string;
  status: FixtureWorkspaceStatus;
  acceptedRevision: number;
  withdrawnAt: string | null;
}

export interface FixtureDetail {
  event: AthleticsEvent;
  revision: number;
  teamStatus: FixtureWorkspaceStatus;
  teams: FixtureTeam[];
}

export interface FixtureTeamRoster {
  team: FixtureTeam;
  participants: EventParticipantSummary[];
}

export type FixtureNotificationKind = 'fixture_invited' | 'fixture_responded' | 'fixture_reacceptance_required' | 'fixture_started';

export interface FixtureNotification {
  id: string;
  eventId: string;
  invitationId: string | null;
  kind: FixtureNotificationKind;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

export type EntryType = 'attempt' | 'split' | 'penalty' | 'note';
export type IncidentType = 'false_start' | 'dq' | 'dnf' | 'dns' | 'lane_infringement' | null;

export interface TimelineEntry {
  id: string;
  eventId: string;
  athleteId: string;
  discipline: Discipline;
  entryType: EntryType;
  value: number | null;
  unit: ResultUnit | null;
  isFoul: boolean;
  incidentType: IncidentType;
  noteText: string | null;
  recordedBy: string | null;
  publicLoggerSessionId?: string | null;
  version: number;
  deviceId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface TimelineEntryCreatePayload {
  athleteId: string;
  discipline?: Discipline;
  entryType: EntryType;
  value?: number | null;
  unit?: ResultUnit | null;
  isFoul?: false;
  incidentType?: IncidentType;
  noteText?: string | null;
  deviceId?: string | null;
}

export interface TimelineEntryPatchPayload {
  expectedVersion: number;
  entryType?: EntryType;
  value?: number | null;
  incidentType?: IncidentType;
  noteText?: string | null;
}

export interface TimelineEntryDeletePayload {
  expectedVersion: number;
}

export type PublicTimelineEntry = Omit<TimelineEntry, 'recordedBy' | 'publicLoggerSessionId' | 'deviceId' | 'updatedAt' | 'deletedAt'>;

export interface PublicLoggerLink {
  id: string;
  eventId: string;
  status: 'active' | 'revoked';
  createdAt: string;
  revokedAt: string | null;
}

export interface PublicLoggerSnapshot {
  event: Pick<AthleticsEvent, 'id' | 'title' | 'status'>;
  participants: Array<{ athleteId: string; name: string }>;
  timeline: PublicTimelineEntry[];
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

export type ResultOverridePayload =
  | { manualOverride: number; overrideReason: string }
  | { manualOverride: null; overrideReason: null };

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

export interface ApiError {
  error: {
    code: string;
    message: string;
    details: Record<string, unknown>;
  };
}

export interface ApiList<T> {
  data: T[];
  meta: { count: number };
}

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

export interface AthleteActiveInjurySummary {
  athleteId: string;
  activeInjuryCount: number;
  highestSeverity: InjurySeverity;
  activeInjuries: Array<Pick<Injury, 'bodyRegion' | 'area' | 'side' | 'severity'>>;
}

export type InjuryDraft = Omit<Injury, 'id' | 'workspaceId' | 'athleteId' | 'resolvedDate' | 'resolutionNotes' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'deletedBy'>;

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
