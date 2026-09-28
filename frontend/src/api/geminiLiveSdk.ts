import {
  GoogleGenAI,
  Modality,
  Type,
  type LiveServerMessage,
  type Session,
} from '@google/genai';

const DEV = import.meta.env.DEV;
const GEMINI_OUTPUT_SAMPLE_RATE = '24000';

function debugSession(event: string, details?: Record<string, unknown>): void {
  if (DEV) {
    console.info('[Athlora AI]', event, details ?? '');
  }
}

function isGeminiPcm24k(mimeType: string | undefined): boolean {
  if (!mimeType) {
    return false;
  }

  const [mediaType, ...parameters] = mimeType
    .toLowerCase()
    .split(';')
    .map((value) => value.trim());

  if (mediaType !== 'audio/pcm') {
    return false;
  }

  const rate = parameters
    .map((parameter) => parameter.split('='))
    .find(([name]) => name === 'rate')?.[1];

  return rate === undefined || rate === GEMINI_OUTPUT_SAMPLE_RATE;
}

export interface GeminiFunctionCall {
  id?: string;
  name?: string;
  args?: Record<string, unknown>;
}

export type GeminiToolHandler = (
  call: GeminiFunctionCall,
) => Promise<unknown>;

export interface GeminiLiveSessionOptions {
  token: string;

  onAudio?: (base64Audio: string) => void;

  onTranscript?: (text: string) => void;

  /** Transcribed user speech. This is kept separate from model output. */
  onInputTranscript?: (text: string) => void;

  onTurnStart?: () => void;

  onTurnComplete?: () => void;

  onInterrupted?: () => void;

  onSleepRequested?: () => void;

  onConnected?: () => void;

  onReady?: () => void;

  onDisconnected?: () => void;

  onError?: (error: Error) => void;

  onToolCall?: GeminiToolHandler;
}

export class AthloraGeminiSession {
  private session: Session | null = null;

  private connecting: Promise<void> | null = null;

  private connectionGeneration = 0;

  private ready = false;

  private options: GeminiLiveSessionOptions;

  private transcript = '';

  private receivingTurn = false;

  private pendingTurnResolve:
    | ((value: string) => void)
    | null = null;

