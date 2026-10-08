import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createGeminiToken } from '../../api/ai';
import {
  getAthleteDisciplineAnalysis,
  getCoachInjuryAnalysis,
  getCoachPerformanceAnalysis,
  getCoachRankingsAnalysis,
  getWorkspaceDisciplineAnalysis,
  type AthleteDisciplineAnalysis,
  type CoachInjuryAnalysis,
  type CoachInjuryAnalysisFilters,
  type CoachLifecycleStatus,
  type CoachPerformanceAnalysis,
  type CoachPerformanceAnalysisFilters,
  type CoachRankingsAnalysis,
  type CoachRankingsAnalysisFilters,
  type WorkspaceDisciplineAnalysis,
} from '../../api/analytics';
import { createAthlete, getAthlete, listAthletes } from '../../api/athletes';
import { GeminiAudioPlayer } from '../../api/geminiAudio';
import { AthloraGeminiSession, type GeminiToolHandler } from '../../api/geminiLiveSdk';
import { GeminiMicrophone } from '../../api/geminiMicrophone';
import { listDisciplines } from '../../api/meets';
import { getCurrentWeather } from '../../api/weather';
import { searchVenues } from '../../api/venues';
import { Button, Modal } from '../../components';
import type { Athlete, CurrentWeather, VenueSearchResult } from '../../types';
import type { DisciplineDefinition } from '../../types/meets';
import { downloadFile } from '../../utils/downloadFile';
import { useWorkspace } from '../auth/WorkspaceContext';
import {
  athleteAnalysisTellMe,
  athletePerformanceReportPdf,
  performanceReportFilename,
  workspaceDisciplineReportPdf,
  workspaceDisciplineTellMe,
} from '../reports/performanceReport';
import {
  coachInjuryMonitoringReportPdf,
  coachPerformanceReportPdf,
  coachRankingsReportPdf,
} from '../reports/coachingAnalyticsReport';
import styles from './AthloraAssistantProvider.module.css';

const ASSISTANT_INACTIVITY_MS = 60_000;
const START_GREETING = 'Good day coach, how can I help?';

interface AssistantSource<T> {
  endpoint: string;
  retrievedAt: string;
  data: T;
}

interface AssistantToolResult<T> {
  source: AssistantSource<T>;
  data: T;
  relatedSources?: AssistantSource<unknown>[];
}

interface AssistantDiscipline {
  id: string;
  code: string;
  label: string;
  kind: DisciplineDefinition['kind'];
  unit: DisciplineDefinition['unit'];
  direction: DisciplineDefinition['direction'];
}

interface PendingAthleteDraft {
  name: string;
  dob: string | null;
  gender: string | null;
  notes: string | null;
  discipline: AssistantDiscipline;
}

interface PendingVenueSearch {
  place: string;
  choices: Array<{ id: string; venue: VenueSearchResult }>;
}

interface CachedDisciplineAnalysis {
  analysis: WorkspaceDisciplineAnalysis;
  tellMe: string;
}

interface CachedAthleteAnalysis {
  athleteName: string;
  analysis: AthleteDisciplineAnalysis;
  tellMe: string;
}

interface CachedCoachPerformanceAnalysis {
  analysis: CoachPerformanceAnalysis;
}

interface CachedCoachInjuryAnalysis {
  analysis: CoachInjuryAnalysis;
}

interface CachedCoachRankingsAnalysis {
  analysis: CoachRankingsAnalysis;
}

interface AssistantPageContext {
  page: 'dashboard' | 'statistics' | 'athletes' | 'athlete' | 'comparison' | 'events' | 'event' | 'liveLogging' | 'account' | 'unknown';
  athleteId: string | null;
}

function sourceResult<T>(endpoint: string, data: T, relatedSources?: AssistantSource<unknown>[]): AssistantToolResult<T> {
  return {
    source: { endpoint, retrievedAt: new Date().toISOString(), data },
    data,
    ...(relatedSources?.length ? { relatedSources } : {}),
  };
}

