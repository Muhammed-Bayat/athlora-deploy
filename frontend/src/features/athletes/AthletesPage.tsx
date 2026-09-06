import { useDeferredValue, useEffect, useRef, useState } from 'react';
import {
  archiveAthlete,
  createAthlete,
  listAthletes,
  unarchiveAthlete,
  updateAthlete,
  updateAthleteStatus,
} from '../../api/athletes';
import { createGeminiToken } from '../../api/ai';
import {
  AthloraGeminiSession,
  type GeminiToolHandler,
} from '../../api/geminiLiveSdk';
import { GeminiAudioPlayer } from '../../api/geminiAudio';
import { GeminiMicrophone } from '../../api/geminiMicrophone';
import { Button, Card, EmptyState, Modal, Select, Toast } from '../../components';
import type { Athlete, AthleteMutationPayload, AthleteStatus, Squad } from '../../types';
import type { AthleteActiveInjurySummary } from '../../types';
import { listAthleteInjurySummaries } from '../../api/injuries';
import { listSquads } from '../../api/squads';
import { CompactAnatomy } from '../fitness/CompactAnatomy';
import { AthleteDetailPage } from './AthleteDetailPage';
import { AthleteForm } from './AthleteForm';
import { athleteErrorMessage as errorMessage } from './athleteError';
import styles from './AthletesPage.module.css';

type StatusFilter = AthleteStatus | 'all';
type Editor = 'new' | Athlete | null;

export interface AthletesPageProps {
  onActiveCountChange?: (count: number) => void;
  onOpenAthlete?: (athleteId: string, openFitness?: boolean) => void;
  onBackToRoster?: () => void;
  initialAthleteId?: string | null;
  initialFitnessOpen?: boolean;
}

