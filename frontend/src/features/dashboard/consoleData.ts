export const SQUADS = ['Sprint', 'Middle Distance', 'Distance', 'Jumps', 'Throws'] as const;
export const STATUSES = ['Active', 'Peaking', 'Resting', 'Injured'] as const;
export const EVENT_TYPES = ['Meet', 'Time Trial', 'Training Camp', 'Away Meet'] as const;

export type Squad = (typeof SQUADS)[number];
export type AthleteStatus = (typeof STATUSES)[number];
export type EventType = (typeof EVENT_TYPES)[number];
export type ConsoleView = 'dashboard' | 'athletes' | 'events' | 'live';
export type WeatherPreset = 'clear' | 'partly' | 'cloudy' | 'fog' | 'rain' | 'snow' | 'storm' | 'night' | 'night-rain';

export interface Athlete {
  id: number;
  name: string;
  bib: number;
  discipline: string;
  squad: Squad;
  status: AthleteStatus;
  pb: string;
  notes: string;
  history: number[];
}

export interface ConsoleEvent {
  id: number;
  name: string;
  type: EventType;
  date: string;
  location: string;
  notes: string;
  athleteIds: number[];
}

export const DISCIPLINES: ReadonlyArray<{ name: string; squad: Squad; placeholder: string }> = [
  { name: '100m', squad: 'Sprint', placeholder: 'e.g. 11.24s' },
  { name: '200m', squad: 'Sprint', placeholder: 'e.g. 22.90s' },
  { name: '400m', squad: 'Sprint', placeholder: 'e.g. 47.85s' },
  { name: '100m Hurdles', squad: 'Sprint', placeholder: 'e.g. 13.02s' },
  { name: '110m Hurdles', squad: 'Sprint', placeholder: 'e.g. 14.10s' },
  { name: '400m Hurdles', squad: 'Sprint', placeholder: 'e.g. 51.40s' },
  { name: '800m', squad: 'Middle Distance', placeholder: 'e.g. 2:03.45' },
  { name: '1500m', squad: 'Middle Distance', placeholder: 'e.g. 4:12.30' },
  { name: '5000m', squad: 'Distance', placeholder: 'e.g. 15:42.10' },
  { name: '10000m', squad: 'Distance', placeholder: 'e.g. 32:20.00' },
  { name: 'Marathon', squad: 'Distance', placeholder: 'e.g. 2:24:10' },
  { name: 'Long Jump', squad: 'Jumps', placeholder: 'e.g. 7.40m' },
  { name: 'Triple Jump', squad: 'Jumps', placeholder: 'e.g. 15.10m' },
  { name: 'High Jump', squad: 'Jumps', placeholder: 'e.g. 2.02m' },
  { name: 'Pole Vault', squad: 'Jumps', placeholder: 'e.g. 5.15m' },
  { name: 'Shot Put', squad: 'Throws', placeholder: 'e.g. 16.88m' },
  { name: 'Discus', squad: 'Throws', placeholder: 'e.g. 55.20m' },
  { name: 'Javelin', squad: 'Throws', placeholder: 'e.g. 68.40m' },
  { name: 'Hammer Throw', squad: 'Throws', placeholder: 'e.g. 70.10m' },
];

