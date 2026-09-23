export const USER_ROLES = ['coach', 'assistant'] as const;
export type UserRole = (typeof USER_ROLES)[number];

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

export interface ClubBranding {
  description: string | null;
  primaryColor: string | null;
  accentColor: string | null;
  logoUrl: string | null;
  logoContentType: string | null;
  coverUrl: string | null;
  coverContentType: string | null;
}

export interface ClubBrandSummary {
  description?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
  logoUrl?: string | null;
  coverUrl?: string | null;
}

export interface Club {
  id: string;
  workspaceId: string;
  name: string;
  branding?: ClubBrandSummary;
  createdAt: string;
  updatedAt: string;
}

export interface ClubPublication {
  publicResultsEnabled: boolean;
  publicScheduleEnabled: boolean;
}

export interface ClubAthleteLookup {
  id: string;
  name: string;
  status: AthleteLifecycleStatus;
}

export interface ClubRosterCounts {
  active: number;
  inactive: number;
  archived: number;
  total: number;
}

export interface ClubStatistics {
  season?: SeasonScopeMetadata;
  club: Pick<Club, 'id' | 'name'> & { branding?: ClubBrandSummary };
  roster: ClubRosterCounts;
  distinctAthletesWithValidResults: number;
  total100mResultCount: number;
  valid100mResultCount: number;
  fastestValidTime: number | null;
  latestValidTime: number | null;
  averageValidTime: number | null;
  medianValidTime: number | null;
  populationStandardDeviation: number | null;
}

export interface ClubComparisonDetail {
  clubs: [ClubStatistics, ClubStatistics];
}

export interface ClubMultiComparisonDetail {
  clubs: ClubStatistics[];
}

export interface PublicClub {
  id: string;
  name: string;
  branding?: ClubBrandSummary;
}

export interface PublicScheduleEvent {
  id: string;
  title: string;
  date: string;
  time: string | null;
  type: EventType;
  discipline: Discipline | null;
  locationName: string | null;
  status: EventStatus;
}

export interface PublicClubSchedule {
  club: PublicClub;
  events: PublicScheduleEvent[];
}

export interface PublicAthleteStatistics {
  athlete: { id: string; name: string };
  pb: number | null;
  latestEffectiveResult: number | null;
  validResultCount: number;
  totalResultCount: number;
  average: number | null;
  consistency: number | null;
  improvement: number | null;
}

export interface PublicClubStatistics extends ClubStatistics {
  athletes: PublicAthleteStatistics[];
}

export interface PublicAthleteComparisonEntry {
  date: string;
  result: number;
}

export interface PublicAthleteComparisonAthlete extends PublicAthleteStatistics {
  club: Pick<Club, 'id' | 'name'>;
  progression: PublicAthleteComparisonEntry[];
}

export interface PublicAthleteComparison {
  athletes: PublicAthleteComparisonAthlete[];
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
  timezone: string | null;
  weatherCode: string;
  temperatureMinC: number | null;
  temperatureMaxC: number | null;
  precipitationProbabilityMaxPercent: number | null;
  windSpeedKmh: number | null;
}

export interface CurrentWeather {
  timezone: string | null;
  temperatureC: number | null;
  apparentTemperatureC: number | null;
  humidityPercent: number | null;
  isDay: boolean | null;
  precipitationRateMmHr: number | null;
  weatherCode: string;
  windSpeedKmh: number | null;
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
  participantWorkspaceId?: string | null;
  participantWorkspaceName?: string | null;
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
  recorderName?: string | null;
  recorderClub?: string | null;
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
  season?: SeasonScopeMetadata;
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
  season?: SeasonScopeMetadata;
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
  season?: SeasonScopeMetadata;
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
  season?: SeasonScopeMetadata;
  athletes: [ComparisonAthleteAggregate, ComparisonAthleteAggregate];
}

export interface MultiComparisonDetail {
  season?: SeasonScopeMetadata;
  athletes: ComparisonAthleteAggregate[];
}

export interface SeasonScopeMetadata {
  selected: number | 'all';
  startDate: string | null;
  endDate: string | null;
  available: number[];
}

export const DASHBOARD_CARD_IDS = [
  'season-selector',
  'hero',
  'status-attention',
  'stats',
  'roster-snapshot',
  'upcoming-events',
  'pb-trend',
  'recent-results',
  'recent-pbs',
] as const;
export type DashboardCardId = (typeof DASHBOARD_CARD_IDS)[number];

export const REQUIRED_DASHBOARD_CARD_IDS = [
  'season-selector',
  'hero',
  'status-attention',
] as const satisfies readonly DashboardCardId[];

export const HIDEABLE_DASHBOARD_CARD_IDS = [
  'stats',
  'roster-snapshot',
  'upcoming-events',
  'pb-trend',
  'recent-results',
  'recent-pbs',
] as const satisfies readonly DashboardCardId[];

export const DEFAULT_DASHBOARD_CARD_ORDER: readonly DashboardCardId[] = DASHBOARD_CARD_IDS;

export const PREFERENCE_SURFACES = ['dashboard', 'events', 'roster'] as const;
export type PreferenceSurface = (typeof PREFERENCE_SURFACES)[number];

export interface SavedFilterPreset {
  id: string;
  surface: PreferenceSurface;
  name: string;
  filters: Record<string, unknown>;
}

export interface UserPreferences {
  dashboardCardOrder: DashboardCardId[];
  dashboardHiddenCards: DashboardCardId[];
  dashboardSavedFilters: SavedFilterPreset[];
}
