import 'dotenv/config';
import {
  Behavior,
  GoogleGenAI,
  Modality,
  ThinkingLevel,
  Type,
} from '@google/genai';

const DEFAULT_MODEL = 'gemini-3.8-live';
const TIMEOUT_MS = 60_000;

function argumentValue(name) {
  const index = process.argv.indexOf(name);

  return index === -1 ? undefined : process.argv[index + 1];
}

const model = argumentValue('--model') ?? DEFAULT_MODEL;
const thinking = argumentValue('--thinking');
const behavior = argumentValue('--behavior') ?? 'non-blocking';

if (thinking !== undefined && thinking !== 'medium') {
  throw new Error('--thinking must be omitted or set to medium');
}

if (behavior !== 'non-blocking' && behavior !== 'blocking') {
  throw new Error('--behavior must be non-blocking or blocking');
}

if (!process.env.GEMINI_API_KEY) {
  throw new Error('GEMINI_API_KEY is not configured');
}

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: { apiVersion: 'v1alpha' },
});

function isGeminiPcm24k(mimeType) {
  if (!mimeType) return false;

  const [mediaType, ...parameters] = mimeType
    .toLowerCase()
    .split(';')
    .map((value) => value.trim());
  const rate = parameters
    .map((parameter) => parameter.split('='))
    .find(([name]) => name === 'rate')?.[1];

  return mediaType === 'audio/pcm' && (rate === undefined || rate === '24000');
}

let session;
let settled = false;
let phase = 'greeting';
let finish;
let resultError;
let inputAudioSubmitted = false;
let outputAudioReceived = false;
let toolCallReceived = false;
let toolResponseSent = false;
const connectionFailed = Symbol('connectionFailed');

const result = new Promise((resolve) => {
  const timeout = setTimeout(() => {
    finish(new Error('Timed out waiting for the Gemini Live verification'));
  }, TIMEOUT_MS);

  finish = (error) => {
    if (settled) return;

    settled = true;
    clearTimeout(timeout);
    session?.close();

    resultError = error;
    resolve();
  };
});

try {
  const connectedSession = await Promise.race([
    ai.live.connect({
      model,
      config: {
        responseModalities: [Modality.AUDIO],
        outputAudioTranscription: {},
        inputAudioTranscription: {},
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: 'Sulafat',
            },
          },
        },
        ...(thinking === 'medium'
          ? {
              thinkingConfig: {
                thinkingLevel: ThinkingLevel.MEDIUM,
              },
            }
          : {}),
        tools: [
          {
            functionDeclarations: [
              {
                name: 'verification_ping',
                behavior:
                  behavior === 'blocking'
                    ? Behavior.BLOCKING
                    : Behavior.NON_BLOCKING,
                description: 'Call this function exactly once before answering.',
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
        onmessage: (message) => {
          const content = message.serverContent;

          outputAudioReceived ||= (content?.modelTurn?.parts ?? []).some(
            (part) =>
              Boolean(part.inlineData?.data) &&
              isGeminiPcm24k(part.inlineData?.mimeType),
          );

          const calls = message.toolCall?.functionCalls ?? [];
          if (calls.length > 0) {
            toolCallReceived = true;
            session.sendToolResponse({
              functionResponses: calls.map((call) => ({
                id: call.id,
                name: call.name,
                response: { ok: true },
              })),
            });
            toolResponseSent = true;
          }

          if (!content?.turnComplete) return;

          if (phase === 'greeting') {
            phase = 'tool';
            session.sendClientContent({
              turns: [
                {
                  role: 'user',
                  parts: [
                    {
                      text: 'Use verification_ping exactly once, then confirm it succeeded.',
                    },
                  ],
                },
              ],
              turnComplete: true,
            });
          } else if (toolResponseSent) {
            finish();
          }
        },
        onerror: (event) => {
          finish(new Error(event.message || 'Gemini Live connection error'));
        },
        onclose: (event) => {
          if (!settled) {
            finish(
              new Error(`Gemini Live closed: ${event.code} ${event.reason}`),
            );
          }
        },
      },
    }),
    result.then(() => connectionFailed),
  ]);

  if (connectedSession === connectionFailed) {
    throw resultError ?? new Error('Gemini Live closed before setup completed');
  }

  session = connectedSession;

  // Submit one silence frame through the same PCM transport as the microphone.
  session.sendRealtimeInput({
    audio: {
      data: Buffer.alloc(640).toString('base64'),
      mimeType: 'audio/pcm;rate=16000',
    },
  });
  inputAudioSubmitted = true;
  session.sendRealtimeInput({ audioStreamEnd: true });
  session.sendClientContent({
    turns: [
      {
        role: 'user',
        parts: [{ text: 'Start the assistant.' }],
      },
    ],
    turnComplete: true,
  });

  await result;

  if (resultError) {
    throw resultError;
  }

  if (
    !inputAudioSubmitted ||
    !outputAudioReceived ||
    !toolCallReceived ||
    !toolResponseSent
  ) {
    throw new Error(
      `The Gemini Live verification did not complete every check: ${JSON.stringify({
        inputAudioSubmitted,
        outputAudioReceived,
        toolCallReceived,
        toolResponseSent,
      })}`,
    );
  }

  console.log(
    JSON.stringify({
      model,
      thinkingConfigured: thinking === 'medium',
      behavior,
      inputAudioSubmitted,
      outputAudioReceived,
      toolCallReceived,
      toolResponseSent,
    }),
  );
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error(`Gemini Live probe failed: ${message}`);
  process.exitCode = 1;
}
