import {
  Behavior,
  GoogleGenAI,
  InteractionStatus,
  Modality,
  ThinkingLevel,
  Type,
  type LiveServerMessage,
  type Session,
} from "@google/genai";

const DEV = import.meta.env.DEV;
const GEMINI_OUTPUT_SAMPLE_RATE = "24000";
const GEMINI_SETUP_TIMEOUT_MS = 15_000;

export const GEMINI_LIVE_DEFAULT_MODEL = "gemini-3.8-live-extended-thinking";

export const GEMINI_LIVE_ROLLBACK_MODEL = "gemini-3.1-flash-live-preview";

function debugSession(event: string, details?: Record<string, unknown>): void {
  if (DEV) {
    console.info("[Athlora AI]", event, details ?? "");
  }
}

function isGeminiPcm24k(mimeType: string | undefined): boolean {
  if (!mimeType) {
    return false;
  }

  const [mediaType, ...parameters] = mimeType
    .toLowerCase()
    .split(";")
    .map((value) => value.trim());

  if (mediaType !== "audio/pcm") {
    return false;
  }

  const rate = parameters
    .map((parameter) => parameter.split("="))
    .find(([name]) => name === "rate")?.[1];

  return rate === undefined || rate === GEMINI_OUTPUT_SAMPLE_RATE;
}

export interface GeminiFunctionCall {
  id?: string;
  name?: string;
  args?: Record<string, unknown>;
}

export type GeminiToolHandler = (
  call: GeminiFunctionCall,
  signal?: AbortSignal,
) => Promise<unknown>;

export interface GeminiLiveSessionOptions {
  token: string;

  /** The model authorised for this session, normally supplied by the token broker. */
  model?: string;

  onAudio?: (base64Audio: string) => void;

  onTranscript?: (text: string) => void;

  /** Transcribed user speech. This is kept separate from model output. */
  onInputTranscript?: (text: string) => void;

  onTurnStart?: () => void;

  onTurnComplete?: () => void;

  onInteractionStatus?: (status: InteractionStatus) => void;

  onInterrupted?: () => void;

  onSleepRequested?: () => void;

  onConnected?: () => void;

  onReady?: () => void;

  onDisconnected?: () => void;

  onError?: (error: Error) => void;

  onToolCall?: GeminiToolHandler;

  onToolCallStart?: (call: GeminiFunctionCall) => void;

  onToolCallEnd?: (call: GeminiFunctionCall) => void;
}

export class AthloraGeminiSession {
  private session: Session | null = null;

  private connecting: Promise<void> | null = null;

  private pendingConnectionReject: ((error: Error) => void) | null = null;

  private setupTimeout: ReturnType<typeof globalThis.setTimeout> | null = null;

  private connectionGeneration = 0;

  private ready = false;

  private options: GeminiLiveSessionOptions;

  private transcript = "";

  private receivingTurn = false;

  private interactionInProgress = false;

  private activeToolCalls = new Map<AbortController, string | undefined>();

  private pendingTurnResolve: ((value: string) => void) | null = null;

  private pendingTurnReject: ((error: Error) => void) | null = null;

  constructor(options: GeminiLiveSessionOptions) {
    this.options = options;
  }

