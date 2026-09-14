import {
  GoogleGenAI,
  Modality,
  Type,
  type LiveServerMessage,
  type Session,
} from '@google/genai';

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

  onTurnStart?: () => void;

  onTurnComplete?: () => void;

  onInterrupted?: () => void;

  onSleepRequested?: () => void;

  onConnected?: () => void;

  onDisconnected?: () => void;

  onError?: (error: Error) => void;

  onToolCall?: GeminiToolHandler;
}

export class AthloraGeminiSession {
  private session: Session | null = null;

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
    if (this.session) {
      return;
    }

    const ai = new GoogleGenAI({
      apiKey: this.options.token,

      httpOptions: {
        apiVersion: 'v1alpha',
      },
    });

    this.session = await ai.live.connect({
      model: 'gemini-3.1-flash-live-preview',

      config: {
        responseModalities: [
          Modality.AUDIO,
        ],

        outputAudioTranscription: {},

        systemInstruction: {
          parts: [
            {
              text:
                'You are Athlora, the Athlora voice assistant. ' +
                'Your current job is to help authorised users add athletes. ' +
                'Never invent missing information. ' +
                'Before creating an athlete, clearly confirm the athlete details with the user. ' +
                'Only call create_athlete after the user explicitly confirms. ' +
                'If the user asks you to sleep, go to sleep, switch off, deactivate, stop listening, or otherwise go inactive, call sleep_assistant. ' +
                'After sleep_assistant succeeds, say exactly: "Going to sleep." and say nothing else. ' +
                'Do not call sleep_assistant for ordinary conversational uses of the word sleep that are not directed at you. ' +
                'Keep responses short and conversational. ' +
                'When asked to start the assistant, greet the user by saying exactly: ' +
                '"Good Day Coach, who are we adding today?"',
            },
          ],
        },

        tools: [
          {
            functionDeclarations: [
              {
                name: 'create_athlete',

                description:
                  'Create a new athlete in Athlora after the user has explicitly confirmed the details.',

                parameters: {
                  type: Type.OBJECT,

                  properties: {
                    name: {
                      type: Type.STRING,
                      description:
                        'The athlete full name.',
                    },

                    dob: {
                      type: Type.STRING,
                      description:
                        'Optional date of birth in YYYY-MM-DD format.',
                    },

                    gender: {
                      type: Type.STRING,
                      description:
                        'Optional gender category.',
                    },

                    notes: {
                      type: Type.STRING,
                      description:
                        'Optional notes about the athlete.',
                    },
                  },

                  required: ['name'],
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
          this.options.onConnected?.();
        },

        onmessage: (message: LiveServerMessage) => {
          void this.handleMessage(message);
        },

        onerror: (event) => {
          const error = new Error(
            event.message ||
              'Gemini Live connection error',
          );

          this.options.onError?.(error);

          this.pendingTurnReject?.(error);

          this.clearPendingTurn();
        },

        onclose: () => {
          this.session = null;
          this.receivingTurn = false;

          this.options.onDisconnected?.();
        },
      },
    });
  }

  async sendText(
    text: string,
  ): Promise<string> {
    if (!this.session) {
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
    this.session?.close();
    this.session = null;
    this.receivingTurn = false;

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
      console.info('Athlora response interrupted');

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
        (
          !inlineData.mimeType ||
          inlineData.mimeType.startsWith(
            'audio/',
          )
        )
      ) {
        this.options.onAudio?.(
          inlineData.data,
        );
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
