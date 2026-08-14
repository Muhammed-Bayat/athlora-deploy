export const USER_ROLES = ['coach', 'assistant', 'viewer'] as const;
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

export interface Athlete {
  id: string;
  coachId: string;
  name: string;
  dob: string | null;
  gender: string | null;
  squad: string | null;
  notes: string | null;
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

export const RSVP_STATUSES = ['pending', 'yes', 'no'] as const;
export type RsvpStatus = (typeof RSVP_STATUSES)[number];

export interface EventParticipant {
  eventId: string;
  athleteId: string;
  rsvpStatus: RsvpStatus;
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
  recordedBy: string;
  version: number;
  deviceId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
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