function requiredToolString(value: unknown, description: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${description} is required.`);
  return value.trim();
}

function optionalToolString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

function normalizedNameKey(name: string): string {
  return normalizeName(name).toLocaleLowerCase();
}

function isValidAthleteName(name: string): boolean {
  return name.length > 0 && name.length <= 160;
}

function disciplineSummary(discipline: DisciplineDefinition): AssistantDiscipline {
  return {
    id: discipline.id,
    code: discipline.code,
    label: discipline.presentation.label,
    kind: discipline.kind,
    unit: discipline.unit,
    direction: discipline.direction,
  };
}

function currentDisciplineDefinitions(disciplines: DisciplineDefinition[]): DisciplineDefinition[] {
  const current = new Map<string, DisciplineDefinition>();
  for (const discipline of disciplines) {
    const previous = current.get(discipline.code);
    if (!previous || discipline.version > previous.version) current.set(discipline.code, discipline);
  }
  return [...current.values()];
}

function normalizeSeasonYear(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'string' && (value === 'all' || /^\d{4}$/.test(value))) return value;
  throw new Error('Season must be a four-digit year or "all".');
}

const COACH_ANALYTICS_MAX_ATHLETE_IDS = 100;
const COACH_ANALYTICS_MAX_RANKING_LIMIT = 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function optionalCoachAthleteIds(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('Athlete IDs must be a non-empty array of UUIDs when provided.');
  }
  if (value.length > COACH_ANALYTICS_MAX_ATHLETE_IDS) {
    throw new Error(`Select at most ${COACH_ANALYTICS_MAX_ATHLETE_IDS} athlete IDs.`);
  }
  if (value.some((id) => typeof id !== 'string' || !UUID_PATTERN.test(id))) {
    throw new Error('Each athlete ID must be a valid UUID.');
  }
  if (new Set(value).size !== value.length) throw new Error('Athlete IDs must be unique.');
  return value;
}

function optionalCoachDate(value: unknown, label: 'dateFrom' | 'dateTo'): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} must use YYYY-MM-DD format.`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} must be a real YYYY-MM-DD date.`);
  }
  return value;
}

function coachDateRangeFilters(args: Record<string, unknown>): Pick<CoachPerformanceAnalysisFilters, 'dateFrom' | 'dateTo'> {
  const dateFrom = optionalCoachDate(args.dateFrom, 'dateFrom');
  const dateTo = optionalCoachDate(args.dateTo, 'dateTo');
  if (dateFrom && dateTo && dateFrom > dateTo) throw new Error('dateFrom must not be after dateTo.');
  return { ...(dateFrom ? { dateFrom } : {}), ...(dateTo ? { dateTo } : {}) };
}

function optionalCoachLifecycleStatus(value: unknown): CoachLifecycleStatus | undefined {
  if (value === undefined || value === null) return undefined;
  if (value === 'active' || value === 'inactive' || value === 'all') return value;
  throw new Error('Lifecycle status must be active, inactive, or all.');
}

function optionalCoachRankingsLimit(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > COACH_ANALYTICS_MAX_RANKING_LIMIT) {
    throw new Error(`Rankings limit must be an integer from 1 to ${COACH_ANALYTICS_MAX_RANKING_LIMIT}.`);
  }
  return value;
}

function safeCoachInjuryAnalysis(analysis: CoachInjuryAnalysis): CoachInjuryAnalysis {
  return {
    selectedRange: { dateFrom: analysis.selectedRange.dateFrom, dateTo: analysis.selectedRange.dateTo },
    lifecycleStatus: analysis.lifecycleStatus,
    limitations: analysis.limitations,
    athletes: analysis.athletes.map((entry) => ({
      athlete: { id: entry.athlete.id, name: entry.athlete.name, status: entry.athlete.status },
      injuryCount: entry.injuryCount,
      activeInjuryCount: entry.activeInjuryCount,
      mostCommonRecordedArea: entry.mostCommonRecordedArea && {
        bodyRegion: entry.mostCommonRecordedArea.bodyRegion,
        area: entry.mostCommonRecordedArea.area,
        count: entry.mostCommonRecordedArea.count,
      },
      repeatedInjuries: entry.repeatedInjuries.map((injury) => ({
        bodyRegion: injury.bodyRegion,
        area: injury.area,
        side: injury.side,
        count: injury.count,
      })),
      warning: { level: entry.warning.level, reasons: [...entry.warning.reasons] },
      history: entry.history.map((injury) => ({
        bodyRegion: injury.bodyRegion,
        area: injury.area,
        side: injury.side,
        severity: injury.severity,
        occurrenceDate: injury.occurrenceDate,
        expectedReturnDate: injury.expectedReturnDate,
        resolvedDate: injury.resolvedDate,
        active: injury.active,
      })),
    })),
  };
}

function isExplicitCurrentLocationWeatherRequest(message: string): boolean {
  const weather = /\b(weather|conditions?|forecast|temperature|rain|wind)\b/i.test(message);
  const location = /\b(current location|my location|my current location|device location|present location|where i am|where i'm at|where im at|weather here|here)\b/i.test(message);
  return weather && location;
}

function confirmationText(message: string): string {
  return message.trim().toLocaleLowerCase().replace(/[.!?,]+$/g, '').replace(/\s+/g, ' ');
}

function isExplicitDraftConfirmation(message: string): boolean {
  return /^(yes|yes please|confirm|confirm it|confirm draft|create athlete|create the athlete|add athlete|add the athlete|go ahead|proceed|do it|please do)$/.test(confirmationText(message));
}

function isExplicitDraftCancellation(message: string): boolean {
  return /^(no|no thanks|cancel|cancel it|cancel draft|never mind|nevermind|do not create|don't create|dont create|abort)$/.test(confirmationText(message));
}

function pendingAnalysisAction(message: string): 'tell' | 'pdf' | null {
  const text = confirmationText(message);
  if (/^(tell me|tell|read it out|read it|read|explain|show me)$/.test(text)) return 'tell';
  if (/^(pdf|generate pdf|generate the pdf|generate report|generate the report|create pdf|create report|download report)$/.test(text)) return 'pdf';
  return null;
}

function pageContext(pathname: string): AssistantPageContext {
  const athleteMatch = /^\/console\/athletes\/([^/]+)$/.exec(pathname);
  if (athleteMatch) return { page: 'athlete', athleteId: athleteMatch[1] ?? null };
  if (pathname === '/console') return { page: 'dashboard', athleteId: null };
  if (pathname === '/console/stats') return { page: 'statistics', athleteId: null };
  if (pathname === '/console/athletes') return { page: 'athletes', athleteId: null };
  if (pathname === '/console/comparison') return { page: 'comparison', athleteId: null };
  if (pathname === '/console/events') return { page: 'events', athleteId: null };
  if (pathname.startsWith('/console/events/')) return { page: 'event', athleteId: null };
  if (pathname.startsWith('/console/live')) return { page: 'liveLogging', athleteId: null };
  if (pathname === '/console/account') return { page: 'account', athleteId: null };
  return { page: 'unknown', athleteId: null };
}

function normalizedWeather(weather: CurrentWeather) {
  return {
    timezone: weather.timezone,
    temperatureC: weather.temperatureC,
    apparentTemperatureC: weather.apparentTemperatureC,
    humidityPercent: weather.humidityPercent,
    isDay: weather.isDay,
    precipitationRateMmHr: weather.precipitationRateMmHr,
    weatherCode: weather.weatherCode,
    windSpeedKmh: weather.windSpeedKmh,
  };
}

function safeToolError(action: string): Error {
  return new Error(`${action} is temporarily unavailable. Please try again.`);
}

function browserCoordinates(): Promise<{ latitude: number; longitude: number }> {
  if (!navigator.geolocation) {
    return Promise.reject(new Error('Location access is unavailable in this browser.'));
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
      () => reject(new Error('Location access was denied. Request weather for a named place instead.')),
      { enableHighAccuracy: false, maximumAge: 0, timeout: 10_000 },
    );
  });
}

interface AthloraAssistantContextValue {
  createdAthlete: Athlete | null;
  stopAthloraAssistant: () => Promise<void>;
}

const defaultAssistantContext: AthloraAssistantContextValue = {
  createdAthlete: null,
  stopAthloraAssistant: async () => undefined,
};

const AthloraAssistantContext = createContext<AthloraAssistantContextValue>(defaultAssistantContext);

export function useAthloraAssistant(): AthloraAssistantContextValue {
  return useContext(AthloraAssistantContext);
}

export function AthloraAssistantProvider({ children }: { children: ReactNode }) {
  const { activeWorkspace } = useWorkspace();
  const [createdAthlete, setCreatedAthlete] = useState<Athlete | null>(null);
  const [geminiTesting, setGeminiTesting] = useState(false);
  const [geminiMessage, setGeminiMessage] = useState('');
  const [geminiResponse, setGeminiResponse] = useState<string | null>(null);
  const [geminiConnected, setGeminiConnected] = useState(false);
  const [geminiListening, setGeminiListening] = useState(false);
  const [geminiDialogOpen, setGeminiDialogOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingAthleteDraft, setPendingAthleteDraft] = useState<PendingAthleteDraft | null>(null);
  const [cachedAthleteAnalysis, setCachedAthleteAnalysis] = useState<CachedAthleteAnalysis | null>(null);
  const [cachedDisciplineAnalysis, setCachedDisciplineAnalysis] = useState<CachedDisciplineAnalysis | null>(null);
  const [cachedCoachPerformanceAnalysis, setCachedCoachPerformanceAnalysis] = useState<CachedCoachPerformanceAnalysis | null>(null);
  const [cachedCoachInjuryAnalysis, setCachedCoachInjuryAnalysis] = useState<CachedCoachInjuryAnalysis | null>(null);
  const [cachedCoachRankingsAnalysis, setCachedCoachRankingsAnalysis] = useState<CachedCoachRankingsAnalysis | null>(null);
  const [reporting, setReporting] = useState<'athlete' | 'discipline' | 'coachPerformance' | 'coachInjury' | 'coachRankings' | null>(null);
  const [reportStatus, setReportStatus] = useState<string | null>(null);
  const [geminiToolLoading, setGeminiToolLoading] = useState(false);
  const geminiSessionRef = useRef<AthloraGeminiSession | null>(null);
  const geminiAudioPlayerRef = useRef<GeminiAudioPlayer | null>(null);
  const geminiMicrophoneRef = useRef<GeminiMicrophone | null>(null);
  const geminiStartPromiseRef = useRef<Promise<AthloraGeminiSession> | null>(null);
  const greetedGeminiSessionRef = useRef<AthloraGeminiSession | null>(null);
  const geminiAssistantStartingRef = useRef(false);
  const sleepPendingRef = useRef(false);
  const assistantInactivityTimeoutRef = useRef<number | null>(null);
  const assistantActivityGenerationRef = useRef(0);
  const lifecycleGenerationRef = useRef(0);
  const mountedRef = useRef(true);
  const dialogOpenRef = useRef(false);
  const workspaceIdRef = useRef(activeWorkspace.id);
  const pendingAthleteDraftRef = useRef<PendingAthleteDraft | null>(null);
  const confirmingAthleteDraftRef = useRef(false);
  const selectedAthleteIdsRef = useRef(new Set<string>());
  const selectedAthleteNamesRef = useRef(new Map<string, string>());
  const pendingVenueSearchRef = useRef<PendingVenueSearch | null>(null);
  const currentLocationWeatherRequestedRef = useRef(false);
  const voiceMessageRef = useRef('');
  const cachedAthleteAnalysisRef = useRef<CachedAthleteAnalysis | null>(null);
  const cachedDisciplineAnalysisRef = useRef<CachedDisciplineAnalysis | null>(null);
  const cachedCoachPerformanceAnalysisRef = useRef<CachedCoachPerformanceAnalysis | null>(null);
  const cachedCoachInjuryAnalysisRef = useRef<CachedCoachInjuryAnalysis | null>(null);
  const cachedCoachRankingsAnalysisRef = useRef<CachedCoachRankingsAnalysis | null>(null);
  const pendingAnalysisKindRef = useRef<'athlete' | 'discipline' | 'coachPerformance' | 'coachInjury' | 'coachRankings' | null>(null);
  const reportingRef = useRef(false);
  const activeToolCallCountRef = useRef(0);

  if (!geminiAudioPlayerRef.current) {
    geminiAudioPlayerRef.current = new GeminiAudioPlayer();
  }

  if (!geminiMicrophoneRef.current) {
    geminiMicrophoneRef.current = new GeminiMicrophone();
  }

  const isCurrentLifecycle = (generation: number) => (
    mountedRef.current && lifecycleGenerationRef.current === generation
  );

  const isCurrentToolCall = (generation: number, signal?: AbortSignal) => (
    !signal?.aborted && isCurrentLifecycle(generation)
  );

  const ensureCurrentToolCall = (generation: number, signal?: AbortSignal) => {
    if (!isCurrentToolCall(generation, signal)) throw new Error('Athlora request was cancelled.');
  };

  const clearAssistantInactivityTimer = useCallback(() => {
    assistantActivityGenerationRef.current += 1;

    if (assistantInactivityTimeoutRef.current !== null) {
      window.clearTimeout(assistantInactivityTimeoutRef.current);
      assistantInactivityTimeoutRef.current = null;
    }
  }, []);

  const stopAssistant = useCallback(async (sleepMessage = false, closeDialog = true) => {
    lifecycleGenerationRef.current += 1;
    clearAssistantInactivityTimer();
    sleepPendingRef.current = false;
    currentLocationWeatherRequestedRef.current = false;
    voiceMessageRef.current = '';
    selectedAthleteIdsRef.current.clear();
    selectedAthleteNamesRef.current.clear();
    pendingVenueSearchRef.current = null;
    cachedAthleteAnalysisRef.current = null;
    cachedDisciplineAnalysisRef.current = null;
    cachedCoachPerformanceAnalysisRef.current = null;
    cachedCoachInjuryAnalysisRef.current = null;
    cachedCoachRankingsAnalysisRef.current = null;
    pendingAnalysisKindRef.current = null;
    reportingRef.current = false;
    activeToolCallCountRef.current = 0;
    if (closeDialog) dialogOpenRef.current = false;

    const microphone = geminiMicrophoneRef.current;
    const session = geminiSessionRef.current;
    geminiSessionRef.current = null;
    geminiStartPromiseRef.current = null;
    greetedGeminiSessionRef.current = null;
    geminiAssistantStartingRef.current = false;

    // Stop capture synchronously before awaiting AudioContext shutdown.
    const microphoneStop = microphone?.stop();
    geminiAudioPlayerRef.current?.close();
    session?.close();

    if (mountedRef.current) {
      setGeminiListening(false);
      setGeminiConnected(false);
      setGeminiTesting(false);
      setCachedAthleteAnalysis(null);
      setCachedDisciplineAnalysis(null);
      setCachedCoachPerformanceAnalysis(null);
      setCachedCoachInjuryAnalysis(null);
      setCachedCoachRankingsAnalysis(null);
      setReporting(null);
      setReportStatus(null);
      setGeminiToolLoading(false);
      if (closeDialog) setGeminiDialogOpen(false);
      if (sleepMessage) setGeminiResponse('Athlora is sleeping.');
    }

    try {
      await microphoneStop;
    } catch (error) {
      if (mountedRef.current) {
        setActionError(error instanceof Error ? error.message : 'Failed to stop the microphone.');
      }
    }
  }, [clearAssistantInactivityTimer]);

  const setLocalAthleteDraft = (draft: PendingAthleteDraft | null) => {
    pendingAthleteDraftRef.current = draft;
    setPendingAthleteDraft(draft);
  };

  const cacheAthleteAnalysis = (cached: CachedAthleteAnalysis | null) => {
    cachedAthleteAnalysisRef.current = cached;
    if (cached) pendingAnalysisKindRef.current = 'athlete';
    setCachedAthleteAnalysis(cached);
  };

  const cacheDisciplineAnalysis = (cached: CachedDisciplineAnalysis | null) => {
    cachedDisciplineAnalysisRef.current = cached;
    if (cached) pendingAnalysisKindRef.current = 'discipline';
    setCachedDisciplineAnalysis(cached);
  };

  const cacheCoachPerformanceAnalysis = (cached: CachedCoachPerformanceAnalysis | null) => {
    cachedCoachPerformanceAnalysisRef.current = cached;
    if (cached) pendingAnalysisKindRef.current = 'coachPerformance';
    setCachedCoachPerformanceAnalysis(cached);
  };

  const cacheCoachInjuryAnalysis = (cached: CachedCoachInjuryAnalysis | null) => {
    cachedCoachInjuryAnalysisRef.current = cached;
    if (cached) pendingAnalysisKindRef.current = 'coachInjury';
    setCachedCoachInjuryAnalysis(cached);
  };

  const cacheCoachRankingsAnalysis = (cached: CachedCoachRankingsAnalysis | null) => {
    cachedCoachRankingsAnalysisRef.current = cached;
    if (cached) pendingAnalysisKindRef.current = 'coachRankings';
    setCachedCoachRankingsAnalysis(cached);
  };

  const cancelAthleteDraft = () => {
    if (!pendingAthleteDraftRef.current) return;
    setLocalAthleteDraft(null);
    setActionError(null);
    setGeminiResponse('Athlete draft cancelled. No athlete was created.');
  };

  const confirmAthleteDraft = async () => {
    const draft = pendingAthleteDraftRef.current;
    if (!draft || confirmingAthleteDraftRef.current) return;

    confirmingAthleteDraftRef.current = true;
    setActionError(null);

    try {
      const athlete = await createAthlete({
        name: draft.name,
        dob: draft.dob,
        gender: draft.gender,
        notes: draft.notes,
        preferredDisciplineIds: [draft.discipline.id],
        seasonGoals: [],
      });

      if (pendingAthleteDraftRef.current === draft) setLocalAthleteDraft(null);
      if (mountedRef.current && workspaceIdRef.current === activeWorkspace.id) {
        setCreatedAthlete(athlete);
        setGeminiResponse(`${athlete.name} was added with ${draft.discipline.label} as a preferred discipline.`);
      }
    } catch {
      if (mountedRef.current) setActionError('Athlora could not create this athlete. Please try again.');
    } finally {
      confirmingAthleteDraftRef.current = false;
    }
  };

  const loadResolvedDiscipline = async (value: unknown) => {
    const requested = requiredToolString(value, 'Discipline');
    let disciplines: DisciplineDefinition[];
    try {
      disciplines = currentDisciplineDefinitions((await listDisciplines()).data);
    } catch {
      throw safeToolError('Discipline data');
    }

    const requestedKey = requested.toLocaleLowerCase();
    const matches = disciplines.filter((discipline) => (
      discipline.id.toLocaleLowerCase() === requestedKey
      || discipline.code.toLocaleLowerCase() === requestedKey
      || discipline.presentation.label.toLocaleLowerCase() === requestedKey
    ));

    if (matches.length === 0) throw new Error(`No real Athlora discipline matches "${requested}". Use list_disciplines first.`);
    if (matches.length > 1) throw new Error(`More than one discipline matches "${requested}". Ask the coach to choose a specific code.`);

    const catalogue = disciplines.map(disciplineSummary);
    return {
      discipline: disciplineSummary(matches[0]!),
      source: sourceResult('/api/v1/disciplines', catalogue).source,
    };
  };

  const coachPerformanceFilters = async (args: Record<string, unknown>) => {
    const athleteIds = optionalCoachAthleteIds(args.athleteIds);
    const dateRange = coachDateRangeFilters(args);
    const lifecycleStatus = optionalCoachLifecycleStatus(args.lifecycleStatus);
    const filters: CoachPerformanceAnalysisFilters = {
      ...(athleteIds ? { athleteIds } : {}),
      ...dateRange,
      ...(lifecycleStatus ? { lifecycleStatus } : {}),
    };
    let relatedSources: AssistantSource<unknown>[] | undefined;
    if (args.discipline !== undefined && args.discipline !== null) {
      const { discipline, source } = await loadResolvedDiscipline(args.discipline);
      filters.discipline = discipline.code;
      relatedSources = [source];
    }
    return { filters, relatedSources };
  };

  const coachInjuryFilters = (args: Record<string, unknown>): CoachInjuryAnalysisFilters => {
    if (args.discipline !== undefined) throw new Error('Injury monitoring analysis does not support a discipline filter.');
    const athleteIds = optionalCoachAthleteIds(args.athleteIds);
    const dateRange = coachDateRangeFilters(args);
    const lifecycleStatus = optionalCoachLifecycleStatus(args.lifecycleStatus);
    return {
      ...(athleteIds ? { athleteIds } : {}),
      ...dateRange,
      ...(lifecycleStatus ? { lifecycleStatus } : {}),
    };
  };

  const coachRankingsFilters = async (args: Record<string, unknown>) => {
    if (args.athleteIds !== undefined) throw new Error('Rankings analysis covers the coach roster and does not support athlete IDs.');
    const dateRange = coachDateRangeFilters(args);
    const lifecycleStatus = optionalCoachLifecycleStatus(args.lifecycleStatus);
    const limit = optionalCoachRankingsLimit(args.limit);
    const { discipline, source } = await loadResolvedDiscipline(args.discipline);
    const filters: CoachRankingsAnalysisFilters = {
      discipline: discipline.code,
      ...dateRange,
      ...(lifecycleStatus ? { lifecycleStatus } : {}),
      ...(limit === undefined ? {} : { limit }),
    };
    return { filters, relatedSources: [source] };
  };

  const downloadCoachPerformancePdf = async (analysis: CoachPerformanceAnalysis, generation: number, signal?: AbortSignal) => {
    ensureCurrentToolCall(generation, signal);
    const bytes = await coachPerformanceReportPdf(analysis);
    ensureCurrentToolCall(generation, signal);
    const filename = `${performanceReportFilename('athlora-coach-performance-analysis')}.pdf`;
    downloadFile(bytes, filename, 'application/pdf');
    if (isCurrentToolCall(generation, signal)) {
      cacheCoachPerformanceAnalysis({ analysis });
      setReportStatus('Coach performance analysis PDF downloaded.');
    }
    return filename;
  };

  const downloadCoachInjuryPdf = async (analysis: CoachInjuryAnalysis, generation: number, signal?: AbortSignal) => {
    ensureCurrentToolCall(generation, signal);
    const bytes = await coachInjuryMonitoringReportPdf(analysis);
    ensureCurrentToolCall(generation, signal);
    const filename = `${performanceReportFilename('athlora-injury-monitoring-analysis')}.pdf`;
    downloadFile(bytes, filename, 'application/pdf');
    if (isCurrentToolCall(generation, signal)) {
      cacheCoachInjuryAnalysis({ analysis });
      setReportStatus('Injury monitoring PDF downloaded.');
    }
    return filename;
  };

  const downloadCoachRankingsPdf = async (analysis: CoachRankingsAnalysis, generation: number, signal?: AbortSignal) => {
    ensureCurrentToolCall(generation, signal);
    const bytes = await coachRankingsReportPdf(analysis);
    ensureCurrentToolCall(generation, signal);
    const filename = `${performanceReportFilename(`athlora-${analysis.discipline.label}-rankings-analysis`)}.pdf`;
    downloadFile(bytes, filename, 'application/pdf');
    if (isCurrentToolCall(generation, signal)) {
      cacheCoachRankingsAnalysis({ analysis });
      setReportStatus('Coach rankings PDF downloaded.');
    }
    return filename;
  };

  const handleGeminiToolCall = async (call: Parameters<GeminiToolHandler>[0], generation: number, signal?: AbortSignal) => {
    const args = call.args ?? {};

    ensureCurrentToolCall(generation, signal);

    if (call.name === 'get_current_page_context') {
      const context = pageContext(window.location.pathname);
      if (!context.athleteId) return sourceResult('console://current-page', context);

      try {
        const athlete = await getAthlete(context.athleteId);
        ensureCurrentToolCall(generation, signal);
        selectedAthleteIdsRef.current.add(athlete.id);
        selectedAthleteNamesRef.current.set(athlete.id, athlete.name);
        return sourceResult('console://current-page', {
          ...context,
          athlete: { id: athlete.id, name: athlete.name },
        });
      } catch {
        if (!isCurrentToolCall(generation, signal)) throw new Error('Athlora request was cancelled.');
        return sourceResult('console://current-page', context);
      }
    }

    if (call.name === 'list_disciplines') {
      const query = optionalToolString(args.query)?.toLocaleLowerCase();
      let disciplines: DisciplineDefinition[];
      try {
      disciplines = currentDisciplineDefinitions((await listDisciplines()).data);
      } catch {
        throw safeToolError('Discipline data');
      }
      const data = disciplines.map(disciplineSummary).filter((discipline) => !query
        || discipline.code.toLocaleLowerCase().includes(query)
        || discipline.label.toLocaleLowerCase().includes(query));
      return sourceResult('/api/v1/disciplines', data);
    }

    if (call.name === 'search_athletes') {
      const query = requiredToolString(args.query, 'Athlete search');
      let athletes: Awaited<ReturnType<typeof listAthletes>>;
      try {
        athletes = await listAthletes({ name: query });
      } catch {
        throw safeToolError('Athlete search');
      }
      ensureCurrentToolCall(generation, signal);
      const data = athletes.data.map((athlete) => ({
        id: athlete.id,
        name: athlete.name,
        status: athlete.status,
        preferredDisciplineIds: athlete.preferredDisciplineIds,
      }));
      selectedAthleteIdsRef.current = new Set(data.map((athlete) => athlete.id));
      selectedAthleteNamesRef.current = new Map(data.map((athlete) => [athlete.id, athlete.name]));
      return sourceResult('/api/v1/athletes', data);
    }

    if (call.name === 'get_athlete_discipline_analysis') {
      const athleteId = requiredToolString(args.athleteId, 'Selected athlete');
      if (!selectedAthleteIdsRef.current.has(athleteId)) {
        throw new Error('Search athletes first, then use an athlete returned by that search.');
      }
      const { discipline, source } = await loadResolvedDiscipline(args.discipline);
      const year = normalizeSeasonYear(args.year);
      let analysis: Awaited<ReturnType<typeof getAthleteDisciplineAnalysis>>;
      try {
        analysis = await getAthleteDisciplineAnalysis(athleteId, discipline.code, year);
      } catch {
        throw safeToolError('Athlete analytics');
      }
      const athleteName = selectedAthleteNamesRef.current.get(athleteId);
      if (!athleteName) throw new Error('Search athletes first, then use an athlete returned by that search.');
      const data = {
        athleteId: analysis.athleteId,
        discipline: analysis.discipline,
        season: analysis.season,
        pb: analysis.pb,
        sb: analysis.sb,
        latest: analysis.latest ? { value: analysis.latest.value, event: analysis.latest.event } : null,
        first: analysis.first ? { value: analysis.first.value, event: analysis.first.event } : null,
        average: analysis.average,
        median: analysis.median,
        improvement: analysis.improvement,
        recentTrend: analysis.recentTrend,
        resultCount: analysis.resultCount,
      };
      if (isCurrentToolCall(generation, signal)) {
        cacheAthleteAnalysis({ athleteName, analysis, tellMe: athleteAnalysisTellMe(athleteName, analysis) });
        setReportStatus(null);
      }
      return sourceResult('/api/v1/analytics/athletes/:id/disciplines/:discipline', data, [source]);
    }

    if (call.name === 'get_workspace_discipline_analysis') {
      const { discipline, source } = await loadResolvedDiscipline(args.discipline);
      const year = normalizeSeasonYear(args.year);
      let analysis: WorkspaceDisciplineAnalysis;
      try {
        analysis = await getWorkspaceDisciplineAnalysis(discipline.code, year);
      } catch {
        throw safeToolError('Workspace discipline analytics');
      }
      const data = {
        discipline: analysis.discipline,
        season: analysis.season,
        ranking: {
          basis: analysis.ranking.basis,
          direction: analysis.ranking.direction,
          ordering: analysis.ranking.ordering,
          tieHandling: analysis.ranking.tieHandling,
          unrankedHandling: analysis.ranking.unrankedHandling,
        },
        athletes: analysis.athletes.map(({ athlete, rank, factors }) => ({
          athlete,
          rank,
          pb: factors.pb,
          sb: factors.sb,
          latest: factors.latest?.value ?? null,
          average: factors.average,
          median: factors.median,
          improvement: factors.improvement,
          recentTrend: factors.recentTrend,
          resultCount: factors.resultCount,
        })),
      };
      if (isCurrentToolCall(generation, signal)) {
        cacheDisciplineAnalysis({ analysis, tellMe: workspaceDisciplineTellMe(analysis) });
        setReportStatus(null);
      }
      return sourceResult('/api/v1/analytics/disciplines/:discipline/athletes', data, [source]);
    }

    if (call.name === 'get_coach_performance_analysis') {
      const { filters, relatedSources } = await coachPerformanceFilters(args);
      ensureCurrentToolCall(generation, signal);
      let analysis: CoachPerformanceAnalysis;
      try {
        analysis = await getCoachPerformanceAnalysis(filters);
      } catch {
        throw safeToolError('Coach performance analytics');
      }
      ensureCurrentToolCall(generation, signal);
      cacheCoachPerformanceAnalysis({ analysis });
      setReportStatus(null);
      return sourceResult('/api/v1/analytics/coach/performance', analysis, relatedSources);
    }

    if (call.name === 'get_coach_injury_analysis') {
      const filters = coachInjuryFilters(args);
      ensureCurrentToolCall(generation, signal);
      let analysis: CoachInjuryAnalysis;
      try {
        analysis = safeCoachInjuryAnalysis(await getCoachInjuryAnalysis(filters));
      } catch {
        throw safeToolError('Coach injury monitoring analytics');
      }
      ensureCurrentToolCall(generation, signal);
      cacheCoachInjuryAnalysis({ analysis });
      setReportStatus(null);
      return sourceResult('/api/v1/analytics/coach/injuries', analysis);
    }

    if (call.name === 'get_coach_rankings_analysis') {
      const { filters, relatedSources } = await coachRankingsFilters(args);
      ensureCurrentToolCall(generation, signal);
      let analysis: CoachRankingsAnalysis;
      try {
        analysis = await getCoachRankingsAnalysis(filters);
      } catch {
        throw safeToolError('Coach rankings analytics');
      }
      ensureCurrentToolCall(generation, signal);
      cacheCoachRankingsAnalysis({ analysis });
      setReportStatus(null);
      return sourceResult('/api/v1/analytics/coach/rankings', analysis, relatedSources);
    }

    if (call.name === 'download_coach_performance_report') {
      const { filters, relatedSources } = await coachPerformanceFilters(args);
      ensureCurrentToolCall(generation, signal);
      let analysis: CoachPerformanceAnalysis;
      try {
        analysis = await getCoachPerformanceAnalysis(filters);
      } catch {
        throw safeToolError('Coach performance analytics');
      }
      ensureCurrentToolCall(generation, signal);
      let filename: string;
      try {
        filename = await downloadCoachPerformancePdf(analysis, generation, signal);
      } catch (error) {
        if (error instanceof Error && error.message === 'Athlora request was cancelled.') throw error;
        throw safeToolError('Coach performance report');
      }
      return {
        ...sourceResult('/api/v1/analytics/coach/performance', analysis, relatedSources),
        report: {
          status: 'downloaded' as const,
          filename,
          selectedRange: analysis.selectedRange,
          athleteCount: analysis.athletes.length,
        },
      };
    }

    if (call.name === 'download_coach_injury_report') {
      const filters = coachInjuryFilters(args);
      ensureCurrentToolCall(generation, signal);
      let analysis: CoachInjuryAnalysis;
      try {
        analysis = safeCoachInjuryAnalysis(await getCoachInjuryAnalysis(filters));
      } catch {
        throw safeToolError('Coach injury monitoring analytics');
      }
      ensureCurrentToolCall(generation, signal);
      let filename: string;
      try {
        filename = await downloadCoachInjuryPdf(analysis, generation, signal);
      } catch (error) {
        if (error instanceof Error && error.message === 'Athlora request was cancelled.') throw error;
        throw safeToolError('Injury monitoring report');
      }
      return {
        ...sourceResult('/api/v1/analytics/coach/injuries', analysis),
        report: {
          status: 'downloaded' as const,
          filename,
          selectedRange: analysis.selectedRange,
          athleteCount: analysis.athletes.length,
        },
      };
    }

    if (call.name === 'download_coach_rankings_report') {
      const { filters, relatedSources } = await coachRankingsFilters(args);
      ensureCurrentToolCall(generation, signal);
      let analysis: CoachRankingsAnalysis;
      try {
        analysis = await getCoachRankingsAnalysis(filters);
      } catch {
        throw safeToolError('Coach rankings analytics');
      }
      ensureCurrentToolCall(generation, signal);
      let filename: string;
      try {
        filename = await downloadCoachRankingsPdf(analysis, generation, signal);
      } catch (error) {
        if (error instanceof Error && error.message === 'Athlora request was cancelled.') throw error;
        throw safeToolError('Coach rankings report');
      }
      return {
        ...sourceResult('/api/v1/analytics/coach/rankings', analysis, relatedSources),
        report: {
          status: 'downloaded' as const,
          filename,
          selectedRange: analysis.selectedRange,
          athleteCount: analysis.athletes.length,
        },
      };
    }

    if (call.name === 'prepare_athlete_draft') {
      const name = normalizeName(requiredToolString(args.name, 'Athlete name'));
      if (!isValidAthleteName(name)) throw new Error('Athlete name must be between 1 and 160 characters.');
      const { discipline, source } = await loadResolvedDiscipline(args.discipline);
      let likelyMatches: Awaited<ReturnType<typeof listAthletes>>;
      try {
        likelyMatches = await listAthletes({ name, includeArchived: true });
      } catch {
        throw safeToolError('Duplicate athlete check');
      }
      const duplicateData = likelyMatches.data.map((athlete) => ({ id: athlete.id, name: athlete.name, status: athlete.status }));
      const duplicate = likelyMatches.data.find((athlete) => normalizedNameKey(athlete.name) === normalizedNameKey(name));
      const athleteSource = sourceResult('/api/v1/athletes', duplicateData).source;
      if (duplicate) {
        return sourceResult('/api/v1/disciplines', {
          status: 'duplicate_likely' as const,
          message: `An athlete named ${duplicate.name} already exists. Do not prepare or create a duplicate.`,
          matches: duplicateData,
        }, [source, athleteSource]);
      }

      const draft: PendingAthleteDraft = {
        name,
        discipline,
        dob: optionalToolString(args.dob),
        gender: optionalToolString(args.gender),
        notes: optionalToolString(args.notes),
      };
      if (isCurrentToolCall(generation, signal)) setLocalAthleteDraft(draft);
      return sourceResult('/api/v1/disciplines', {
        status: 'draft_ready' as const,
        draft: { name: draft.name, discipline: draft.discipline, dob: draft.dob, gender: draft.gender, notes: draft.notes },
        message: 'A local confirmation panel is now visible. Only the coach can confirm or cancel this draft.',
      }, [source, athleteSource]);
    }

    if (call.name === 'get_named_place_weather') {
      const place = requiredToolString(args.place, 'Place');
      const optionId = optionalToolString(args.venueOptionId);
      let venue: VenueSearchResult;
      let venueSource: AssistantSource<unknown>;

      if (optionId) {
        const pendingSearch = pendingVenueSearchRef.current;
        const choice = pendingSearch?.choices.find((candidate) => candidate.id === optionId);
        if (!choice) throw new Error('That venue option is no longer available. Search the named place again.');
        venue = choice.venue;
        pendingVenueSearchRef.current = null;
        venueSource = sourceResult('/api/v1/venues/search', [{ id: choice.id, displayName: venue.displayName }]).source;
      } else {
        let venues: VenueSearchResult[];
        try {
          venues = (await searchVenues(place)).data;
        } catch {
          throw safeToolError('Venue search');
        }
        if (venues.length === 0) {
          return sourceResult('/api/v1/venues/search', { status: 'not_found' as const, message: `No venue was found for "${place}".` });
        }
        const choices = venues.map((candidate, index) => ({ id: `venue-${index + 1}`, venue: candidate }));
        venueSource = sourceResult('/api/v1/venues/search', choices.map(({ id, venue: candidate }) => ({ id, displayName: candidate.displayName }))).source;
        if (choices.length > 1) {
          ensureCurrentToolCall(generation, signal);
          pendingVenueSearchRef.current = { place, choices };
          return sourceResult('/api/v1/venues/search', {
            status: 'selection_required' as const,
            choices: choices.map(({ id, venue: candidate }) => ({ id, displayName: candidate.displayName })),
            message: 'Ask the coach to choose one venue option before requesting weather.',
          });
        }
        venue = choices[0]!.venue;
      }

      let weather: CurrentWeather;
      try {
        weather = await getCurrentWeather(venue.latitude, venue.longitude);
      } catch {
        throw safeToolError('Weather data');
      }
      return sourceResult('/api/v1/weather/current', {
        location: venue.displayName,
        weather: normalizedWeather(weather),
      }, [venueSource]);
    }

    if (call.name === 'get_current_location_weather') {
      if (!currentLocationWeatherRequestedRef.current) {
        throw new Error('Current-location weather is only available after an explicit current-location weather request in this message.');
      }
      currentLocationWeatherRequestedRef.current = false;
      let coordinates: { latitude: number; longitude: number };
      try {
        coordinates = await browserCoordinates();
      } catch {
        throw new Error('Location access was denied or is unavailable. Request weather for a named place instead.');
      }
      let weather: CurrentWeather;
      try {
        weather = await getCurrentWeather(coordinates.latitude, coordinates.longitude);
      } catch {
        throw safeToolError('Weather data');
      }
      return sourceResult('/api/v1/weather/current', {
        location: 'Current browser location',
        weather: normalizedWeather(weather),
      });
    }

    throw new Error(`Unknown Gemini tool: ${call.name}`);
  };

  const resetAssistantInactivityTimer = () => {
    if (!geminiSessionRef.current) return;

    clearAssistantInactivityTimer();
    const generation = assistantActivityGenerationRef.current;

    assistantInactivityTimeoutRef.current = window.setTimeout(() => {
      if (generation !== assistantActivityGenerationRef.current || !geminiSessionRef.current) return;

      assistantInactivityTimeoutRef.current = null;
      void stopAssistant(true, false);
    }, ASSISTANT_INACTIVITY_MS);
  };

  const processVoiceMessage = () => {
    const message = voiceMessageRef.current.trim();
    voiceMessageRef.current = '';
    if (!message) return;

    currentLocationWeatherRequestedRef.current = isExplicitCurrentLocationWeatherRequest(message);
    if (pendingAthleteDraftRef.current) {
      if (isExplicitDraftCancellation(message)) {
        cancelAthleteDraft();
      } else if (isExplicitDraftConfirmation(message)) {
        void confirmAthleteDraft();
      }
      return;
    }
    void handlePendingAnalysisAction(message);
  };

  const startGeminiSession = async (): Promise<AthloraGeminiSession> => {
    const existingSession = geminiSessionRef.current;
    if (existingSession) return existingSession;

    if (geminiStartPromiseRef.current) return geminiStartPromiseRef.current;

    const generation = lifecycleGenerationRef.current;
    const starting = (async () => {
      const { token, model } = await createGeminiToken();
      if (!isCurrentLifecycle(generation)) throw new Error('Athlora assistant stopped.');
      if (!token) throw new Error('Gemini did not return a token');

      const session = new AthloraGeminiSession({
        token,
        model,
        onTurnStart: () => {
          if (!isCurrentLifecycle(generation)) return;
          processVoiceMessage();
          const microphone = geminiMicrophoneRef.current;
          if (microphone?.isActive()) {
            microphone.pause();
            geminiSessionRef.current?.endAudioStream();
          }
          setGeminiResponse('');
        },
        onAudio: (audio) => {
          if (isCurrentLifecycle(generation)) geminiAudioPlayerRef.current?.playPcm16(audio);
        },
        onTranscript: (text) => {
          if (isCurrentLifecycle(generation)) setGeminiResponse((current) => `${current ?? ''}${text}`);
        },
        onInputTranscript: (text) => {
          if (!isCurrentLifecycle(generation)) return;
          const previous = voiceMessageRef.current;
          voiceMessageRef.current = text.startsWith(previous) ? text : `${previous}${text}`;
          currentLocationWeatherRequestedRef.current = isExplicitCurrentLocationWeatherRequest(voiceMessageRef.current);
        },
        onInterrupted: () => {
          if (!isCurrentLifecycle(generation)) return;
          geminiAudioPlayerRef.current?.clear();
          if (sleepPendingRef.current) {
            void stopAssistant(true, false);
            return;
          }
          geminiMicrophoneRef.current?.resume();
        },
        onSleepRequested: () => {
          if (!isCurrentLifecycle(generation)) return;
          clearAssistantInactivityTimer();
          sleepPendingRef.current = true;
        },
        onTurnComplete: () => {
          // Location permission is scoped to the user turn that explicitly requested it.
          currentLocationWeatherRequestedRef.current = false;
          void (async () => {
            await geminiAudioPlayerRef.current?.waitUntilIdle();
            if (!isCurrentLifecycle(generation) || geminiSessionRef.current !== session) return;
            if (sleepPendingRef.current) {
              await stopAssistant(true, false);
              return;
            }
            geminiMicrophoneRef.current?.resume();
          })();
        },
        onReady: () => {
          if (!isCurrentLifecycle(generation)) return;
          geminiSessionRef.current = session;
          setGeminiConnected(true);
          resetAssistantInactivityTimer();
        },
        onDisconnected: () => {
          if (!isCurrentLifecycle(generation) || geminiSessionRef.current !== session) return;
          geminiSessionRef.current = null;
          greetedGeminiSessionRef.current = null;
          sleepPendingRef.current = false;
          clearAssistantInactivityTimer();
          void geminiMicrophoneRef.current?.stop();
          setGeminiListening(false);
          setGeminiConnected(false);
        },
        onError: (error) => {
          if (!isCurrentLifecycle(generation)) return;
          clearAssistantInactivityTimer();
          setActionError(error.message);
        },
        onToolCall: (call, signal) => handleGeminiToolCall(call, generation, signal),
        onToolCallStart: () => {
          if (!isCurrentLifecycle(generation)) return;
          activeToolCallCountRef.current += 1;
          setGeminiToolLoading(true);
        },
        onToolCallEnd: () => {
          if (!isCurrentLifecycle(generation)) return;
          activeToolCallCountRef.current = Math.max(0, activeToolCallCountRef.current - 1);
          if (activeToolCallCountRef.current === 0) setGeminiToolLoading(false);
        },
      });

      await session.connect();
      if (!isCurrentLifecycle(generation)) {
        session.close();
        throw new Error('Athlora assistant stopped.');
      }

      geminiSessionRef.current = session;
      return session;
    })();

    geminiStartPromiseRef.current = starting;

    try {
      return await starting;
    } finally {
      if (geminiStartPromiseRef.current === starting) geminiStartPromiseRef.current = null;
    }
  };

  const sendGeminiMessage = async () => {
    const message = geminiMessage.trim();
    if (!message || geminiTesting) return;

    voiceMessageRef.current = '';
    currentLocationWeatherRequestedRef.current = isExplicitCurrentLocationWeatherRequest(message);
    if (pendingAthleteDraftRef.current) {
      if (isExplicitDraftCancellation(message)) {
        setGeminiMessage('');
        cancelAthleteDraft();
        return;
      }
      if (isExplicitDraftConfirmation(message)) {
        setGeminiMessage('');
        await confirmAthleteDraft();
        return;
      }
    }
    if (await handlePendingAnalysisAction(message)) {
      setGeminiMessage('');
      return;
    }

    const generation = lifecycleGenerationRef.current;
    setGeminiTesting(true);
    setActionError(null);
    resetAssistantInactivityTimer();

    try {
      await geminiAudioPlayerRef.current?.prepare();
      const session = await startGeminiSession();
      if (!isCurrentLifecycle(generation)) return;
      setGeminiMessage('');
      geminiMicrophoneRef.current?.pause();
      const response = await session.sendText(message);
      if (isCurrentLifecycle(generation)) setGeminiResponse(response);
    } catch (error) {
      if (isCurrentLifecycle(generation)) {
        setActionError(error instanceof Error ? error.message : 'Failed to communicate with Athlora.');
      }
    } finally {
      if (isCurrentLifecycle(generation)) setGeminiTesting(false);
    }
  };

  const startAthloraAssistant = async () => {
    if (geminiAssistantStartingRef.current) return;

    const generation = lifecycleGenerationRef.current;
    sleepPendingRef.current = false;
    geminiAssistantStartingRef.current = true;
    setGeminiTesting(true);
    setActionError(null);

    try {
      await geminiAudioPlayerRef.current?.prepare();
      const session = await startGeminiSession();
      await geminiAudioPlayerRef.current?.prepare();
      if (!isCurrentLifecycle(generation) || greetedGeminiSessionRef.current === session) return;

      greetedGeminiSessionRef.current = session;
      await session.sendText(`Greet the coach with exactly this sentence and nothing else: "${START_GREETING}"`);
      if (isCurrentLifecycle(generation)) setGeminiResponse(START_GREETING);
    } catch (error) {
      if (isCurrentLifecycle(generation)) {
        setActionError(error instanceof Error ? error.message : 'Failed to start Athlora.');
      }
    } finally {
      if (isCurrentLifecycle(generation)) {
        geminiAssistantStartingRef.current = false;
        setGeminiTesting(false);
      }
    }
  };

  const openAthloraAssistant = () => {
    dialogOpenRef.current = true;
    setGeminiDialogOpen(true);
    if (!geminiSessionRef.current) void startAthloraAssistant();
  };

  const startGeminiListening = async () => {
    if (geminiListening) return;

    const generation = lifecycleGenerationRef.current;
    setActionError(null);

    try {
      await geminiAudioPlayerRef.current?.prepare();
      const session = await startGeminiSession();
      await geminiMicrophoneRef.current?.start((audio) => {
        try {
          session.sendAudio(audio);
        } catch (error) {
          console.error('Failed to send microphone audio to Athlora:', error);
        }
      }, resetAssistantInactivityTimer);

      if (!isCurrentLifecycle(generation) || !dialogOpenRef.current) {
        await geminiMicrophoneRef.current?.stop();
        return;
      }

      setGeminiListening(true);
      resetAssistantInactivityTimer();
    } catch (error) {
      if (isCurrentLifecycle(generation)) {
        setGeminiListening(false);
        clearAssistantInactivityTimer();
        setActionError(error instanceof Error ? error.message : 'Failed to start the microphone.');
      }
    }
  };

  const closeAthloraAssistantDialog = () => {
    dialogOpenRef.current = false;
    setGeminiDialogOpen(false);
    setActionError(null);

    if (geminiListening || geminiMicrophoneRef.current?.isActive()) {
      setGeminiListening(false);
      void geminiMicrophoneRef.current?.stop();
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      void stopAssistant();
    };
  }, [stopAssistant]);

  useEffect(() => {
    if (workspaceIdRef.current === activeWorkspace.id) return;
    workspaceIdRef.current = activeWorkspace.id;
    setCreatedAthlete(null);
    setLocalAthleteDraft(null);
    cachedAthleteAnalysisRef.current = null;
    cachedDisciplineAnalysisRef.current = null;
    cachedCoachPerformanceAnalysisRef.current = null;
    cachedCoachInjuryAnalysisRef.current = null;
    cachedCoachRankingsAnalysisRef.current = null;
    pendingAnalysisKindRef.current = null;
    setCachedAthleteAnalysis(null);
    setCachedDisciplineAnalysis(null);
    setCachedCoachPerformanceAnalysis(null);
    setCachedCoachInjuryAnalysis(null);
    setCachedCoachRankingsAnalysis(null);
    setReporting(null);
    setReportStatus(null);
    setGeminiToolLoading(false);
    activeToolCallCountRef.current = 0;
    selectedAthleteIdsRef.current.clear();
    selectedAthleteNamesRef.current.clear();
    pendingVenueSearchRef.current = null;
    void stopAssistant();
  }, [activeWorkspace.id, stopAssistant]);

  const tellCachedAnalysis = (summary: string) => {
    setGeminiResponse(summary);
    const session = geminiSessionRef.current;
    if (!session) return;

    // Keep the visible cached result deterministic while an active voice session speaks it.
    void session.sendText(`Speak this exact cached Athlora analysis without adding information: ${summary}`).catch(() => undefined);
  };

  const generateAthleteReport = async (cached = cachedAthleteAnalysisRef.current) => {
    if (!cached || reportingRef.current) return;
    reportingRef.current = true;
    setReporting('athlete');
    setReportStatus('Preparing athlete performance PDF...');
    setActionError(null);
    try {
      const bytes = await athletePerformanceReportPdf({ ...cached, teamName: activeWorkspace.name });
      const filename = performanceReportFilename(`athlora-${cached.athleteName}-${cached.analysis.discipline.label}-performance-report`);
      downloadFile(bytes, `${filename}.pdf`, 'application/pdf');
      setReportStatus('Athlete performance PDF downloaded.');
    } catch {
      setReportStatus(null);
      setActionError('Athlora could not generate the athlete performance PDF. Please try again.');
    } finally {
      reportingRef.current = false;
      setReporting(null);
    }
  };

  const generateDisciplineReport = async (cached = cachedDisciplineAnalysisRef.current) => {
    if (!cached || reportingRef.current) return;
    reportingRef.current = true;
    setReporting('discipline');
    setReportStatus('Preparing promising-athlete analysis PDF...');
    setActionError(null);
    try {
      const bytes = await workspaceDisciplineReportPdf(cached.analysis);
      const filename = performanceReportFilename(`athlora-${cached.analysis.discipline.label}-promising-athlete-analysis`);
      downloadFile(bytes, `${filename}.pdf`, 'application/pdf');
      setReportStatus('Promising-athlete analysis PDF downloaded.');
    } catch {
      setReportStatus(null);
      setActionError('Athlora could not generate the promising-athlete analysis PDF. Please try again.');
    } finally {
      reportingRef.current = false;
      setReporting(null);
    }
  };

  const generateCoachPerformanceReport = async (cached = cachedCoachPerformanceAnalysisRef.current) => {
    if (!cached || reportingRef.current) return;
    const generation = lifecycleGenerationRef.current;
    reportingRef.current = true;
    setReporting('coachPerformance');
    setReportStatus('Preparing coach performance analysis PDF...');
    setActionError(null);
    try {
      await downloadCoachPerformancePdf(cached.analysis, generation);
    } catch {
      if (isCurrentLifecycle(generation)) {
        setReportStatus(null);
        setActionError('Athlora could not generate the coach performance analysis PDF. Please try again.');
      }
    } finally {
      if (isCurrentLifecycle(generation)) {
        reportingRef.current = false;
        setReporting(null);
      }
    }
  };

  const generateCoachInjuryReport = async (cached = cachedCoachInjuryAnalysisRef.current) => {
    if (!cached || reportingRef.current) return;
    const generation = lifecycleGenerationRef.current;
    reportingRef.current = true;
    setReporting('coachInjury');
    setReportStatus('Preparing injury monitoring PDF...');
    setActionError(null);
    try {
      await downloadCoachInjuryPdf(cached.analysis, generation);
    } catch {
      if (isCurrentLifecycle(generation)) {
        setReportStatus(null);
        setActionError('Athlora could not generate the injury monitoring PDF. Please try again.');
      }
    } finally {
      if (isCurrentLifecycle(generation)) {
        reportingRef.current = false;
        setReporting(null);
      }
    }
  };

  const generateCoachRankingsReport = async (cached = cachedCoachRankingsAnalysisRef.current) => {
    if (!cached || reportingRef.current) return;
    const generation = lifecycleGenerationRef.current;
    reportingRef.current = true;
    setReporting('coachRankings');
    setReportStatus('Preparing coach rankings PDF...');
    setActionError(null);
    try {
      await downloadCoachRankingsPdf(cached.analysis, generation);
    } catch {
      if (isCurrentLifecycle(generation)) {
        setReportStatus(null);
        setActionError('Athlora could not generate the coach rankings PDF. Please try again.');
      }
    } finally {
      if (isCurrentLifecycle(generation)) {
        reportingRef.current = false;
        setReporting(null);
      }
    }
  };

  const handlePendingAnalysisAction = async (message: string): Promise<boolean> => {
    const action = pendingAnalysisAction(message);
    const kind = pendingAnalysisKindRef.current;
    if (!action || !kind) return false;

    if (action === 'tell') {
      if (kind === 'athlete' && cachedAthleteAnalysisRef.current) {
        tellCachedAnalysis(cachedAthleteAnalysisRef.current.tellMe);
        return true;
      }
      if (kind === 'discipline' && cachedDisciplineAnalysisRef.current) {
        tellCachedAnalysis(cachedDisciplineAnalysisRef.current.tellMe);
        return true;
      }
      return false;
    }

    if (kind === 'athlete' && cachedAthleteAnalysisRef.current) await generateAthleteReport(cachedAthleteAnalysisRef.current);
    else if (kind === 'discipline' && cachedDisciplineAnalysisRef.current) await generateDisciplineReport(cachedDisciplineAnalysisRef.current);
    else if (kind === 'coachPerformance' && cachedCoachPerformanceAnalysisRef.current) await generateCoachPerformanceReport(cachedCoachPerformanceAnalysisRef.current);
    else if (kind === 'coachInjury' && cachedCoachInjuryAnalysisRef.current) await generateCoachInjuryReport(cachedCoachInjuryAnalysisRef.current);
    else if (kind === 'coachRankings' && cachedCoachRankingsAnalysisRef.current) await generateCoachRankingsReport(cachedCoachRankingsAnalysisRef.current);
    else return false;
    return true;
  };

  return (
    <AthloraAssistantContext.Provider value={{ createdAthlete, stopAthloraAssistant: stopAssistant }}>
      {children}
      <div className={styles.assistant} data-testid="athlora-assistant">
        <button
          type="button"
          className={styles.aiTrigger}
          data-connected={geminiConnected || undefined}
          aria-label={geminiConnected ? 'Open Athlora AI' : 'Start Athlora AI'}
          title={geminiConnected ? 'Open Athlora AI' : 'Start Athlora AI'}
          onClick={openAthloraAssistant}
          disabled={geminiTesting}
        >
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <defs>
              <linearGradient id="athlora-ai-spark" x1="18" y1="20" x2="82" y2="80" gradientUnits="userSpaceOnUse">
                <stop stopColor="#4BE9FF" />
                <stop offset=".42" stopColor="#4E8DFF" />
                <stop offset=".68" stopColor="#C178FF" />
                <stop offset="1" stopColor="#FFD0A7" />
              </linearGradient>
            </defs>
            <path d="M50 16C55 38 62 45 84 50 62 55 55 62 50 84 45 62 38 55 16 50 38 45 45 38 50 16Z" fill="url(#athlora-ai-spark)" />
          </svg>
        </button>
      </div>

      <Modal open={geminiDialogOpen} title="Athlora AI" className={styles.aiModal} onClose={closeAthloraAssistantDialog}>
        <div className={styles.aiDialog}>
          <section className={styles.aiResponse} aria-live="polite" aria-busy={geminiTesting || geminiToolLoading}>
            <p className={styles.aiResponseLabel}>{geminiListening ? 'Listening hands-free' : geminiToolLoading ? 'Athlora is working' : geminiTesting ? 'Athlora is responding' : 'Athlora'}</p>
            <p>{geminiToolLoading ? 'Retrieving Athlora data...' : geminiResponse || (geminiTesting ? 'Starting Athlora...' : 'Ask Athlora to add an athlete or help with the roster.')}</p>
          </section>

          {pendingAthleteDraft && <section className={styles.draftConfirmation} aria-labelledby="athlora-draft-title">
            <h3 id="athlora-draft-title">Confirm athlete draft</h3>
            <p>Create <strong>{pendingAthleteDraft.name}</strong> with <strong>{pendingAthleteDraft.discipline.label}</strong> as a preferred discipline?</p>
            <p className={styles.draftNote}>Only confirmation creates this athlete.</p>
            <div className={styles.draftButtons}>
              <Button onClick={() => void confirmAthleteDraft()} disabled={geminiTesting}>Confirm and create</Button>
              <Button variant="secondary" onClick={cancelAthleteDraft} disabled={geminiTesting}>Cancel draft</Button>
            </div>
          </section>}

          {cachedAthleteAnalysis && <section className={styles.analysisActions} aria-labelledby="athlora-athlete-analysis-title" aria-busy={reporting === 'athlete'}>
            <h3 id="athlora-athlete-analysis-title">{cachedAthleteAnalysis.athleteName} {cachedAthleteAnalysis.analysis.discipline.label} analysis ready</h3>
            <div>
              <Button variant="secondary" onClick={() => tellCachedAnalysis(cachedAthleteAnalysis.tellMe)} disabled={reporting !== null}>Tell me about {cachedAthleteAnalysis.athleteName}</Button>
              <Button onClick={() => void generateAthleteReport()} disabled={reporting !== null} aria-describedby="athlora-report-status">{reporting === 'athlete' ? 'Preparing PDF...' : 'Generate athlete PDF'}</Button>
            </div>
          </section>}

          {cachedDisciplineAnalysis && <section className={styles.analysisActions} aria-labelledby="athlora-analysis-title" aria-busy={reporting === 'discipline'}>
            <h3 id="athlora-analysis-title">{cachedDisciplineAnalysis.analysis.discipline.label} analysis ready</h3>
            <div>
              <Button variant="secondary" onClick={() => tellCachedAnalysis(cachedDisciplineAnalysis.tellMe)} disabled={reporting !== null}>Tell me</Button>
              <Button onClick={() => void generateDisciplineReport()} disabled={reporting !== null} aria-describedby="athlora-report-status">{reporting === 'discipline' ? 'Preparing PDF...' : 'Generate PDF'}</Button>
            </div>
          </section>}

          {cachedCoachPerformanceAnalysis && <section className={styles.analysisActions} aria-labelledby="athlora-coach-performance-title" aria-busy={reporting === 'coachPerformance'}>
            <h3 id="athlora-coach-performance-title">Coach performance analysis ready</h3>
            <p>{cachedCoachPerformanceAnalysis.analysis.athletes.length} athlete{cachedCoachPerformanceAnalysis.analysis.athletes.length === 1 ? '' : 's'} in the cached analysis.</p>
            <div>
              <Button onClick={() => void generateCoachPerformanceReport()} disabled={reporting !== null} aria-describedby="athlora-report-status">{reporting === 'coachPerformance' ? 'Preparing PDF...' : 'Generate coach performance PDF'}</Button>
            </div>
          </section>}

          {cachedCoachInjuryAnalysis && <section className={styles.analysisActions} aria-labelledby="athlora-coach-injury-title" aria-busy={reporting === 'coachInjury'}>
            <h3 id="athlora-coach-injury-title">Injury monitoring analysis ready</h3>
            <p>Monitoring-only recorded injury indicators. This analysis is not a diagnosis or medical advice.</p>
            <div>
              <Button onClick={() => void generateCoachInjuryReport()} disabled={reporting !== null} aria-describedby="athlora-report-status">{reporting === 'coachInjury' ? 'Preparing PDF...' : 'Generate injury monitoring PDF'}</Button>
            </div>
          </section>}

          {cachedCoachRankingsAnalysis && <section className={styles.analysisActions} aria-labelledby="athlora-coach-rankings-title" aria-busy={reporting === 'coachRankings'}>
            <h3 id="athlora-coach-rankings-title">{cachedCoachRankingsAnalysis.analysis.discipline.label} rankings analysis ready</h3>
            <p>{cachedCoachRankingsAnalysis.analysis.athletes.length} athlete{cachedCoachRankingsAnalysis.analysis.athletes.length === 1 ? '' : 's'} in the deterministic ranking.</p>
            <div>
              <Button onClick={() => void generateCoachRankingsReport()} disabled={reporting !== null} aria-describedby="athlora-report-status">{reporting === 'coachRankings' ? 'Preparing PDF...' : 'Generate rankings PDF'}</Button>
            </div>
          </section>}

          {(cachedAthleteAnalysis || cachedDisciplineAnalysis || cachedCoachPerformanceAnalysis || cachedCoachInjuryAnalysis || cachedCoachRankingsAnalysis) && <p id="athlora-report-status" role="status">{reportStatus ?? 'Reports use the exact cached analysis and do not request new analytics.'}</p>}

          <div className={styles.aiActions}>
            {geminiConnected && !geminiListening && <Button variant="secondary" onClick={() => void startGeminiListening()}>Enable hands-free</Button>}
            {geminiListening && <span role="status">Listening hands-free</span>}
          </div>

          <p className={styles.aiHelp}>Say &quot;Athlora, go to sleep&quot; to end hands-free listening. Athlora also sleeps after 60 seconds of inactivity.</p>
          {actionError && <p className={styles.formError} role="alert">{actionError}</p>}

          <form className={styles.aiComposer} onSubmit={(event) => { event.preventDefault(); void sendGeminiMessage(); }}>
            <label className={styles.srOnly} htmlFor="athlora-ai-message">Message Athlora</label>
            <input
              id="athlora-ai-message"
              type="text"
              value={geminiMessage}
              onChange={(event) => {
                setGeminiMessage(event.target.value);
                resetAssistantInactivityTimer();
              }}
              placeholder="e.g. Add John Smith"
              disabled={geminiTesting}
            />
            <Button type="submit" disabled={geminiTesting || !geminiMessage.trim()}>{geminiTesting ? 'Sending...' : 'Send'}</Button>
          </form>
        </div>
      </Modal>
    </AthloraAssistantContext.Provider>
  );
}
