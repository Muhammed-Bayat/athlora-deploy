const GEMINI_LIVE_MODEL = 'gemini-3.8-live';
const GEMINI_OUTPUT_SAMPLE_RATE = '24000';
const DEV = import.meta.env.DEV;

const GEMINI_LIVE_URL =
  'wss://generativelanguage.googleapis.com/ws/' +
  'google.ai.generativelanguage.v1beta.GenerativeService.' +
  'BidiGenerateContentConstrained';

interface GeminiFunctionCall {
  id: string;
  name: string;
  args?: Record<string, unknown>;
}

interface GeminiInlineData {
  data?: string;
  mimeType?: string;
}

interface GeminiPart {
  inlineData?: GeminiInlineData;
}

interface GeminiServerContent {
  modelTurn?: {
    parts?: GeminiPart[];
  };

  outputTranscription?: {
    text?: string;
  };

  turnComplete?: boolean;
}

interface GeminiServerMessage {
  setupComplete?: Record<string, never>;

  serverContent?: GeminiServerContent;

  toolCall?: {
    functionCalls?: GeminiFunctionCall[];
  };

  [key: string]: unknown;
}

export type GeminiToolHandler = (
  call: GeminiFunctionCall,
) => Promise<unknown>;

export type GeminiAudioHandler = (
  base64Audio: string,
) => void;

function debugLegacySession(event: string, details?: Record<string, unknown>): void {
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

async function readWebSocketMessage(
  data: string | Blob | ArrayBuffer,
): Promise<string> {
  if (typeof data === 'string') {
    return data;
  }

  if (data instanceof Blob) {
    return await data.text();
  }

  return new TextDecoder().decode(data);
}

export function connectGeminiLive(
  token: string,
): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const url =
      `${GEMINI_LIVE_URL}?access_token=${encodeURIComponent(token)}`;

    const socket = new WebSocket(url);

    let settled = false;

    const timeout = window.setTimeout(() => {
      if (settled) return;

      settled = true;
      socket.close();

      reject(
        new Error('Gemini Live connection timed out'),
      );
    }, 10_000);

    socket.onopen = () => {
      debugLegacySession('Gemini legacy transport connected');

      const setupMessage = {
        setup: {
          model: `models/${GEMINI_LIVE_MODEL}`,

          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: 'Sulafat',
                },
              },
            },
          },

          outputAudioTranscription: {},

          systemInstruction: {
            parts: [
              {
                text:
                  'You are Athlora, the Athlora voice assistant. ' +
                  'Never invent Athlora platform data. ' +
                  'This legacy transport does not create athletes or perform mutations. ' +
                  'VOICE AND SPEAKING STYLE: Speak in a warm, calm, friendly and confident manner. ' +
                  'Use a natural conversational speaking pace that is slightly slower than normal. ' +
                  'Do not rush through sentences. Use short natural pauses between important ideas. ' +
                  'Keep explanations clear and easy to follow. Avoid sounding robotic, overly energetic, dramatic or like an announcer. ' +
                  'Your voice should feel like a knowledgeable coach speaking directly to an athlete. ' +
                   'Keep responses short and conversational. ' +
                   'When you are told to start the assistant, greet the user by saying exactly: ' +
                   '"Good Day Coach, who are we adding today?"',
              },
            ],
          },

          tools: [
            {
              functionDeclarations: [
                {
                  name: 'list_disciplines',

                  description:
                    'List real Athlora disciplines when a configured tool handler supports it.',

                  parameters: {
                    type: 'OBJECT',

                    properties: {
                      query: {
                        type: 'STRING',
                        description:
                          'Optional discipline code or label.',
                      },
                    },
                  },
                },
              ],
            },
          ],
        },
      };

      socket.send(
        JSON.stringify(setupMessage),
      );
    };

    socket.onmessage = (event) => {
      void (async () => {
        try {
          const text =
            await readWebSocketMessage(event.data);

          const message =
            JSON.parse(text) as GeminiServerMessage;

          if (
            Object.prototype.hasOwnProperty.call(
              message,
              'setupComplete',
            )
          ) {
            if (settled) return;

            settled = true;
            window.clearTimeout(timeout);

            resolve(socket);
          }
        } catch (error) {
          if (settled) return;

          settled = true;
          window.clearTimeout(timeout);

          socket.close();

          reject(
            new Error(
              error instanceof Error
                ? `Failed to read Gemini Live response: ${error.message}`
                : 'Failed to read Gemini Live response',
            ),
          );
        }
      })();
    };

    socket.onerror = () => {
      if (settled) return;

      settled = true;
      window.clearTimeout(timeout);

      reject(
        new Error(
          'Failed to connect to Gemini Live',
        ),
      );
    };

    socket.onclose = (event) => {
      if (settled) return;

      settled = true;
      window.clearTimeout(timeout);

      const reason =
        event.reason.length > 0
          ? `: ${event.reason}`
          : '';

      reject(
        new Error(
          `Gemini Live connection closed (${event.code})${reason}`,
        ),
      );
    };
  });
}

