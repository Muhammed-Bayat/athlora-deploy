import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AthloraAssistantProvider } from './AthloraAssistantProvider';
import { WorkspaceContext } from '../auth/WorkspaceContext';
import { ApiError } from '../../api/client';

const geminiApi = vi.hoisted(() => ({
  createToken: vi.fn(),
  connect: vi.fn(),
  sendText: vi.fn(),
  close: vi.fn(),
  microphoneStart: vi.fn(),
  microphoneStop: vi.fn(),
  audioClose: vi.fn(),
  sessionOptions: null as null | {
    token?: string;
    model?: string;
    onReady?: () => void;
    onToolCall?: (call: { id?: string; name?: string; args?: Record<string, unknown> }, signal?: AbortSignal) => Promise<unknown>;
    onToolCallStart?: (call: { id?: string; name?: string; args?: Record<string, unknown> }) => void;
    onToolCallEnd?: (call: { id?: string; name?: string; args?: Record<string, unknown> }) => void;
    onInputTranscript?: (text: string) => void;
    onTurnStart?: () => void;
    onTurnComplete?: () => void;
  },
}));

const athleteApi = vi.hoisted(() => ({ createAthlete: vi.fn(), getAthleteRosterSummary: vi.fn(), listAthletes: vi.fn() }));
const meetsApi = vi.hoisted(() => ({ listDisciplines: vi.fn() }));
const analyticsApi = vi.hoisted(() => ({
  getAthleteDisciplineAnalysis: vi.fn(),
  getCoachInjuryAnalysis: vi.fn(),
  getCoachPerformanceAnalysis: vi.fn(),
  getCoachRankingsAnalysis: vi.fn(),
  getWorkspaceDisciplineAnalysis: vi.fn(),
}));
const reportsApi = vi.hoisted(() => ({
  athleteAnalysisTellMe: vi.fn(), athletePerformanceReportPdf: vi.fn(), performanceReportFilename: vi.fn(), workspaceDisciplineReportPdf: vi.fn(), workspaceDisciplineTellMe: vi.fn(),
}));
const coachingReportsApi = vi.hoisted(() => ({
  coachInjuryMonitoringReportPdf: vi.fn(), coachPerformanceReportPdf: vi.fn(), coachRankingsReportPdf: vi.fn(),
}));
const downloadApi = vi.hoisted(() => ({ downloadFile: vi.fn() }));
const weatherApi = vi.hoisted(() => ({ getCurrentWeather: vi.fn() }));
const venuesApi = vi.hoisted(() => ({ searchVenues: vi.fn() }));

vi.mock('../../api/ai', () => ({ createGeminiToken: geminiApi.createToken }));
vi.mock('../../api/athletes', () => athleteApi);
vi.mock('../../api/meets', () => meetsApi);
vi.mock('../../api/analytics', () => analyticsApi);
vi.mock('../reports/performanceReport', () => reportsApi);
vi.mock('../reports/coachingAnalyticsReport', () => coachingReportsApi);
vi.mock('../../utils/downloadFile', () => downloadApi);
vi.mock('../../api/weather', () => weatherApi);
vi.mock('../../api/venues', () => venuesApi);
vi.mock('../../api/geminiLiveSdk', () => ({
  AthloraGeminiSession: class {
    constructor(private readonly options: NonNullable<typeof geminiApi.sessionOptions>) {
      geminiApi.sessionOptions = options;
    }
    async connect() {
      geminiApi.connect();
      this.options.onReady?.();
    }
    async sendText(message: string) { return geminiApi.sendText(message); }
    sendAudio() {}
    endAudioStream() {}
    close() { geminiApi.close(); }
  },
}));
vi.mock('../../api/geminiAudio', () => ({
  GeminiAudioPlayer: class {
    async prepare() {}
    playPcm16() {}
    clear() {}
    async waitUntilIdle() {}
    close() { geminiApi.audioClose(); }
  },
}));
vi.mock('../../api/geminiMicrophone', () => ({
  GeminiMicrophone: class {
    private active = false;
    async start() { this.active = true; geminiApi.microphoneStart(); }
    async stop() { this.active = false; geminiApi.microphoneStop(); }
    pause() {}
    resume() {}
    isActive() { return this.active; }
  },
}));