function sorted(athletes: Athlete[]): Athlete[] {
  return [...athletes].sort((left, right) =>
    left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }),
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function formatDate(value: string | null): string {
  if (!value) return 'DOB not recorded';
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function statusLabel(status: AthleteStatus): string {
  return status[0].toUpperCase() + status.slice(1);
}

export function AthletesPage({ onActiveCountChange, onOpenAthlete, onBackToRoster, initialAthleteId = null, initialFitnessOpen = false }: AthletesPageProps = {}) {
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [squadId, setSquadId] = useState('');
  const [squads, setSquads] = useState<Squad[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [editor, setEditor] = useState<Editor>(null);
  const [editorBusy, setEditorBusy] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<Athlete | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedAthleteId, setSelectedAthleteId] = useState<string | null>(initialAthleteId);
  const [openFitnessOnLoad, setOpenFitnessOnLoad] = useState(initialFitnessOpen);
  const [injurySummaries, setInjurySummaries] = useState<Map<string, AthleteActiveInjurySummary>>(new Map());
  const [injuryLoading, setInjuryLoading] = useState(true);
  const [injuryError, setInjuryError] = useState<string | null>(null);
  const [injuryReload, setInjuryReload] = useState(0);
  const [geminiTesting, setGeminiTesting] = useState(false);
  const [geminiMessage, setGeminiMessage] = useState('');
  const [geminiResponse, setGeminiResponse] = useState<string | null>(null);
  const [geminiConnected, setGeminiConnected] = useState(false);
  const [geminiListening, setGeminiListening] = useState(false);
  const [geminiDialogOpen, setGeminiDialogOpen] = useState(false);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const performanceButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const returnFocusAthleteId = useRef<string | null>(null);
  const geminiSessionRef = useRef<AthloraGeminiSession | null>(null);
  const geminiAudioPlayerRef = useRef<GeminiAudioPlayer | null>(null);
  const geminiMicrophoneRef = useRef<GeminiMicrophone | null>(null);
  const sleepPendingRef = useRef(false);

  if (!geminiAudioPlayerRef.current) {
    geminiAudioPlayerRef.current = new GeminiAudioPlayer();
  }

  if (!geminiMicrophoneRef.current) {
    geminiMicrophoneRef.current = new GeminiMicrophone();
  }

  useEffect(() => {
    let current = true;
    setLoading(true);
    setLoadError(null);
    void listAthletes({ includeArchived: true })
      .then(({ data }) => {
        if (!current) return;
        const next = sorted(data);
        setAthletes(next);
      })
      .catch((error: unknown) => {
        if (current) setLoadError(errorMessage(error));
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [reloadKey]);
  useEffect(() => {
    let current = true;
    setInjuryLoading(true);
    setInjuryError(null);
    void listAthleteInjurySummaries()
      .then((summaries) => {
        if (current) setInjurySummaries(new Map(summaries.map((summary) => [summary.athleteId, summary])));
      })
      .catch((error: unknown) => { if (current) setInjuryError(errorMessage(error)); })
      .finally(() => { if (current) setInjuryLoading(false); });
    return () => { current = false; };
  }, [injuryReload, reloadKey]);
  useEffect(() => { void listSquads(true).then(({ data }) => setSquads(data)).catch(() => setSquads([])); }, [reloadKey]);

  useEffect(() => {
    return () => {
      void geminiMicrophoneRef.current?.stop();
      geminiSessionRef.current?.close();
      geminiSessionRef.current = null;
      geminiAudioPlayerRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (!loading && !loadError) {
       onActiveCountChange?.(athletes.filter((athlete) => athlete.status === 'active').length);
    }
  }, [athletes, loadError, loading, onActiveCountChange]);

  useEffect(() => {
    if (selectedAthleteId !== null || returnFocusAthleteId.current === null) return;
    const athleteId = returnFocusAthleteId.current;
    returnFocusAthleteId.current = null;
    window.setTimeout(() => performanceButtonRefs.current.get(athleteId)?.focus(), 0);
  }, [selectedAthleteId]);

  const storeAthlete = (athlete: Athlete) => {
    setAthletes((current) => {
      const next = sorted([...current.filter((item) => item.id !== athlete.id), athlete]);
      return next;
    });
  };

  const activeQuery = deferredQuery.trim().toLowerCase();
  const visible = athletes.filter((athlete) => {
    const statusMatches = statusFilter === 'all' || athlete.status === statusFilter;
    const queryMatches = !activeQuery || athlete.name.toLowerCase().includes(activeQuery);
    const squadMatches = !squadId || athlete.squads?.some((squad) => squad.id === squadId);
    return statusMatches && queryMatches && squadMatches;
  });
  const hasFilters = Boolean(query || squadId || statusFilter !== 'active');
  const statusCounts = {
    active: athletes.filter((athlete) => athlete.status === 'active').length,
    inactive: athletes.filter((athlete) => athlete.status === 'inactive').length,
    archived: athletes.filter((athlete) => athlete.status === 'archived').length,
  };

  const saveEditor = async (payload: AthleteMutationPayload) => {
    const athlete = editor === 'new'
      ? await createAthlete(payload)
      : await updateAthlete(editor!.id, payload);
    storeAthlete(athlete);
    setEditor(null);
    setNotice(editor === 'new' ? `${athlete.name} added to the roster.` : `${athlete.name} updated.`);
  };

  const confirmArchive = async () => {
    if (!archiveTarget) return;
    setPendingId(archiveTarget.id);
    setActionError(null);
    try {
      const archived = await archiveAthlete(archiveTarget.id);
      storeAthlete(archived);
      setArchiveTarget(null);
      setNotice(`${archived.name} archived. Their event history is preserved.`);
      window.setTimeout(() => addButtonRef.current?.focus(), 0);
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setPendingId(null);
    }
  };

  const restore = async (athlete: Athlete) => {
    setPendingId(athlete.id);
    setActionError(null);
    try {
      const restored = await unarchiveAthlete(athlete.id);
      storeAthlete(restored);
      setNotice(`${restored.name} restored to the active roster.`);
      window.setTimeout(() => addButtonRef.current?.focus(), 0);
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setPendingId(null);
    }
  };

  const changeStatus = async (athlete: Athlete, status: Extract<AthleteStatus, 'active' | 'inactive'>) => {
    setPendingId(athlete.id);
    setActionError(null);
    try {
      const updated = await updateAthleteStatus(athlete.id, status);
      storeAthlete(updated);
      setNotice(`${updated.name} marked ${status}.`);
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setPendingId(null);
    }
  };

  const clearFilters = () => {
    setQuery('');
    setSquadId('');
    setStatusFilter('active');
  };

  const openAthlete = (athleteId: string, openFitness = false) => {
    if (onOpenAthlete) {
      onOpenAthlete(athleteId, openFitness);
      return;
    }
    setOpenFitnessOnLoad(openFitness);
    setSelectedAthleteId(athleteId);
  };

  const handleGeminiToolCall: GeminiToolHandler = async (call) => {
    if (call.name !== 'create_athlete') {
      throw new Error(`Unknown Gemini tool: ${call.name}`);
    }

    const args = call.args ?? {};

    const name =
      typeof args.name === 'string'
        ? args.name.trim()
        : '';

    if (!name) {
      throw new Error('Athlete name is required');
    }

    const dob =
      typeof args.dob === 'string'
        ? args.dob
        : null;

    const gender =
      typeof args.gender === 'string'
        ? args.gender
        : null;

    const notes =
      typeof args.notes === 'string'
        ? args.notes
        : null;

    const athlete = await createAthlete({
      name,
      dob,
      gender,
      squadIds: [],
      notes,
    });

    storeAthlete(athlete);

    return {
      success: true,
      athleteId: athlete.id,
      athleteName: athlete.name,
    };
  };

  const sleepAthlora = async () => {
    setActionError(null);

    try {
      sleepPendingRef.current = false;

      /*
       * Stop capturing and forwarding microphone audio.
       */
      await geminiMicrophoneRef.current?.stop();

      /*
       * The spoken "Going to sleep." response has already
       * finished by the time this function is called.
       *
       * Fully close the playback AudioContext instead of only
       * clearing queued audio. The next wake/start interaction
       * will create and unlock a brand-new AudioContext from
       * that new user gesture, which makes the greeting reliable
       * after repeated sleep/wake cycles.
       */
      geminiAudioPlayerRef.current?.close();

      /*
       * Close the active Gemini Live session.
       */
      geminiSessionRef.current?.close();
      geminiSessionRef.current = null;

      setGeminiListening(false);
      setGeminiConnected(false);
      setGeminiTesting(false);
      setGeminiResponse('Athlora is sleeping.');
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : 'Failed to put Athlora to sleep.',
      );
    }
  };

  const startGeminiSession = async (): Promise<AthloraGeminiSession> => {
    const existingSession = geminiSessionRef.current;

    if (existingSession) {
      return existingSession;
    }

    const token = await createGeminiToken();

    if (!token) {
      throw new Error('Gemini did not return a token');
    }

    const session = new AthloraGeminiSession({
      token,

      onTurnStart: () => {
        const microphone = geminiMicrophoneRef.current;

        // Keep the physical microphone open, but stop forwarding
        // audio before Athlora's voice reaches the speakers.
        if (microphone?.isActive()) {
          microphone.pause();

          // Flush Gemini's cached input/VAD state while the mic is
          // paused. Sending the next PCM chunk reopens the stream.
          geminiSessionRef.current?.endAudioStream();
        }

        setGeminiResponse('');
      },

      onAudio: (audio) => {
        geminiAudioPlayerRef.current?.playPcm16(audio);
      },

      onTranscript: (text) => {
        setGeminiResponse((current) => `${current ?? ''}${text}`);
      },

      onInterrupted: () => {
        // Gemini cancelled the current response. Any PCM already
        // scheduled in the browser is stale and must not keep playing.
        geminiAudioPlayerRef.current?.clear();

        // If the short sleep acknowledgement was interrupted, still
        // complete the requested shutdown rather than returning to
        // hands-free listening.
        if (sleepPendingRef.current) {
          void sleepAthlora();
          return;
        }

        // The cancelled playback is now silent, so hands-free input
        // can safely resume immediately.
        geminiMicrophoneRef.current?.resume();
      },

      onSleepRequested: () => {
        /*
         * Do not close Gemini here. The model still needs to say the
         * short acknowledgement: "Going to sleep."
         *
         * onTurnComplete will wait for that audio to finish and then
         * shut the assistant down.
         */
        sleepPendingRef.current = true;
      },

      onTurnComplete: () => {
        void (async () => {
          // Gemini can finish generating before the final queued
          // PCM chunk has finished playing in the browser.
          await geminiAudioPlayerRef.current?.waitUntilIdle();

          if (sleepPendingRef.current) {
            await sleepAthlora();
            return;
          }

          // Resume hands-free input only after Athlora is actually silent.
          geminiMicrophoneRef.current?.resume();
        })();
      },

      onConnected: () => {
        setGeminiConnected(true);
      },

      onDisconnected: () => {
        /*
         * Ignore a late close event from an older Gemini session.
         * Without this guard, an old session can finish closing
         * after a new session has already started and incorrectly
         * stop the new microphone / mark Athlora disconnected.
         */
        if (geminiSessionRef.current !== session) {
          return;
        }

        geminiSessionRef.current = null;
        sleepPendingRef.current = false;

        void geminiMicrophoneRef.current?.stop();
        setGeminiListening(false);
        setGeminiConnected(false);
      },

      onError: (error) => {
        setActionError(error.message);
      },

      onToolCall: handleGeminiToolCall,
    });

    await session.connect();

    geminiSessionRef.current = session;

    return session;
  };

  const sendGeminiMessage = async () => {
    const message = geminiMessage.trim();

    if (!message || geminiTesting) {
      return;
    }

    setGeminiTesting(true);
    setActionError(null);

    try {
      await geminiAudioPlayerRef.current?.prepare();

      const session = await startGeminiSession();

      setGeminiMessage('');
      geminiMicrophoneRef.current?.pause();

      const response = await session.sendText(message);

      setGeminiResponse(response);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : 'Failed to communicate with Athlora.',
      );
    } finally {
      setGeminiTesting(false);
    }
  };

  const startAthloraAssistant = async () => {
    if (geminiTesting) {
      return;
    }

    sleepPendingRef.current = false;

    setGeminiTesting(true);
    setActionError(null);

    try {
      await geminiAudioPlayerRef.current?.prepare();

      const session = await startGeminiSession();

      // Re-check the AudioContext immediately before the first reply.
      await geminiAudioPlayerRef.current?.prepare();

      const greeting = await session.sendText(
        'Start the assistant now.',
      );

      setGeminiResponse(greeting);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : 'Failed to start Athlora.',
      );
    } finally {
      setGeminiTesting(false);
    }
  };

  const openAthloraAssistant = () => {
    setGeminiDialogOpen(true);
    if (!geminiConnected) void startAthloraAssistant();
  };

  const startGeminiListening = async () => {
    if (geminiListening) {
      return;
    }

    setActionError(null);

    try {
      await geminiAudioPlayerRef.current?.prepare();

      const session = await startGeminiSession();

      await geminiMicrophoneRef.current?.start((audio) => {
        try {
          session.sendAudio(audio);
        } catch (error) {
          console.error(
            'Failed to send microphone audio to Athlora:',
            error,
          );
        }
      });

      setGeminiListening(true);
    } catch (error) {
      setGeminiListening(false);

      setActionError(
        error instanceof Error
          ? error.message
          : 'Failed to start the microphone.',
      );
    }
  };

  if (selectedAthleteId) {
    return (
      <AthleteDetailPage
        athleteId={selectedAthleteId}
        initialFitnessOpen={openFitnessOnLoad}
        onBack={() => {
          if (onBackToRoster) {
            onBackToRoster();
            return;
          }
          returnFocusAthleteId.current = selectedAthleteId;
          setOpenFitnessOnLoad(false);
          setSelectedAthleteId(null);
          setInjuryReload((value) => value + 1);
        }}
        onAthleteUpdated={storeAthlete}
      />
    );
  }

  return (
    <section aria-labelledby="athletes-heading" aria-busy={loading}>
      <header className={styles.viewHeader}>
        <div>
          <p className={styles.eyebrow}>Coach-owned roster</p>
          <h1 id="athletes-heading">Athletes</h1>
          <p>{loading ? 'Loading roster...' : `${visible.length} athlete${visible.length === 1 ? '' : 's'} shown`}</p>
        </div>
        <div className={styles.controls}>
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
          <label className={styles.search}>
            <span aria-hidden="true">⌕</span>
            <span className={styles.srOnly}>Search athletes by name</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search athletes..." />
          </label>
          <label className={styles.srOnly} htmlFor="squad-filter">Filter by squad</label>
          <Select
            id="squad-filter"
            icon="squad"
            value={squadId}
            onChange={(event) => setSquadId(event.target.value)}
            options={[{ value: '', label: 'All squads' }, ...squads.map((squad) => ({ value: squad.id, label: `${squad.name}${squad.archivedAt ? ' (archived)' : ''}` }))]}
          />
          <label className={styles.srOnly} htmlFor="status-filter">Filter by roster status</label>
          <Select
            id="status-filter"
            icon="status"
            dotColors={{ active: '#0092BC', inactive: '#D8A642', archived: '#6B8792' }}
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
            options={[
              { value: 'active', label: `Active (${statusCounts.active})` },
              { value: 'inactive', label: `Inactive (${statusCounts.inactive})` },
              { value: 'archived', label: `Archived (${statusCounts.archived})` },
              { value: 'all', label: `All athletes (${athletes.length})` },
            ]}
          />

          <Button
            ref={addButtonRef}
            onClick={() => setEditor('new')}
            disabled={loading || Boolean(loadError) || pendingId !== null}
          >
            Add athlete
          </Button>
        </div>
      </header>

      {notice && <Toast variant="success" onDismiss={() => setNotice(null)}>{notice}</Toast>}
      {actionError && !archiveTarget && !geminiDialogOpen && <div className={styles.actionError} role="alert">{actionError}</div>}
      {!loading && injuryError && <div className={styles.injuryError} role="alert">Injury summaries are unavailable. <Button variant="ghost" onClick={() => setInjuryReload((value) => value + 1)}>Retry injury summaries</Button></div>}

      {loading && (
        <div className={styles.loading} role="status" aria-live="polite">
          <span /> <span /> <span />
          <p>Loading your roster...</p>
        </div>
      )}

      {!loading && loadError && (
        <div className={styles.loadError} role="alert">
          <h2>Roster unavailable</h2>
          <p>{loadError}</p>
          <Button onClick={() => setReloadKey((value) => value + 1)}>Try again</Button>
        </div>
      )}

      {!loading && !loadError && athletes.length === 0 && (
        <div className={styles.emptyPanel}>
          <EmptyState title="No athletes yet" description="Add your first athlete to start building the roster." />
            <Button onClick={() => setEditor('new')}>Add your first athlete</Button>
        </div>
      )}

      {!loading && !loadError && athletes.length > 0 && visible.length === 0 && (
        <div className={styles.emptyPanel}>
          <EmptyState
            title={
                !query && !squadId && statusFilter === 'active'
                ? 'No active athletes'
                  : !query && !squadId && statusFilter === 'inactive'
                   ? 'No inactive athletes'
                  : !query && !squadId && statusFilter === 'archived'
                  ? 'No archived athletes'
                  : 'No athletes match your filters'
            }
            description="Adjust the roster filters or clear them to see more athletes."
          />
          {hasFilters && <Button variant="secondary" onClick={clearFilters}>Clear filters</Button>}
        </div>
      )}

      {!loading && !loadError && visible.length > 0 && (
        <div className={styles.grid} aria-label="Athlete roster">
          {visible.map((athlete) => (
            <Card className={styles.card} key={athlete.id}>
              <div className={styles.cardTop}>
                <span className={styles.avatar} aria-hidden="true">{initials(athlete.name)}</span>
                <span className={athlete.status === 'archived' ? styles.archivedBadge : athlete.status === 'inactive' ? styles.inactiveBadge : styles.activeBadge}>
                  {statusLabel(athlete.status)}
                </span>
              </div>
              <h2>{athlete.name}</h2>
               <p className={styles.squad}>{athlete.squads?.map((squad) => squad.name).join(', ') || 'No squad assigned'}</p>
              <dl className={styles.details}>
                <div><dt>Date of birth</dt><dd>{formatDate(athlete.dob)}</dd></div>
                <div><dt>Gender category</dt><dd>{athlete.gender ?? 'Not recorded'}</dd></div>
              </dl>
              <div className={styles.injurySummary}>
                {injuryLoading ? <span role="status">Loading injury summary...</span> : injuryError ? <span>Injury summary unavailable</span> : (
                  <CompactAnatomy
                    injuries={injurySummaries.get(athlete.id)?.activeInjuries ?? []}
                    highestSeverity={injurySummaries.get(athlete.id)?.highestSeverity ?? null}
                    onOpenFitness={() => openAthlete(athlete.id, true)}
                    disabled={athlete.status === 'archived'}
                  />
                )}
              </div>
              {athlete.notes && <p className={styles.notes}>{athlete.notes}</p>}
              <div className={styles.cardActions}>
                <Button
                  ref={(node) => {
                    if (node) performanceButtonRefs.current.set(athlete.id, node);
                    else performanceButtonRefs.current.delete(athlete.id);
                  }}
                  className={styles.performanceAction}
                  onClick={() => openAthlete(athlete.id)}
                  disabled={pendingId !== null}
                >
                  View performance
                </Button>
                {athlete.status !== 'archived' && <Button
                  variant="secondary"
                  onClick={() => setEditor(athlete)}
                  disabled={pendingId !== null}
                >
                  Edit
                </Button>}
                {athlete.status === 'archived' ? (
                  <Button onClick={() => void restore(athlete)} disabled={pendingId !== null}>
                    {pendingId === athlete.id ? 'Restoring...' : 'Restore'}
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="secondary"
                      onClick={() => void changeStatus(athlete, athlete.status === 'active' ? 'inactive' : 'active')}
                      disabled={pendingId !== null}
                    >
                      {pendingId === athlete.id ? 'Saving...' : athlete.status === 'active' ? 'Mark inactive' : 'Reactivate'}
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => setArchiveTarget(athlete)}
                      disabled={pendingId !== null}
                    >
                      Archive
                    </Button>
                  </>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={geminiDialogOpen}
        title="Athlora AI"
        onClose={() => {
          setGeminiDialogOpen(false);
          setActionError(null);
        }}
      >
        <div className={styles.aiDialog}>
          <section className={styles.aiResponse} aria-live="polite" aria-busy={geminiTesting}>
            <p className={styles.aiResponseLabel}>{geminiListening ? 'Listening hands-free' : geminiTesting ? 'Athlora is responding' : 'Athlora'}</p>
            <p>{geminiResponse || (geminiTesting ? 'Starting Athlora...' : 'Ask Athlora to add an athlete or help with the roster.')}</p>
          </section>

          <div className={styles.aiActions}>
            {geminiConnected && !geminiListening && <Button variant="secondary" onClick={() => void startGeminiListening()}>Enable hands-free</Button>}
            {geminiListening && <span role="status">Listening hands-free</span>}
          </div>

          {actionError && <p className={styles.formError} role="alert">{actionError}</p>}

          <form className={styles.aiComposer} onSubmit={(event) => { event.preventDefault(); void sendGeminiMessage(); }}>
            <label className={styles.srOnly} htmlFor="athlora-ai-message">Message Athlora</label>
            <input
              id="athlora-ai-message"
              type="text"
              value={geminiMessage}
              onChange={(event) => setGeminiMessage(event.target.value)}
              placeholder="e.g. Add John Smith"
              disabled={geminiTesting}
            />
            <Button type="submit" disabled={geminiTesting || !geminiMessage.trim()}>{geminiTesting ? 'Sending...' : 'Send'}</Button>
          </form>
        </div>
      </Modal>

      <Modal
        open={editor !== null}
        title={editor === 'new' ? 'Add athlete' : 'Edit athlete'}
        onClose={() => {
          if (!editorBusy) setEditor(null);
        }}
        closeDisabled={editorBusy}
      >
        {editor && (
          <AthleteForm
            key={editor === 'new' ? 'new' : editor.id}
            athlete={editor === 'new' ? undefined : editor}
            onSave={saveEditor}
            onCancel={() => setEditor(null)}
            onSubmittingChange={setEditorBusy}
          />
        )}
      </Modal>

      <Modal
        open={archiveTarget !== null}
        title="Archive athlete"
        onClose={() => {
          setArchiveTarget(null);
          setActionError(null);
        }}
        closeDisabled={pendingId === archiveTarget?.id}
      >
        {archiveTarget && (
          <div className={styles.confirmation}>
            <p>
              Archive <strong>{archiveTarget.name}</strong>? They will leave the active roster,
              but their event assignments, timeline entries, and results will be preserved.
              You can restore them later.
            </p>
            {actionError && <p className={styles.formError} role="alert">{actionError}</p>}
            <div className={styles.formActions}>
              <Button variant="secondary" onClick={() => setArchiveTarget(null)} disabled={pendingId === archiveTarget.id}>Cancel</Button>
              <Button variant="danger" onClick={() => void confirmArchive()} disabled={pendingId === archiveTarget.id}>
                {pendingId === archiveTarget.id ? 'Archiving...' : 'Archive athlete'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}