export const fixtureAthletes: Athlete[] = [
  { id: 1, name: 'Amara Chen', bib: 14, discipline: '100m', squad: 'Sprint', status: 'Active', pb: '11.24s', notes: 'Strong start phase, working on top-end speed mechanics.', history: [68, 71, 70, 74, 76, 75, 79] },
  { id: 2, name: 'Josiah Okafor', bib: 7, discipline: '400m', squad: 'Sprint', status: 'Active', pb: '47.85s', notes: 'Focus block: lactate tolerance sessions on Tuesdays.', history: [60, 63, 65, 64, 68, 70, 72] },
  { id: 3, name: 'Liya Bekele', bib: 21, discipline: '5000m', squad: 'Distance', status: 'Active', pb: '15:42.10', notes: 'Base building phase, high weekly mileage.', history: [55, 58, 60, 62, 63, 66, 68] },
  { id: 4, name: 'Mateo Rossi', bib: 3, discipline: 'Long Jump', squad: 'Jumps', status: 'Resting', pb: '7.61m', notes: 'Managing minor Achilles load, reduced run-up reps.', history: [70, 72, 71, 69, 66, 64, 63] },
  { id: 5, name: 'Priya Nair', bib: 11, discipline: '800m', squad: 'Middle Distance', status: 'Active', pb: '2:03.45', notes: 'Race-pace intervals progressing well this block.', history: [62, 64, 63, 67, 69, 71, 73] },
  { id: 6, name: 'Connor Blake', bib: 19, discipline: 'Shot Put', squad: 'Throws', status: 'Injured', pb: '16.88m', notes: 'Shoulder rehab in progress with physio, light technical drills only.', history: [80, 78, 74, 70, 65, 60, 58] },
  { id: 7, name: 'Nadia Hassan', bib: 26, discipline: '100m Hurdles', squad: 'Sprint', status: 'Active', pb: '13.02s', notes: 'Hurdle rhythm improving, 3-step pattern locked in.', history: [65, 67, 69, 70, 72, 74, 75] },
  { id: 8, name: 'Tomasz Nowak', bib: 9, discipline: 'Pole Vault', squad: 'Jumps', status: 'Active', pb: '5.15m', notes: 'Pole switch this month, adjusting run-up marks.', history: [58, 60, 63, 62, 65, 67, 69] },
  { id: 9, name: 'Efe Adeyemi', bib: 16, discipline: '200m', squad: 'Sprint', status: 'Peaking', pb: '21.14s', notes: 'PB broken last trial, taper planned for regional final.', history: [70, 73, 75, 78, 80, 84, 88] },
  { id: 10, name: 'Sofia Martins', bib: 23, discipline: '1500m', squad: 'Distance', status: 'Active', pb: '4:12.33', notes: 'Consistent training, targeting sub-4:10 this season.', history: [60, 62, 64, 63, 66, 68, 70] },
  { id: 11, name: 'Ben Fischer', bib: 5, discipline: 'Javelin', squad: 'Throws', status: 'Active', pb: '68.40m', notes: 'Technical work on block placement.', history: [64, 66, 65, 68, 70, 71, 73] },
  { id: 12, name: 'Zanele Dube', bib: 31, discipline: '400m Hurdles', squad: 'Sprint', status: 'Resting', pb: '58.90s', notes: 'Post-meet recovery week, light aerobic work only.', history: [66, 68, 70, 69, 67, 65, 64] },
];

export const fixtureEvents: ConsoleEvent[] = [
  { id: 101, name: 'Regional Championships', type: 'Meet', date: '2026-08-16', location: 'Central Stadium', notes: 'Season target meet. Qualifying standards apply for finals.', athleteIds: [1, 2, 7, 9, 5] },
  { id: 102, name: 'Sprint & Hurdles Time Trial', type: 'Time Trial', date: '2026-08-14', location: 'Home Track', notes: 'Internal trial, hand-timed, spikes optional.', athleteIds: [1, 7, 9, 2] },
  { id: 103, name: 'Altitude Training Camp', type: 'Training Camp', date: '2026-08-24', location: 'Highland Base', notes: '10-day distance block, accommodation confirmed.', athleteIds: [3, 10] },
  { id: 104, name: 'Riverside Invitational', type: 'Away Meet', date: '2026-08-30', location: 'Riverside Track & Field', notes: 'Travel departs 6:00am, bus booked.', athleteIds: [4, 8, 11, 6] },
  { id: 105, name: 'Throws & Jumps Trial', type: 'Time Trial', date: '2026-09-06', location: 'Home Track', notes: 'Measuring session for all field athletes.', athleteIds: [4, 6, 8, 11] },
  { id: 106, name: 'Coastal Relays', type: 'Meet', date: '2026-09-19', location: 'Bay City Stadium', notes: 'Relay squad selection to be confirmed after trial.', athleteIds: [1, 2, 9, 12] },
  { id: 107, name: 'Indoor Invitational', type: 'Meet', date: '2026-07-12', location: 'Metro Arena', notes: 'Completed. 3 season bests.', athleteIds: [1, 7, 9] },
  { id: 108, name: 'Season Opener Time Trial', type: 'Time Trial', date: '2026-06-20', location: 'Home Track', notes: 'Completed. Baseline times recorded.', athleteIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
];

export const FIXTURE_TODAY = '2026-08-11';

export const initials = (name: string) => name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();

export function formatDate(iso: string, full = false) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', full
    ? { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }
    : { month: 'short', day: 'numeric' });
}

export function readiness(athletes: Athlete[]) {
  if (!athletes.length) return 0;
  const weight: Record<AthleteStatus, number> = { Active: 1, Peaking: 1, Resting: 0.62, Injured: 0.18 };
  return Math.round(athletes.reduce((sum, athlete) => sum + weight[athlete.status], 0) / athletes.length * 100);
}