  private pendingTurnReject:
    | ((error: Error) => void)
    | null = null;

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
    const connecting = (async () => {
      const ai = new GoogleGenAI({
        apiKey: this.options.token,

        httpOptions: {
          apiVersion: 'v1alpha',
        },
      });

      debugSession('Gemini connecting');

      const liveSession = await ai.live.connect({
        model: 'gemini-3.1-flash-live-preview',

        config: {
          responseModalities: [
            Modality.AUDIO,
          ],

          outputAudioTranscription: {},

          inputAudioTranscription: {},

          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: 'Sulafat',
              },
            },
          },

          systemInstruction: {
            parts: [
              {
                text:
                  'You are Athlora, the Athlora voice assistant. ' +
                  'You help authorised coaches with Athlora roster data, analytics, and weather. ' +
                  'Never invent Athlora platform data, athletes, disciplines, rankings, results, places, or weather. ' +
                   'Use the available tools for every platform-data question and action; treat tool results as authoritative. ' +
                   'Use get_current_page_context when a coach refers to this page or this athlete; it exposes only the current page and an authorised selected-athlete reference. ' +
                  'For athlete creation, use prepare_athlete_draft only after resolving a real discipline, validating the name and discipline, and checking likely duplicates. ' +
                  'prepare_athlete_draft never creates an athlete. The browser presents local Confirm and Cancel controls; you cannot confirm, cancel, or create an athlete. ' +
                  'For athlete analytics, search_athletes first and use an athlete returned by that tool. ' +
                  'For named-place weather, use get_named_place_weather. If it returns choices, ask the coach to choose one and pass only its option ID; never invent or repeat coordinates. ' +
                  'Use get_current_location_weather only when the current coach message explicitly asks for weather at their current, device, or present location. ' +
                  'Do not ask for or expose coordinates. Only describe analytics summaries and rankings supplied by analytics tools. ' +
                  'If the user asks you to sleep, go to sleep, switch off, deactivate, stop listening, or otherwise go inactive, call sleep_assistant. ' +
                  'After sleep_assistant succeeds, say exactly: "Going to sleep." and say nothing else. ' +
                  'Do not call sleep_assistant for ordinary conversational uses of the word sleep that are not directed at you. ' +
                  'Keep responses short and conversational. ' +
                  'VOICE AND SPEAKING STYLE: Speak in a warm, calm, friendly and confident manner. ' +
                  'Use a natural conversational speaking pace that is slightly slower than normal. ' +
                  'Do not rush through sentences. Use short natural pauses between important ideas. ' +
                  'Keep explanations clear and easy to follow. Avoid sounding robotic, overly energetic, dramatic or like an announcer. ' +
                  'Your voice should feel like a knowledgeable coach speaking directly to an athlete. ' +
                   'When asked to start the assistant, greet the user by saying exactly: ' +
                   '"Good day coach, how can I help?"',
              },
            ],
          },

          tools: [
            {
              functionDeclarations: [
                {
                  name: 'get_current_page_context',

                  description:
                    'Get the current console page and, where applicable, the authorised athlete currently being viewed. Use for requests such as "this athlete" or "this page".',

                  parameters: {
                    type: Type.OBJECT,
                    properties: {},
                  },
                },
                {
                  name: 'list_disciplines',

                  description:
                    'List real Athlora discipline definitions. Use this before referring to a discipline or preparing a draft.',

                  parameters: {
                    type: Type.OBJECT,

                    properties: {
                      query: {
                        type: Type.STRING,
                        description:
                          'Optional discipline code or label to find.',
                      },
                    },
                  },
                },
                {
                  name: 'search_athletes',

                  description:
                    'Search the current Athlora workspace for athletes by name. Use this before athlete analytics.',

                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      query: { type: Type.STRING, description: 'The athlete name or name fragment to search.' },
                    },
                    required: ['query'],
                  },
                },
                {
                  name: 'get_athlete_discipline_analysis',

                  description:
                    'Retrieve authoritative discipline analytics for an athlete returned by search_athletes.',

                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      athleteId: { type: Type.STRING, description: 'An ID returned by search_athletes.' },
                      discipline: { type: Type.STRING, description: 'A real discipline code or label.' },
                      year: { type: Type.STRING, description: 'Optional four-digit season year or all.' },
                    },
                    required: ['athleteId', 'discipline'],
                  },
                },
                {
                  name: 'get_workspace_discipline_analysis',

                  description:
                    'Retrieve the authoritative workspace ranking and summaries for one real discipline.',

                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      discipline: { type: Type.STRING, description: 'A real discipline code or label.' },
                      year: { type: Type.STRING, description: 'Optional four-digit season year or all.' },
                    },
                    required: ['discipline'],
                  },
                },
                {
                  name: 'prepare_athlete_draft',

                  description:
                    'Prepare, but never create, an athlete draft. The browser validates the real discipline and duplicate names before showing local confirmation controls.',

                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING, description: 'The athlete name.' },
                      discipline: { type: Type.STRING, description: 'A requested discipline code or label.' },
                      dob: { type: Type.STRING, description: 'Optional date of birth in YYYY-MM-DD format.' },
                      gender: { type: Type.STRING, description: 'Optional gender category.' },
                      notes: { type: Type.STRING, description: 'Optional coach notes.' },
                    },

                    required: ['name', 'discipline'],
                  },
                },
                {
                  name: 'get_named_place_weather',

                  description:
                    'Get current weather for a named place through Athlora. If venue choices are returned, ask the coach to choose an option ID before calling again.',

                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      place: { type: Type.STRING, description: 'A named venue, city, or place to search.' },
                      venueOptionId: { type: Type.STRING, description: 'A venue option ID returned by a prior call.' },
                    },
                    required: ['place'],
                  },
                },
                {
                  name: 'get_current_location_weather',

                  description:
                    'Get normalized weather for the coach current browser location after an explicit current-location weather request.',

                  parameters: {
                    type: Type.OBJECT,
                    properties: {},
                  },
                },
                {
                  name: 'sleep_assistant',

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

            debugSession('Gemini transport connected');
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
              event.message ||
                'Gemini Live connection error',
            );

            this.options.onError?.(error);

            this.pendingTurnReject?.(error);

            this.clearPendingTurn();
          },

          onclose: () => {
            if (generation !== this.connectionGeneration) {
              return;
            }

            this.session = null;
            this.ready = false;
            this.receivingTurn = false;
            this.rejectPendingTurn(new Error('Gemini Live session closed'));

            this.options.onDisconnected?.();
          },
        },
      });

      if (generation !== this.connectionGeneration) {
        liveSession.close();
        return;
      }

      this.session = liveSession;
      this.ready = true;
      debugSession('Gemini session ready');
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

  async sendText(
    text: string,
  ): Promise<string> {
    if (!this.session || !this.ready) {
      throw new Error(
        'Gemini Live session is not connected',
      );
    }

    if (this.pendingTurnResolve) {
      throw new Error(
        'Gemini is already responding',
      );
    }

    this.transcript = '';

    const responsePromise =
      new Promise<string>((resolve, reject) => {
        this.pendingTurnResolve = resolve;
        this.pendingTurnReject = reject;
      });

    this.session.sendClientContent({
      turns: [
        {
          role: 'user',
          parts: [
            {
              text,
            },
          ],
        },
      ],

      turnComplete: true,
    });

    return responsePromise;
  }

  sendAudio(base64Audio: string): void {
    if (!this.session) {
      throw new Error(
        'Gemini Live session is not connected',
      );
    }

    this.session.sendRealtimeInput({
      audio: {
        data: base64Audio,
        mimeType: 'audio/pcm;rate=16000',
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
    this.session?.close();
    this.session = null;
    this.ready = false;
    this.receivingTurn = false;
    this.connecting = null;

    this.rejectPendingTurn(new Error('Gemini Live session closed'));
  }

  private rejectPendingTurn(error: Error): void {
    this.pendingTurnReject?.(error);
    this.clearPendingTurn();
  }

  private clearPendingTurn(): void {
    this.pendingTurnResolve = null;
    this.pendingTurnReject = null;
  }

  private async handleMessage(
    message: LiveServerMessage,
  ): Promise<void> {
    if (
      message.toolCall?.functionCalls?.length
    ) {
      const functionResponses = [];
      let sleepRequested = false;

      for (
        const call
        of message.toolCall.functionCalls
      ) {
        if (call.name === 'sleep_assistant') {
          sleepRequested = true;

          functionResponses.push({
            id: call.id,
            name: call.name,
            response: {
              success: true,
            },
          });

          continue;
        }

        try {
          if (!this.options.onToolCall) {
            throw new Error(
              'No Gemini tool handler configured',
            );
          }

          const result =
            await this.options.onToolCall({
              id: call.id,
              name: call.name,
              args:
                call.args as
                  | Record<string, unknown>
                  | undefined,
            });

          functionResponses.push({
            id: call.id,
            name: call.name,
            response: {
              result,
            },
          });
        } catch (error) {
          functionResponses.push({
            id: call.id,
            name: call.name,

            response: {
              error:
                error instanceof Error
                  ? error.message
                  : 'Tool execution failed',
            },
          });
        }
      }

      this.session?.sendToolResponse({
        functionResponses,
      });

      if (sleepRequested) {
        this.options.onSleepRequested?.();
      }

      return;
    }

    const content =
      message.serverContent;

    if (!content) {
      return;
    }

    /*
     * If Gemini reports an interruption, anything already
     * queued in the browser belongs to a cancelled response.
     * Tell the page to clear that playback immediately.
     */
    if (content.interrupted) {
      debugSession('Model interrupted');

      const interruptedResponse =
        this.transcript.trim() ||
        'Gemini response interrupted.';

      this.pendingTurnResolve?.(
        interruptedResponse,
      );

      this.clearPendingTurn();

      this.receivingTurn = false;

      this.options.onInterrupted?.();

      return;
    }

    const parts =
      content.modelTurn?.parts ?? [];

    const transcription =
      content.outputTranscription?.text;

    const inputTranscription = (
      content as unknown as { inputTranscription?: { text?: string } }
    ).inputTranscription?.text;

    if (inputTranscription) {
      this.options.onInputTranscript?.(inputTranscription);
    }

    const hasTurnOutput =
      parts.length > 0 ||
      Boolean(transcription);

    if (
      hasTurnOutput &&
      !this.receivingTurn
    ) {
      this.receivingTurn = true;
      this.transcript = '';

      this.options.onTurnStart?.();
    }

    for (const part of parts) {
      const inlineData = part.inlineData;

      if (
        inlineData?.data &&
        isGeminiPcm24k(inlineData.mimeType)
      ) {
        this.options.onAudio?.(
          inlineData.data,
        );
      } else if (inlineData?.data) {
        debugSession('Ignored non-PCM Gemini audio payload', {
          mimeType: inlineData.mimeType ?? 'missing',
        });
      }
    }

    if (transcription) {
      this.transcript += transcription;

      this.options.onTranscript?.(
        transcription,
      );
    }

    if (content.turnComplete) {
      const response =
        this.transcript.trim() ||
        'Gemini completed the request.';

      this.pendingTurnResolve?.(
        response,
      );

      this.clearPendingTurn();

      this.receivingTurn = false;

      this.options.onTurnComplete?.();
    }
  }
}
