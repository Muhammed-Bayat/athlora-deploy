export type UserRole = 'coach' | 'assistant' | 'viewer';

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
export const DISCIPLINE_100M = '100m' as const;
export type Discipline = typeof DISCIPLINE_100M;

export const RESULT_UNIT_SECONDS = 'seconds' as const;
export type ResultUnit = typeof RESULT_UNIT_SECONDS;

export type ResultOutcome = 'no_result' | 'valid' | 'dq' | 'dnf' | 'dns';

export interface Athlete {
  id: string;
  coachId: string;
  name: string;
  dob: string | null;
  gender: string | null;
  squad: string | null;
  notes: string | null;
  archivedAt: string | null;
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
}

export type RsvpStatus = 'pending' | 'yes' | 'no';

export interface EventParticipant {
  eventId: string;
  athleteId: string;
  rsvpStatus: RsvpStatus;
}

export interface EventParticipantAthleteSummary {
  id: string;
  name: string;
  squad: string | null;
  archivedAt: string | null;
}

export interface EventParticipantSummary extends EventParticipant {
  athlete: EventParticipantAthleteSummary;
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
  recordedBy: string;
  version: number;
  deviceId: string | null;
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

export interface RosterSnapshotEntry {
  athleteId: string;
  name: string;
  squad: string | null;
  discipline: Discipline;
  pb: number | null;
}

export interface DashboardUpcomingEvent {
  eventId: string;
  title: string;
  type: EventType;
  date: string;
  status: EventStatus;
  athleteCount: number;
}

export interface DashboardSummary {
  athletesCount: number;
  activeAthletesCount: number;
  upcomingEventCount: number;
  seasonPbs: number;
  rosterSnapshot: RosterSnapshotEntry[];
  upcomingEvents: DashboardUpcomingEvent[];
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