const firstWorkspace = { id: 'workspace-1', name: 'Sprint Club', timezone: 'UTC', role: 'coach' as const };
const secondWorkspace = { id: 'workspace-2', name: 'Relay Club', timezone: 'UTC', role: 'coach' as const };
const discipline = {
  id: '11111111-1111-4111-8111-111111111111', code: '100m', version: 1, kind: 'track', unit: 'seconds', direction: 'lower',
  defaultRules: { aggregation: 'timed', entrantType: 'individual' }, precision: 2, presentation: { label: '100m' }, createdAt: '2026-01-01T00:00:00.000Z', source: 'test',
};
const athlete = {
  id: '22222222-2222-4222-8222-222222222222', coachId: 'coach-1', name: 'Ari Runner', dob: null, gender: null,
  preferredDisciplineIds: [], seasonGoals: [], notes: null, archivedAt: null, status: 'active', statusChangedAt: '2026-01-01T00:00:00.000Z', statusChangedBy: null,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};
const weather = {
  timezone: 'Africa/Johannesburg', temperatureC: 24.8, apparentTemperatureC: 25.1, humidityPercent: 62, isDay: true,
  precipitationRateMmHr: 0, weatherCode: 'partly-cloudy-day', windSpeedKmh: 12.4,
};
const coachPerformanceAnalysis = {
  selectedRange: { dateFrom: '2026-01-01', dateTo: '2026-03-31' },
  lifecycleStatus: 'active',
  athletes: [{ athlete: { id: athlete.id, name: athlete.name, status: 'active' }, disciplines: [] }],
  comparison: {
    methodology: 'Eligible athlete-discipline changes are ranked by direction-aware percentage change from the first to latest valid result in the selected range; times improve when lower, while distances and heights improve when higher. Raw values from different disciplines are not compared directly.' as const,
    eligibleAthleteDisciplineCount: 1,
    mostImproved: null,
    mostDeclined: null,
    insufficientDataReason: null,
  },
};
const coachInjuryAnalysis = {
  selectedRange: { dateFrom: '2026-01-01', dateTo: '2026-03-31' },
  lifecycleStatus: 'active',
  limitations: [
    'Indicators summarize recorded injuries only; they are not medical diagnoses or probability estimates.',
    'No workload, readiness, attendance, treatment, or recovery data is available to these indicators.',
  ],
  athletes: [{
    athlete: { id: athlete.id, name: athlete.name, status: 'active' },
    injuryCount: 1,
    activeInjuryCount: 1,
    mostCommonRecordedArea: { bodyRegion: 'Leg', area: 'Knee', count: 1 },
    repeatedInjuries: [],
    warning: { level: 'moderate', reasons: ['active_moderate_injury'] },
    history: [{
      bodyRegion: 'Leg', area: 'Knee', side: 'Left', severity: 'Moderate', occurrenceDate: '2026-03-01', expectedReturnDate: null, resolvedDate: null, active: true,
      notes: 'private injury note',
    }],
  }],
  rosterSummary: {
    injuryRecordCount: 1,
    athletesWithRecordedInjuries: 1,
    mostCommonRecordedArea: { bodyRegion: 'Leg', area: 'Knee', count: 1 },
    mostCommonBodyRegion: { bodyRegion: 'Leg', count: 1 },
    athletesWithRepeatedInjuries: [],
    insufficientDataReason: null,
  },
};
const coachRankingsAnalysis = {
  discipline: { code: '100m', label: '100m', unit: 'seconds', precision: 2, direction: 'lower' },
  selectedRange: { dateFrom: '2026-01-01', dateTo: '2026-03-31' },
  lifecycleStatus: 'active',
  limit: 50,
  scoring: {
    direction: 'lower',
    weights: { standing: 0.45, improvementPercent: 0.25, consistency: 0.2, resultCount: 0.1 },
    missingFactorHandling: 'Factors without enough athlete or comparison data are omitted from the weighted score.',
    ordering: 'Higher score ranks first; ties use discipline standing, athlete name, then athlete ID.',
  },
  athletes: [{ athlete: { id: athlete.id, name: athlete.name, status: 'active' } }],
};
const originalGeolocation = Object.getOwnPropertyDescriptor(navigator, 'geolocation');

function renderAssistant(activeWorkspace = firstWorkspace) {
  return render(
    <WorkspaceContext.Provider value={{ activeWorkspace, workspaces: [firstWorkspace, secondWorkspace], selectWorkspace: vi.fn(), refreshWorkspaces: async () => undefined }}>
      <AthloraAssistantProvider><p>Console content</p></AthloraAssistantProvider>
    </WorkspaceContext.Provider>,
  );
}

