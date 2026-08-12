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

export interface Athlete {
  id: string;
  coachId: string;
  name: string;
  dob: string | null;
  gender: string | null;
  squad: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export type EventType = 'competition' | 'training';
export type EventStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

export interface AthleticsEvent {
  id: string;
  createdBy: string;
  type: EventType;
  discipline: string | null;
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

export type EntryType = 'attempt' | 'split' | 'penalty' | 'note';
export type IncidentType = 'false_start' | 'dq' | 'dnf' | 'dns' | 'lane_infringement';

export interface TimelineEntry {
  id: string;
  eventId: string;
  athleteId: string;
  discipline: string;
  entryType: EntryType;
  value: number | null;
  unit: 'seconds' | 'metres' | 'cm' | null;
  isFoul: boolean;
  incidentType: IncidentType | null;
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
  discipline: string;
  finalResult: number | null;
  unit: string | null;
  placing: number | null;
  isPb: boolean;
  isSb: boolean;
  manualOverride: number | null;
  overrideReason: string | null;
  updatedAt: string;
}