export function sendGeminiText(
  socket: WebSocket,
  text: string,
  handleToolCall?: GeminiToolHandler,
  handleAudio?: GeminiAudioHandler,
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (
      socket.readyState !==
      WebSocket.OPEN
    ) {
      reject(
        new Error(
          'Gemini Live connection is not open',
        ),
      );

      return;
    }

    let transcript = '';

    const timeout = window.setTimeout(() => {
      cleanup();

      reject(
        new Error(
          'Gemini response timed out',
        ),
      );
    }, 20_000);

    const cleanup = () => {
      window.clearTimeout(timeout);

      socket.removeEventListener(
        'message',
        handleMessage,
      );

      socket.removeEventListener(
        'close',
        handleClose,
      );
    };

    const handleMessage = (
      event: MessageEvent,
    ) => {
      void (async () => {
        try {
          const raw =
            await readWebSocketMessage(
              event.data,
            );

          const message =
            JSON.parse(raw) as GeminiServerMessage;

          /*
           * Gemini requested an Athlora tool.
           */
          if (
            message.toolCall
              ?.functionCalls
          ) {
            if (!handleToolCall) {
              throw new Error(
                'Gemini requested a tool but no tool handler is configured',
              );
            }

            const functionResponses = [];

            for (
              const call of
              message.toolCall
                .functionCalls
            ) {
              try {
                const result =
                  await handleToolCall(
                    call,
                  );

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

            socket.send(
              JSON.stringify({
                toolResponse: {
                  functionResponses,
                },
              }),
            );

            return;
          }

          const serverContent =
            message.serverContent;

          if (!serverContent) {
            return;
          }

          /*
           * Receive Gemini's generated
           * PCM audio.
           */
          const parts =
            serverContent.modelTurn
              ?.parts ?? [];

          for (const part of parts) {
            const inlineData =
              part.inlineData;

            if (
              inlineData?.data &&
              isGeminiPcm24k(inlineData.mimeType)
            ) {
              handleAudio?.(
                inlineData.data,
              );
            } else if (inlineData?.data) {
              debugLegacySession('Ignored non-PCM Gemini audio payload', {
                mimeType: inlineData.mimeType ?? 'missing',
              });
            }
          }

          /*
           * Keep a text transcription
           * of Gemini's spoken response.
           */
          const transcription =
            serverContent
              .outputTranscription
              ?.text;

          if (transcription) {
            transcript +=
              transcription;
          }

          /*
           * Gemini has finished this
           * conversational turn.
           */
          if (
            serverContent.turnComplete
          ) {
            cleanup();

            resolve(
              transcript.trim() ||
                'Gemini completed the request.',
            );
          }
        } catch (error) {
          cleanup();

          reject(
            error instanceof Error
              ? error
              : new Error(
                  'Failed to read Gemini response',
                ),
          );
        }
      })();
    };

    const handleClose = () => {
      cleanup();

      reject(
        new Error(
          'Gemini Live connection closed before responding',
        ),
      );
    };

    socket.addEventListener(
      'message',
      handleMessage,
    );

    socket.addEventListener(
      'close',
      handleClose,
    );

    socket.send(
      JSON.stringify({
        realtimeInput: {
          text,
        },
      }),
    );
  });
}