async function openAssistant() {
  fireEvent.click(screen.getByRole('button', { name: 'Start Athlora AI' }));
  await screen.findByRole('dialog', { name: 'Athlora AI' });
}

async function callTool(name: string, args: Record<string, unknown> = {}) {
  const handler = geminiApi.sessionOptions?.onToolCall;
  if (!handler) throw new Error('Gemini tool handler was not configured');
  let result: unknown;
  await act(async () => { result = await handler({ id: 'tool-1', name, args }); });
  return result;
}

beforeEach(() => {
  vi.clearAllMocks();
  geminiApi.sessionOptions = null;
  geminiApi.createToken.mockResolvedValue({ token: 'gemini-token', model: 'gemini-test-model' });
  geminiApi.sendText.mockImplementation(async (message: string) => `Athlora received: ${message}`);
  meetsApi.listDisciplines.mockResolvedValue({ data: [discipline], meta: { count: 1 } });
  athleteApi.listAthletes.mockResolvedValue({ data: [], meta: { count: 0 } });
  athleteApi.getAthleteRosterSummary.mockResolvedValue({ total: 4, active: 3, inactive: 1, archived: 2 });
  athleteApi.createAthlete.mockResolvedValue(athlete);
  analyticsApi.getAthleteDisciplineAnalysis.mockResolvedValue({
    athleteId: athlete.id, discipline: { code: '100m', label: '100m', unit: 'seconds', precision: 2, direction: 'lower' },
    season: { selected: 2026, startDate: '2026-01-01', endDate: '2027-01-01' }, pb: 10.8, sb: 10.8, latest: null, first: null,
    average: 10.8, median: 10.8, improvement: null, recentTrend: null, resultCount: 1, recentResults: [], history: [],
  });
  analyticsApi.getWorkspaceDisciplineAnalysis.mockResolvedValue({
    discipline: { code: '100m', label: '100m', unit: 'seconds', precision: 2, direction: 'lower' },
    season: { selected: 2026, startDate: '2026-01-01', endDate: '2027-01-01' },
    ranking: { basis: 'pb', direction: 'lower', ordering: 'Lower personal-best values rank first', tieHandling: 'Shared ranks', unrankedHandling: 'Unranked last', factors: ['pb', 'sb', 'latest', 'first', 'average', 'median', 'improvement', 'recentTrend', 'resultCount'] },
    athletes: [{ athlete: { id: athlete.id, name: athlete.name, status: 'active' }, rank: 1, factors: {
      athleteId: athlete.id, discipline: { code: '100m', label: '100m', unit: 'seconds', precision: 2, direction: 'lower' },
      season: { selected: 2026, startDate: '2026-01-01', endDate: '2027-01-01' }, pb: 10.8, sb: 10.8, latest: null, first: null,
      average: 10.8, median: 10.8, improvement: null, recentTrend: null, resultCount: 1, recentResults: [], history: [],
    } }],
  });
  analyticsApi.getCoachPerformanceAnalysis.mockResolvedValue(coachPerformanceAnalysis);
  analyticsApi.getCoachInjuryAnalysis.mockResolvedValue(coachInjuryAnalysis);
  analyticsApi.getCoachRankingsAnalysis.mockResolvedValue(coachRankingsAnalysis);
  reportsApi.athleteAnalysisTellMe.mockImplementation((name: string, data: { discipline: { label: string }; season: { selected: number | 'all' } }) => `${name}'s ${data.discipline.label} analysis for ${data.season.selected}`);
  reportsApi.workspaceDisciplineTellMe.mockImplementation((data: { discipline: { label: string }; season: { selected: number | 'all' } }) => `${data.discipline.label} analysis for ${data.season.selected}`);
  reportsApi.athletePerformanceReportPdf.mockResolvedValue(new Uint8Array([1, 2, 3]));
  reportsApi.workspaceDisciplineReportPdf.mockResolvedValue(new Uint8Array([4, 5, 6]));
  reportsApi.performanceReportFilename.mockImplementation((value: string) => value.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-'));
  coachingReportsApi.coachPerformanceReportPdf.mockResolvedValue(new Uint8Array([7, 8, 9]));
  coachingReportsApi.coachInjuryMonitoringReportPdf.mockResolvedValue(new Uint8Array([10, 11, 12]));
  coachingReportsApi.coachRankingsReportPdf.mockResolvedValue(new Uint8Array([13, 14, 15]));
  venuesApi.searchVenues.mockResolvedValue({ data: [], meta: { count: 0 } });
  weatherApi.getCurrentWeather.mockResolvedValue(weather);
});

afterEach(() => {
  vi.useRealTimers();
  if (originalGeolocation) {
    Object.defineProperty(navigator, 'geolocation', originalGeolocation);
  } else {
    delete (navigator as { geolocation?: Geolocation }).geolocation;
  }
});

describe('AthloraAssistantProvider', () => {
  it('uses the exact greeting and keeps the fixed bottom-right trigger outside page content', async () => {
    const user = userEvent.setup();
    geminiApi.sendText.mockResolvedValue('Good day coach, how can I help?');
    renderAssistant();

    const host = screen.getByTestId('athlora-assistant');
    expect(host).toHaveClass(/assistant/);
    expect(screen.getByRole('button', { name: 'Start Athlora AI' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Start Athlora AI' }));

    const dialog = await screen.findByRole('dialog', { name: 'Athlora AI' });
    expect(within(dialog).getByText('Good day coach, how can I help?')).toBeInTheDocument();
    expect(geminiApi.sendText).toHaveBeenCalledWith('Greet the coach with exactly this sentence and nothing else: "Good day coach, how can I help?"');
    expect(geminiApi.sessionOptions).toMatchObject({ token: 'gemini-token', model: 'gemini-test-model' });
  });

  it('is ready after setup without waiting for the greeting turn to finish', async () => {
    let resolveGreeting: (value: string) => void = () => undefined;
    geminiApi.sendText.mockImplementation(() => new Promise<string>((resolve) => {
      resolveGreeting = resolve;
    }));
    renderAssistant();

    fireEvent.click(screen.getByRole('button', { name: 'Start Athlora AI' }));

    await waitFor(() => expect(geminiApi.sendText).toHaveBeenCalledOnce());
    expect(screen.getByText('Good day coach, how can I help?')).toBeInTheDocument();
    expect(screen.getByLabelText('Message Athlora')).not.toBeDisabled();

    await act(async () => {
      resolveGreeting('Good day coach, how can I help?');
    });
  });

  it('shows concise live-tool loading without changing Gemini send state', async () => {
    renderAssistant();
    await openAssistant();

    act(() => geminiApi.sessionOptions?.onToolCallStart?.({ name: 'get_coach_performance_analysis' }));
    expect(screen.getByText('Athlora is working')).toBeInTheDocument();
    expect(screen.getByText('Retrieving Athlora data...')).toBeInTheDocument();

    act(() => geminiApi.sessionOptions?.onToolCallEnd?.({ name: 'get_coach_performance_analysis' }));
    expect(screen.queryByText('Athlora is working')).not.toBeInTheDocument();
  });

  it('stops hands-free capture when the dialog closes without ending the active session', async () => {
    const user = userEvent.setup();
    renderAssistant();

    await user.click(screen.getByRole('button', { name: 'Start Athlora AI' }));
    const dialog = await screen.findByRole('dialog', { name: 'Athlora AI' });
    await user.click(within(dialog).getByRole('button', { name: 'Enable hands-free' }));
    await waitFor(() => expect(geminiApi.microphoneStart).toHaveBeenCalledOnce());

    await user.click(within(dialog).getByRole('button', { name: 'Close' }));

    await waitFor(() => expect(geminiApi.microphoneStop).toHaveBeenCalledOnce());
    expect(geminiApi.close).not.toHaveBeenCalled();
  });

  it('closes session, audio, and microphone on sleep and workspace changes', async () => {
    const { rerender } = renderAssistant();
    vi.useFakeTimers();

    fireEvent.click(screen.getByRole('button', { name: 'Start Athlora AI' }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => vi.advanceTimersByTime(60_000));
    await act(async () => {});
    expect(geminiApi.microphoneStop).toHaveBeenCalledOnce();
    expect(geminiApi.audioClose).toHaveBeenCalledOnce();
    expect(geminiApi.close).toHaveBeenCalledOnce();
    expect(screen.getByText('Athlora is sleeping.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Start Athlora AI' }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    rerender(
      <WorkspaceContext.Provider value={{ activeWorkspace: secondWorkspace, workspaces: [firstWorkspace, secondWorkspace], selectWorkspace: vi.fn(), refreshWorkspaces: async () => undefined }}>
        <AthloraAssistantProvider><p>Console content</p></AthloraAssistantProvider>
      </WorkspaceContext.Provider>,
    );

    await act(async () => {});
    expect(geminiApi.close).toHaveBeenCalledTimes(2);
    expect(geminiApi.microphoneStop).toHaveBeenCalledTimes(2);
    expect(geminiApi.audioClose).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('dialog', { name: 'Athlora AI' })).not.toBeInTheDocument();
  });

  it('sleeps immediately for an explicit voice command when Gemini does not call the sleep tool', async () => {
    renderAssistant();
    await openAssistant();

    act(() => geminiApi.sessionOptions?.onInputTranscript?.('Athlora, go to sleep'));

    await waitFor(() => expect(geminiApi.close).toHaveBeenCalledOnce());
    expect(geminiApi.microphoneStop).toHaveBeenCalledOnce();
    expect(geminiApi.audioClose).toHaveBeenCalledOnce();
    expect(screen.getByText('Athlora is sleeping.')).toBeInTheDocument();
  });

  it('releases every live resource when the console unmounts', async () => {
    const { unmount } = renderAssistant();
    fireEvent.click(screen.getByRole('button', { name: 'Start Athlora AI' }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    unmount();

    expect(geminiApi.microphoneStop).toHaveBeenCalledOnce();
    expect(geminiApi.audioClose).toHaveBeenCalledOnce();
    expect(geminiApi.close).toHaveBeenCalledOnce();
  });

  it('stages a validated athlete draft and only posts from the explicit confirmation button', async () => {
    const user = userEvent.setup();
    renderAssistant();
    await openAssistant();

    const result = await callTool('prepare_athlete_draft', { name: 'Jordan Sprinter', discipline: '100m' });

    expect(result).toMatchObject({ data: { status: 'draft_ready', draft: { name: 'Jordan Sprinter', discipline: { id: discipline.id } } } });
    expect(athleteApi.createAthlete).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Confirm athlete draft' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Confirm and create' }));

    await waitFor(() => expect(athleteApi.createAthlete).toHaveBeenCalledWith({
      name: 'Jordan Sprinter', dob: null, gender: null, notes: null,
      preferredDisciplineIds: [discipline.id], seasonGoals: [],
    }));
    expect(screen.queryByRole('heading', { name: 'Confirm athlete draft' })).not.toBeInTheDocument();
  });

  it('cancels a pending draft without posting', async () => {
    const user = userEvent.setup();
    renderAssistant();
    await openAssistant();
    await callTool('prepare_athlete_draft', { name: 'Jordan Sprinter', discipline: '100m' });

    await user.click(screen.getByRole('button', { name: 'Cancel draft' }));

    expect(athleteApi.createAthlete).not.toHaveBeenCalled();
    expect(screen.getByText('Athlete draft cancelled. No athlete was created.')).toBeInTheDocument();
  });

  it('does not post for ambiguous draft text, but accepts a narrow typed confirmation', async () => {
    const user = userEvent.setup();
    renderAssistant();
    await openAssistant();
    await callTool('prepare_athlete_draft', { name: 'Jordan Sprinter', discipline: '100m' });

    await user.type(screen.getByLabelText('Message Athlora'), 'maybe later');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(geminiApi.sendText).toHaveBeenCalledWith('maybe later'));
    expect(athleteApi.createAthlete).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText('Message Athlora'));
    await user.type(screen.getByLabelText('Message Athlora'), 'yes please');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(athleteApi.createAthlete).toHaveBeenCalledOnce());
  });

  it('accepts an exact voice transcript confirmation locally without a Gemini creation tool', async () => {
    renderAssistant();
    await openAssistant();
    await callTool('prepare_athlete_draft', { name: 'Jordan Sprinter', discipline: '100m' });

    await act(async () => {
      geminiApi.sessionOptions?.onInputTranscript?.('confirm');
      geminiApi.sessionOptions?.onTurnStart?.();
    });

    await waitFor(() => expect(athleteApi.createAthlete).toHaveBeenCalledOnce());
    expect(geminiApi.sessionOptions?.onToolCall).toBeTypeOf('function');
  });

  it('rejects likely duplicate names and invalid disciplines before a draft can be confirmed', async () => {
    renderAssistant();
    await openAssistant();
    athleteApi.listAthletes.mockResolvedValueOnce({ data: [athlete], meta: { count: 1 } });

    const duplicate = await callTool('prepare_athlete_draft', { name: ' ari   RUNNER ', discipline: '100m' });
    await expect(callTool('prepare_athlete_draft', { name: 'New Athlete', discipline: 'invented event' })).rejects.toThrow('No real Athlora discipline');

    expect(duplicate).toMatchObject({ data: { status: 'duplicate_likely', matches: [{ id: athlete.id }] } });
    expect(screen.queryByRole('heading', { name: 'Confirm athlete draft' })).not.toBeInTheDocument();
    expect(athleteApi.createAthlete).not.toHaveBeenCalled();
  });

  it('uses only the latest catalogue version when listing and preparing a discipline draft', async () => {
    renderAssistant();
    await openAssistant();
    const latestDiscipline = { ...discipline, id: '66666666-6666-4666-8666-666666666666', version: 2 };
    meetsApi.listDisciplines.mockResolvedValue({ data: [discipline, latestDiscipline], meta: { count: 2 } });

    const listed = await callTool('list_disciplines');
    const draft = await callTool('prepare_athlete_draft', { name: 'Jordan Sprinter', discipline: '100m' });

    expect(listed).toMatchObject({ data: [{ id: latestDiscipline.id, code: '100m' }] });
    expect(draft).toMatchObject({ data: { draft: { discipline: { id: latestDiscipline.id, code: '100m' } } } });
  });

  it('returns an authenticated workspace roster summary without exposing athlete records', async () => {
    renderAssistant();
    await openAssistant();

    const result = await callTool('get_workspace_roster_summary');

    expect(athleteApi.getAthleteRosterSummary).toHaveBeenCalledOnce();
    expect(result).toEqual(expect.objectContaining({
      source: expect.objectContaining({ endpoint: '/api/v1/athletes/summary' }),
      data: { total: 4, active: 3, inactive: 1, archived: 2 },
    }));
    expect(JSON.stringify(result)).not.toContain('Ari Runner');
  });

  it('returns source-backed analytics and generates both PDFs from the exact cached models', async () => {
    const user = userEvent.setup();
    renderAssistant();
    await openAssistant();
    athleteApi.listAthletes.mockResolvedValueOnce({ data: [athlete], meta: { count: 1 } });

    await expect(callTool('get_athlete_discipline_analysis', { athleteId: athlete.id, discipline: '100m' })).rejects.toThrow('Search athletes first');
    const disciplines = await callTool('list_disciplines', { query: '100' });
    const searched = await callTool('search_athletes', { query: 'Ari' });
    const athleteAnalysis = await callTool('get_athlete_discipline_analysis', { athleteId: athlete.id, discipline: '100m', year: '2026' });
    await callTool('get_workspace_discipline_analysis', { discipline: '100m', year: '2026' });

    expect(disciplines).toMatchObject({ source: { endpoint: '/api/v1/disciplines', data: [{ id: discipline.id }] } });
    expect(searched).toMatchObject({ source: { endpoint: '/api/v1/athletes', data: [{ id: athlete.id }] } });
    expect(athleteAnalysis).toMatchObject({ data: { athleteId: athlete.id, pb: 10.8, resultCount: 1 } });
    expect(analyticsApi.getAthleteDisciplineAnalysis).toHaveBeenCalledWith(athlete.id, '100m', '2026');
    expect(screen.getByRole('heading', { name: 'Ari Runner 100m analysis ready' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Generate athlete PDF' }));
    await waitFor(() => expect(reportsApi.athletePerformanceReportPdf).toHaveBeenCalledWith(expect.objectContaining({ athleteName: 'Ari Runner', analysis: expect.objectContaining({ athleteId: athlete.id }) })));
    expect(reportsApi.athletePerformanceReportPdf.mock.calls[0]?.[0].analysis).toBe(await analyticsApi.getAthleteDisciplineAnalysis.mock.results[0]?.value);
    expect(downloadApi.downloadFile).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]), expect.stringContaining('ari-runner'), 'application/pdf');
    expect(screen.getByRole('heading', { name: '100m analysis ready' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Tell me' }));
    expect(screen.getByText(/100m analysis for 2026/)).toBeInTheDocument();
    expect(geminiApi.sendText).toHaveBeenLastCalledWith(expect.stringContaining('100m analysis for 2026'));
    await user.click(screen.getByRole('button', { name: 'Generate PDF' }));
    await waitFor(() => expect(reportsApi.workspaceDisciplineReportPdf).toHaveBeenCalledWith(expect.objectContaining({ discipline: expect.objectContaining({ code: '100m' }) })));
    expect(reportsApi.workspaceDisciplineReportPdf.mock.calls[0]?.[0]).toBe(await analyticsApi.getWorkspaceDisciplineAnalysis.mock.results[0]?.value);
    expect(downloadApi.downloadFile).toHaveBeenCalledWith(new Uint8Array([4, 5, 6]), expect.stringContaining('promising-athlete-analysis'), 'application/pdf');
    expect(analyticsApi.getWorkspaceDisciplineAnalysis).toHaveBeenCalledOnce();
    expect(screen.getByText('Promising-athlete analysis PDF downloaded.')).toBeInTheDocument();
  });

  it('returns coach performance analytics from the authoritative coach endpoint and caches the report action', async () => {
    renderAssistant();
    await openAssistant();

    const result = await callTool('get_coach_performance_analysis', {
      athleteIds: [athlete.id], discipline: '100m', dateFrom: '2026-01-01', dateTo: '2026-03-31', lifecycleStatus: 'active',
    });

    expect(analyticsApi.getCoachPerformanceAnalysis).toHaveBeenCalledWith({
      athleteIds: [athlete.id], discipline: '100m', dateFrom: '2026-01-01', dateTo: '2026-03-31', lifecycleStatus: 'active',
    });
    expect(result).toMatchObject({
      source: { endpoint: '/api/v1/analytics/coach/performance', data: coachPerformanceAnalysis },
      data: coachPerformanceAnalysis,
    });
    expect(screen.getByRole('heading', { name: 'Coach performance analysis ready' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generate coach performance PDF' })).toBeInTheDocument();
  });

  it('resolves last_three_months deterministically before requesting performance change leaders', async () => {
    renderAssistant();
    await openAssistant();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-08T12:00:00.000Z'));

    const result = await callTool('get_coach_performance_analysis', { relativeRange: 'last_three_months' });

    expect(analyticsApi.getCoachPerformanceAnalysis).toHaveBeenCalledWith({ dateFrom: '2026-07-08', dateTo: '2026-10-08' });
    expect(result).toMatchObject({ data: { comparison: { eligibleAthleteDisciplineCount: 1 } } });
  });

  it('preserves analytics HTTP diagnostics and Gemini function-call IDs instead of reporting a generic outage', async () => {
    renderAssistant();
    await openAssistant();
    analyticsApi.getCoachPerformanceAnalysis.mockRejectedValueOnce(new ApiError(503, 'DATABASE_UNAVAILABLE', 'Database unavailable', { requestId: 'request-123' }));

    await expect(callTool('get_coach_performance_analysis')).rejects.toThrow(
      'Coach performance analytics failed during the API request for Gemini function call tool-1: HTTP 503 (DATABASE_UNAVAILABLE). Request ID: request-123.',
    );
  });

  it('keeps injury monitoring results free of notes and describes the cached report as non-diagnostic', async () => {
    renderAssistant();
    await openAssistant();

    const result = await callTool('get_coach_injury_analysis', { athleteIds: [athlete.id], lifecycleStatus: 'active' });

    expect(analyticsApi.getCoachInjuryAnalysis).toHaveBeenCalledWith({ athleteIds: [athlete.id], lifecycleStatus: 'active' });
    expect(JSON.stringify(result)).not.toContain('private injury note');
    expect(JSON.stringify(result)).not.toContain('"notes"');
    expect(result).toMatchObject({ data: { rosterSummary: { mostCommonRecordedArea: { area: 'Knee' }, insufficientDataReason: null } } });
    expect(screen.getByText('Monitoring-only recorded injury indicators. This analysis is not a diagnosis or medical advice.')).toBeInTheDocument();
    expect(screen.queryByText('private injury note')).not.toBeInTheDocument();
    await expect(callTool('get_coach_injury_analysis', { discipline: '100m' })).rejects.toThrow('does not support a discipline filter');
  });

  it('validates rankings discipline and rejects athlete filters before coach analytics requests', async () => {
    renderAssistant();
    await openAssistant();

    await expect(callTool('get_coach_rankings_analysis')).rejects.toThrow('Discipline is required');
    await expect(callTool('get_coach_rankings_analysis', { discipline: '100m', athleteIds: [athlete.id] })).rejects.toThrow('does not support athlete IDs');
    expect(analyticsApi.getCoachRankingsAnalysis).not.toHaveBeenCalled();
  });

  it('runs a fresh coach analytics query and downloads the real coach performance PDF for the report tool', async () => {
    renderAssistant();
    await openAssistant();

    const result = await callTool('download_coach_performance_report', { discipline: '100m', dateFrom: '2026-01-01', dateTo: '2026-03-31' });

    expect(analyticsApi.getCoachPerformanceAnalysis).toHaveBeenCalledWith({ discipline: '100m', dateFrom: '2026-01-01', dateTo: '2026-03-31' });
    expect(coachingReportsApi.coachPerformanceReportPdf).toHaveBeenCalledWith(coachPerformanceAnalysis);
    expect(downloadApi.downloadFile).toHaveBeenCalledWith(new Uint8Array([7, 8, 9]), 'athlora-coach-performance-analysis.pdf', 'application/pdf');
    expect(result).toMatchObject({
      source: { endpoint: '/api/v1/analytics/coach/performance', data: coachPerformanceAnalysis },
      report: {
        status: 'downloaded',
        filename: 'athlora-coach-performance-analysis.pdf',
        selectedRange: coachPerformanceAnalysis.selectedRange,
        athleteCount: 1,
      },
    });
    expect(JSON.stringify(result)).not.toContain('downloadUrl');
  });

  it('uses the venue proxy before named-place weather and never includes coordinates in Gemini results', async () => {
    renderAssistant();
    await openAssistant();
    venuesApi.searchVenues.mockResolvedValueOnce({ data: [{ displayName: 'Green Point Stadium, Cape Town', latitude: -33.907, longitude: 18.416 }], meta: { count: 1 } });

    const weatherResult = await callTool('get_named_place_weather', { place: 'Green Point Stadium' });

    expect(venuesApi.searchVenues).toHaveBeenCalledWith('Green Point Stadium');
    expect(weatherApi.getCurrentWeather).toHaveBeenCalledWith(-33.907, 18.416);
    expect(weatherResult).toMatchObject({ data: { location: 'Green Point Stadium, Cape Town', weather: { temperatureC: 24.8 } } });
    expect(JSON.stringify(weatherResult)).not.toContain('-33.907');
    expect(JSON.stringify(weatherResult)).not.toContain('18.416');
  });

  it('requires a place choice for ambiguous searches and only requests current location weather after an explicit message', async () => {
    const user = userEvent.setup();
    renderAssistant();
    await openAssistant();
    const getCurrentPosition = vi.fn((success: PositionCallback) => success({ coords: { latitude: -26.2041, longitude: 28.0473 } } as GeolocationPosition));
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition } });
    venuesApi.searchVenues.mockResolvedValueOnce({ data: [
      { displayName: 'Central Track, Johannesburg', latitude: -26.1, longitude: 28.0 },
      { displayName: 'Central Track, Pretoria', latitude: -25.7, longitude: 28.2 },
    ], meta: { count: 2 } });

    const choices = await callTool('get_named_place_weather', { place: 'Central Track' });
    expect(choices).toMatchObject({ data: { status: 'selection_required', choices: [{ id: 'venue-1' }, { id: 'venue-2' }] } });
    expect(weatherApi.getCurrentWeather).not.toHaveBeenCalled();
    await callTool('get_named_place_weather', { place: 'Central Track', venueOptionId: 'venue-2' });
    expect(weatherApi.getCurrentWeather).toHaveBeenCalledWith(-25.7, 28.2);
    expect(getCurrentPosition).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Message Athlora'), 'What is the weather at my current location?');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(geminiApi.sendText).toHaveBeenCalledWith('What is the weather at my current location?'));
    const currentWeather = await callTool('get_current_location_weather');
    expect(getCurrentPosition).toHaveBeenCalledOnce();
    expect(weatherApi.getCurrentWeather).toHaveBeenCalledWith(-26.2041, 28.0473);
    expect(JSON.stringify(currentWeather)).not.toContain('-26.2041');
  });

  it('returns a safe error when current-location permission is denied and does not call weather', async () => {
    const user = userEvent.setup();
    renderAssistant();
    await openAssistant();
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: (_success: PositionCallback, error: PositionErrorCallback) => error({ code: 1, message: 'denied', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }) },
    });

    await user.type(screen.getByLabelText('Message Athlora'), 'Show weather at my device location');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await expect(callTool('get_current_location_weather')).rejects.toThrow('Location access was denied or is unavailable');
    expect(weatherApi.getCurrentWeather).not.toHaveBeenCalled();
  });
});