  async connect(): Promise<void> {
    if (this.session && this.ready) {
      return;
    }

    if (this.connecting) {
      return this.connecting;
    }

    const generation = ++this.connectionGeneration;
    this.interactionInProgress = false;
    const connecting = (async () => {
      const ai = new GoogleGenAI({
        apiKey: this.options.token,

        httpOptions: {
          apiVersion: "v1alpha",
        },
      });

      debugSession("Gemini connecting");

      const liveSession = await new Promise<Session>((resolve, reject) => {
        const rejectConnection = (error: Error) => {
          if (this.pendingConnectionReject !== rejectConnection) {
            return;
          }

          this.clearPendingConnection();
          reject(error);
        };

        this.pendingConnectionReject = rejectConnection;
        this.setupTimeout = globalThis.setTimeout(() => {
          debugSession("Gemini setup timed out", {
            timeoutMs: GEMINI_SETUP_TIMEOUT_MS,
          });
          rejectConnection(
            new Error("Gemini did not complete setup. Please try again."),
          );
        }, GEMINI_SETUP_TIMEOUT_MS);

        void ai.live.connect({
        model: this.options.model ?? GEMINI_LIVE_DEFAULT_MODEL,

        config: {
          responseModalities: [Modality.AUDIO],

          outputAudioTranscription: {},

          inputAudioTranscription: {},

          thinkingConfig: {
            thinkingLevel: ThinkingLevel.MEDIUM,
          },

          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: "Sulafat",
              },
            },
          },

          systemInstruction: {
            parts: [
              {
                text:
                  "You are Athlora, the Athlora voice assistant. " +
                  "You help authorised coaches with Athlora roster data, analytics, and weather. " +
                  "Never invent Athlora platform data, athletes, disciplines, rankings, results, places, or weather. " +
                  "Use the available tools for every platform-data question and action; treat tool results as authoritative. " +
                  "Use get_current_page_context when a coach refers to this page or this athlete; it exposes only the current page and an authorised selected-athlete reference. " +
                  "For athlete creation, use prepare_athlete_draft only after resolving a real discipline, validating the name and discipline, and checking likely duplicates. " +
                  "prepare_athlete_draft never creates an athlete. The browser presents local Confirm and Cancel controls; you cannot confirm, cancel, or create an athlete. " +
                  "For athlete analytics, search_athletes first and use an athlete returned by that tool. " +
                  "For named-place weather, use get_named_place_weather. If it returns choices, ask the coach to choose one and pass only its option ID; never invent or repeat coordinates. " +
                  "Use get_current_location_weather only when the current coach message explicitly asks for weather at their current, device, or present location. " +
                  "Do not ask for or expose coordinates. Only describe analytics summaries and rankings supplied by analytics tools. " +
                  "For every date-range, coach-wide, or roster-wide analytics query, use the applicable analytics tool before answering. " +
                  "Use evidence first: give performance guidance only when tool results establish the direction of change. Explain the factual change versus its baseline, why it matters, and one concrete tactical action. " +
                  "When results contain no data or do not support a conclusion, explicitly state that there is no data or no conclusion. " +
                  "Treat injury tool signals as monitoring only, never as diagnoses or medical advice. Never claim or infer workload, wellness, or readiness. " +
                  "Reports require actual tool results: never claim that a report was generated, downloaded, or available without an actual report tool result. " +
                  "If the user asks you to sleep, go to sleep, switch off, deactivate, stop listening, or otherwise go inactive, call sleep_assistant. " +
                  'After sleep_assistant succeeds, say exactly: "Going to sleep." and say nothing else. ' +
                  "Do not call sleep_assistant for ordinary conversational uses of the word sleep that are not directed at you. " +
                  "Keep responses short and conversational. " +
                  "VOICE AND SPEAKING STYLE: Speak in a warm, calm, friendly and confident manner. " +
                  "Use a natural conversational speaking pace that is slightly slower than normal. " +
                  "Do not rush through sentences. Use short natural pauses between important ideas. " +
                  "Keep explanations clear and easy to follow. Avoid sounding robotic, overly energetic, dramatic or like an announcer. " +
                  "Your voice should feel like a knowledgeable coach speaking directly to an athlete. " +
                  "When asked to start the assistant, greet the user by saying exactly: " +
                  '"Good day coach, how can I help?"',
              },
            ],
          },

          tools: [
            {
              functionDeclarations: [
                {
                  name: "get_current_page_context",

                  behavior: Behavior.NON_BLOCKING,

                  description:
                    'Get the current console page and, where applicable, the authorised athlete currently being viewed. Use for requests such as "this athlete" or "this page".',

                  parameters: {
                    type: Type.OBJECT,
                    properties: {},
                  },
                },
                {
                  name: "list_disciplines",

                  behavior: Behavior.NON_BLOCKING,

                  description:
                    "List real Athlora discipline definitions. Use this before referring to a discipline or preparing a draft.",

                  parameters: {
                    type: Type.OBJECT,

                    properties: {
                      query: {
                        type: Type.STRING,
                        description:
                          "Optional discipline code or label to find.",
                      },
                    },
                  },
                },
                {
                  name: "search_athletes",

                  behavior: Behavior.NON_BLOCKING,

                  description:
                    "Search the current Athlora workspace for athletes by name. Use this before athlete analytics.",

                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      query: {
                        type: Type.STRING,
                        description:
                          "The athlete name or name fragment to search.",
                      },
                    },
                    required: ["query"],
                  },
                },
                {
                  name: "get_athlete_discipline_analysis",

                  behavior: Behavior.NON_BLOCKING,

                  description:
                    "Retrieve authoritative discipline analytics for an athlete returned by search_athletes.",

                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      athleteId: {
                        type: Type.STRING,
                        description: "An ID returned by search_athletes.",
                      },
                      discipline: {
                        type: Type.STRING,
                        description: "A real discipline code or label.",
                      },
                      year: {
                        type: Type.STRING,
                        description: "Optional four-digit season year or all.",
                      },
                    },
                    required: ["athleteId", "discipline"],
                  },
                },
                {
                  name: "get_workspace_discipline_analysis",

                  behavior: Behavior.NON_BLOCKING,

                  description:
                    "Retrieve the authoritative workspace ranking and summaries for one real discipline.",

                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      discipline: {
                        type: Type.STRING,
                        description: "A real discipline code or label.",
                      },
                      year: {
                        type: Type.STRING,
                        description: "Optional four-digit season year or all.",
                      },
                    },
                    required: ["discipline"],
                  },
                },
                {
                  name: "get_coach_performance_analysis",

                  behavior: Behavior.NON_BLOCKING,

                  description:
                    "Retrieve authoritative coach performance analysis for selected athletes or the coach roster over an optional discipline and date range.",

                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      athleteIds: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                        description:
                          "Optional IDs for one or more authorised athletes.",
                      },
                      discipline: {
                        type: Type.STRING,
                        description: "Optional real discipline code or label.",
                      },
                      dateFrom: {
                        type: Type.STRING,
                        description:
                          "Optional inclusive start date in YYYY-MM-DD format.",
                      },
                      dateTo: {
                        type: Type.STRING,
                        description:
                          "Optional inclusive end date in YYYY-MM-DD format.",
                      },
                      lifecycleStatus: {
                        type: Type.STRING,
                        description:
                          "Optional athlete lifecycle status filter.",
                      },
                    },
                  },
                },
                {
                  name: "get_coach_injury_analysis",

                  behavior: Behavior.NON_BLOCKING,

                  description:
                    "Retrieve authoritative coach injury monitoring signals for selected athletes or the coach roster. Results are monitoring information, not diagnoses.",

                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      athleteIds: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                        description:
                          "Optional IDs for one or more authorised athletes.",
                      },
                      dateFrom: {
                        type: Type.STRING,
                        description:
                          "Optional inclusive start date in YYYY-MM-DD format.",
                      },
                      dateTo: {
                        type: Type.STRING,
                        description:
                          "Optional inclusive end date in YYYY-MM-DD format.",
                      },
                      lifecycleStatus: {
                        type: Type.STRING,
                        description:
                          "Optional athlete lifecycle status filter.",
                      },
                    },
                  },
                },
                {
                  name: "get_coach_rankings_analysis",

                  behavior: Behavior.NON_BLOCKING,

                  description:
                    "Retrieve the authoritative promising-athlete ranking for one real discipline across the coach roster.",

                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      discipline: {
                        type: Type.STRING,
                        description: "A real discipline code or label.",
                      },
                      dateFrom: {
                        type: Type.STRING,
                        description:
                          "Optional inclusive start date in YYYY-MM-DD format.",
                      },
                      dateTo: {
                        type: Type.STRING,
                        description:
                          "Optional inclusive end date in YYYY-MM-DD format.",
                      },
                      lifecycleStatus: {
                        type: Type.STRING,
                        description:
                          "Optional athlete lifecycle status filter.",
                      },
                      limit: {
                        type: Type.INTEGER,
                        description:
                          "Optional maximum number of ranked athletes to return.",
                      },
                    },
                    required: ["discipline"],
                  },
                },
                {
                  name: "download_coach_performance_report",

                  behavior: Behavior.NON_BLOCKING,

                  description:
                    "Generate and download a coach performance report for selected athletes or the coach roster using the supplied filters.",

                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      athleteIds: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                        description:
                          "Optional IDs for one or more authorised athletes.",
                      },
                      discipline: {
                        type: Type.STRING,
                        description: "A real discipline code or label.",
                      },
                      dateFrom: {
                        type: Type.STRING,
                        description:
                          "Optional inclusive start date in YYYY-MM-DD format.",
                      },
                      dateTo: {
                        type: Type.STRING,
                        description:
                          "Optional inclusive end date in YYYY-MM-DD format.",
                      },
                      lifecycleStatus: {
                        type: Type.STRING,
                        description:
                          "Optional athlete lifecycle status filter.",
                      },
                    },
                  },
                },
                {
                  name: "download_coach_injury_report",

                  behavior: Behavior.NON_BLOCKING,

                  description:
                    "Generate and download a coach injury monitoring report for selected athletes or the coach roster using the supplied filters.",

                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      athleteIds: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                        description:
                          "Optional IDs for one or more authorised athletes.",
                      },
                      dateFrom: {
                        type: Type.STRING,
                        description:
                          "Optional inclusive start date in YYYY-MM-DD format.",
                      },
                      dateTo: {
                        type: Type.STRING,
                        description:
                          "Optional inclusive end date in YYYY-MM-DD format.",
                      },
                      lifecycleStatus: {
                        type: Type.STRING,
                        description:
                          "Optional athlete lifecycle status filter.",
                      },
                    },
                  },
                },
                {
                  name: "download_coach_rankings_report",

                  behavior: Behavior.NON_BLOCKING,

                  description:
                    "Generate and download a coach rankings report for one real discipline using the supplied filters.",

                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      discipline: {
                        type: Type.STRING,
                        description: "Optional real discipline code or label.",
                      },
                      dateFrom: {
                        type: Type.STRING,
                        description:
                          "Optional inclusive start date in YYYY-MM-DD format.",
                      },
                      dateTo: {
                        type: Type.STRING,
                        description:
                          "Optional inclusive end date in YYYY-MM-DD format.",
                      },
                      lifecycleStatus: {
                        type: Type.STRING,
                        description:
                          "Optional athlete lifecycle status filter.",
                      },
                      limit: {
                        type: Type.INTEGER,
                        description:
                          "Optional maximum number of ranked athletes to include.",
                      },
                    },
                    required: ["discipline"],
                  },
                },
                {
                  name: "prepare_athlete_draft",

                  behavior: Behavior.NON_BLOCKING,

                  description:
                    "Prepare, but never create, an athlete draft. The browser validates the real discipline and duplicate names before showing local confirmation controls.",

                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      name: {
                        type: Type.STRING,
                        description: "The athlete name.",
                      },
                      discipline: {
                        type: Type.STRING,
                        description: "A requested discipline code or label.",
                      },
                      dob: {
                        type: Type.STRING,
                        description:
                          "Optional date of birth in YYYY-MM-DD format.",
                      },
                      gender: {
                        type: Type.STRING,
                        description: "Optional gender category.",
                      },
                      notes: {
                        type: Type.STRING,
                        description: "Optional coach notes.",
                      },
                    },

                    required: ["name", "discipline"],
                  },
                },
                {
                  name: "get_named_place_weather",

                  behavior: Behavior.NON_BLOCKING,

                  description:
                    "Get current weather for a named place through Athlora. If venue choices are returned, ask the coach to choose an option ID before calling again.",

                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      place: {
                        type: Type.STRING,
                        description: "A named venue, city, or place to search.",
                      },
                      venueOptionId: {
                        type: Type.STRING,
                        description:
                          "A venue option ID returned by a prior call.",
                      },
                    },
                    required: ["place"],
                  },
                },
                {
                  name: "get_current_location_weather",

                  behavior: Behavior.NON_BLOCKING,

                  description:
                    "Get normalized weather for the coach current browser location after an explicit current-location weather request.",

                  parameters: {
                    type: Type.OBJECT,
                    properties: {},
                  },
                },
                {
                  name: "sleep_assistant",

                  behavior: Behavior.NON_BLOCKING,

                  description:
                    'Put Athlora to sleep when the user asks the assistant to sleep, switch off, deactivate, stop listening, or otherwise go inactive. After the tool succeeds, reply exactly: "Going to sleep."',

                  parameters: {
                    type: Type.OBJECT,
                    properties: {},
                  },
                },
              ],
            },
          ],
        },

        callbacks: {
          onopen: () => {
            if (generation !== this.connectionGeneration) {
              return;
            }

            debugSession("Gemini transport connected");
            this.options.onConnected?.();
          },

          onmessage: (message: LiveServerMessage) => {
            if (generation === this.connectionGeneration) {
              void this.handleMessage(message);
            }
          },

          onerror: (event) => {
            if (generation !== this.connectionGeneration) {
              return;
            }

            const error = new Error(
              event.message || "Gemini Live connection error",
            );

            debugSession("Gemini connection error", {
              phase: this.ready ? "session" : "setup",
              message: error.message,
            });

            this.options.onError?.(error);

            this.cancelActiveToolCalls();
            this.interactionInProgress = false;

            this.pendingTurnReject?.(error);

            this.clearPendingTurn();
            this.rejectPendingConnection(error);
          },

          onclose: (event) => {
            if (generation !== this.connectionGeneration) {
              return;
            }

            const closedDuringSetup = !this.ready;
            const error = new Error(
              closedDuringSetup
                ? "Gemini closed before setup completed. Please try again."
                : "Gemini Live session closed",
            );

            debugSession("Gemini connection closed", {
              phase: closedDuringSetup ? "setup" : "session",
              code: event.code,
              reason: event.reason || undefined,
            });

            this.session = null;
            this.ready = false;
            this.receivingTurn = false;
            this.interactionInProgress = false;
            this.cancelActiveToolCalls();
            this.rejectPendingTurn(error);

            if (closedDuringSetup) {
              this.options.onError?.(error);
              this.rejectPendingConnection(error);
            }

            this.options.onDisconnected?.();
          },
        },
        }).then(
          (connectedSession) => {
            this.clearPendingConnection();
            resolve(connectedSession);
          },
          (error: unknown) => {
            const connectionError =
              error instanceof Error
                ? error
                : new Error("Gemini Live connection failed");
            this.clearPendingConnection();
            reject(connectionError);
          },
        );
      });

      if (generation !== this.connectionGeneration) {
        liveSession.close();
        return;
      }

      this.session = liveSession;
      this.ready = true;
      debugSession("Gemini session ready");
      this.options.onReady?.();
    })();

    this.connecting = connecting;

    try {
      await connecting;
    } finally {
      if (this.connecting === connecting) {
        this.connecting = null;
      }
    }
  }

  async sendText(text: string): Promise<string> {
    if (!this.session || !this.ready) {
      throw new Error("Gemini Live session is not connected");
    }

    if (this.pendingTurnResolve || this.interactionInProgress) {
      throw new Error("Gemini is already responding");
    }

    this.transcript = "";

    const responsePromise = new Promise<string>((resolve, reject) => {
      this.pendingTurnResolve = resolve;
      this.pendingTurnReject = reject;
    });

    this.session.sendClientContent({
      turns: [
        {
          role: "user",
          parts: [
            {
              text,
            },
          ],
        },
      ],

      turnComplete: true,
    });

    debugSession("Gemini text turn sent");

    return responsePromise;
  }

  sendAudio(base64Audio: string): void {
    if (!this.session) {
      throw new Error("Gemini Live session is not connected");
    }

    this.session.sendRealtimeInput({
      audio: {
        data: base64Audio,
        mimeType: "audio/pcm;rate=16000",
      },
    });
  }

  endAudioStream(): void {
    if (!this.session) {
      return;
    }

    this.session.sendRealtimeInput({
      audioStreamEnd: true,
    });
  }

  close(): void {
    this.connectionGeneration += 1;
    this.rejectPendingConnection(new Error("Gemini Live session closed"));
    this.cancelActiveToolCalls();
    this.session?.close();
    this.session = null;
    this.ready = false;
    this.receivingTurn = false;
    this.interactionInProgress = false;
    this.connecting = null;

    this.rejectPendingTurn(new Error("Gemini Live session closed"));
  }

  private rejectPendingTurn(error: Error): void {
    this.pendingTurnReject?.(error);
    this.clearPendingTurn();
  }

  private rejectPendingConnection(error: Error): void {
    this.pendingConnectionReject?.(error);
  }

  private clearPendingConnection(): void {
    if (this.setupTimeout !== null) {
      globalThis.clearTimeout(this.setupTimeout);
      this.setupTimeout = null;
    }

    this.pendingConnectionReject = null;
  }

  private clearPendingTurn(): void {
    this.pendingTurnResolve = null;
    this.pendingTurnReject = null;
  }

  private completeTurn(): void {
    if (
      !this.pendingTurnResolve &&
      !this.receivingTurn &&
      !this.interactionInProgress
    ) {
      return;
    }

    const response = this.transcript.trim() || "Gemini completed the request.";

    this.pendingTurnResolve?.(response);
    this.clearPendingTurn();
    this.receivingTurn = false;
    this.interactionInProgress = false;
    this.options.onTurnComplete?.();
  }

  private cancelActiveToolCalls(ids?: string[]): void {
    for (const [controller, callId] of this.activeToolCalls) {
      if (!ids || (callId !== undefined && ids.includes(callId))) {
        controller.abort();
      }
    }
  }

  private async handleToolCalls(calls: GeminiFunctionCall[]): Promise<void> {
    const session = this.session;

    if (!session) {
      return;
    }

    const generation = this.connectionGeneration;
    const controllers: AbortController[] = [];
    let sleepRequested = false;

    try {
      const functionResponses = await Promise.all(
        calls.map(async (call) => {
          const controller = new AbortController();
          controllers.push(controller);
          this.activeToolCalls.set(controller, call.id);
          this.options.onToolCallStart?.(call);

          try {
            if (call.name === "sleep_assistant") {
              sleepRequested = true;

              return {
                id: call.id,
                name: call.name,
                response: {
                  success: true,
                },
              };
            }

            if (!this.options.onToolCall) {
              throw new Error("No Gemini tool handler configured");
            }

            const result = await this.options.onToolCall(
              call,
              controller.signal,
            );

            return {
              id: call.id,
              name: call.name,
              response: {
                result,
              },
            };
          } catch (error) {
            return {
              id: call.id,
              name: call.name,

              response: {
                error:
                  error instanceof Error
                    ? error.message
                    : "Tool execution failed",
              },
            };
          } finally {
            this.options.onToolCallEnd?.(call);
          }
        }),
      );

      if (
        generation !== this.connectionGeneration ||
        this.session !== session ||
        !this.ready ||
        controllers.some((controller) => controller.signal.aborted)
      ) {
        return;
      }

      session.sendToolResponse({
        functionResponses,
      });

      if (sleepRequested) {
        this.options.onSleepRequested?.();
      }
    } finally {
      for (const controller of controllers) {
        this.activeToolCalls.delete(controller);
      }
    }
  }

  private async handleMessage(message: LiveServerMessage): Promise<void> {
    const content = message.serverContent;

    /*
     * If Gemini reports an interruption, anything already
     * queued in the browser belongs to a cancelled response.
     * Tell the page to clear that playback immediately.
     */
    if (content?.interrupted) {
      debugSession("Model interrupted");
      this.cancelActiveToolCalls();

      const interruptedResponse =
        this.transcript.trim() || "Gemini response interrupted.";

      this.pendingTurnResolve?.(interruptedResponse);

      this.clearPendingTurn();

      this.receivingTurn = false;
      this.interactionInProgress = false;

      this.options.onInterrupted?.();

      return;
    }

    if (message.toolCallCancellation?.ids) {
      this.cancelActiveToolCalls(message.toolCallCancellation.ids);
    }

    if (message.toolCall?.functionCalls?.length) {
      await this.handleToolCalls(
        message.toolCall.functionCalls.map((call) => ({
          id: call.id,
          name: call.name,
          args: call.args as Record<string, unknown> | undefined,
        })),
      );

      return;
    }

    if (!content) {
      return;
    }

    const interactionStatus = content.interactionStatus;

    if (interactionStatus) {
      this.options.onInteractionStatus?.(interactionStatus);

      if (interactionStatus === InteractionStatus.IN_PROGRESS) {
        this.interactionInProgress = true;
      }
    }

    const parts = content.modelTurn?.parts ?? [];

    const transcription = content.outputTranscription?.text;

    const inputTranscription = (
      content as unknown as { inputTranscription?: { text?: string } }
    ).inputTranscription?.text;

    if (inputTranscription) {
      this.options.onInputTranscript?.(inputTranscription);
    }

    const hasTurnOutput = parts.length > 0 || Boolean(transcription);

    if (hasTurnOutput && !this.receivingTurn) {
      this.receivingTurn = true;
      this.transcript = "";

      debugSession("Gemini turn output started", {
        audio: parts.some((part) => Boolean(part.inlineData?.data)),
        transcription: Boolean(transcription),
      });

      this.options.onTurnStart?.();
    }

    for (const part of parts) {
      const inlineData = part.inlineData;

      if (inlineData?.data && isGeminiPcm24k(inlineData.mimeType)) {
        this.options.onAudio?.(inlineData.data);
      } else if (inlineData?.data) {
        debugSession("Ignored non-PCM Gemini audio payload", {
          mimeType: inlineData.mimeType ?? "missing",
        });
      }
    }

    if (transcription) {
      this.transcript += transcription;

      this.options.onTranscript?.(transcription);
    }

    if (content.turnComplete || interactionStatus === InteractionStatus.IDLE) {
      this.completeTurn();
    }
  }
}
