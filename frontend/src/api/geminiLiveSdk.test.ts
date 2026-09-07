import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSession = {
  sendClientContent: vi.fn(),
  sendRealtimeInput: vi.fn(),
  sendToolResponse: vi.fn(),
  close: vi.fn(),
};

let capturedCallbacks: Record<string, unknown> = {};

function fireCallback(name: string, msg: Record<string, unknown>) {
  (capturedCallbacks[name] as (msg: Record<string, unknown>) => void)(msg);
}

const liveConnect = vi.fn().mockImplementation(async (config: Record<string, unknown>) => {
  capturedCallbacks = (config.callbacks as Record<string, unknown>) ?? {};
  return mockSession;
});

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn(() => ({ live: { connect: liveConnect } })),
  Modality: { AUDIO: 'AUDIO' },
  Type: { OBJECT: 'OBJECT', STRING: 'STRING' },
}));

import { AthloraGeminiSession } from './geminiLiveSdk';

function createSession(overrides = {}) {
  return new AthloraGeminiSession({
    token: 'test-token',
    ...overrides,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  capturedCallbacks = {};
  mockSession.close.mockReset();
  mockSession.sendClientContent.mockReset();
  mockSession.sendRealtimeInput.mockReset();
  mockSession.sendToolResponse.mockReset();
  liveConnect.mockReset();
  liveConnect.mockImplementation(async (config: Record<string, unknown>) => {
    capturedCallbacks = (config.callbacks as Record<string, unknown>) ?? {};
    return mockSession;
  });
});

describe('AthloraGeminiSession', () => {
  describe('connect', () => {
    it('connects to the Gemini live API and fires onConnected', async () => {
      liveConnect.mockImplementation(async (config: Record<string, unknown>) => {
        capturedCallbacks = (config.callbacks as Record<string, unknown>) ?? {};
        (capturedCallbacks.onopen as () => void)?.();
        return mockSession;
      });

      const onConnected = vi.fn();
      const session = createSession({ onConnected });

      await session.connect();

      expect(liveConnect).toHaveBeenCalledOnce();
      expect(onConnected).toHaveBeenCalledOnce();
    });

    it('sends correct model, tools, and system prompt', async () => {
      await createSession().connect();

      const config = liveConnect.mock.calls[0][0];
      expect(config.model).toBe('gemini-3.1-flash-live-preview');
      expect(config.config.responseModalities).toEqual(['AUDIO']);
      expect(config.config.systemInstruction.parts[0].text).toContain('Athlora');
      expect(config.config.tools[0].functionDeclarations.map((t: { name: string }) => t.name)).toEqual([
        'create_athlete',
        'sleep_assistant',
      ]);
    });

    it('does nothing if already connected (idempotent)', async () => {
      const session = createSession();
      await session.connect();
      await session.connect();

      expect(liveConnect).toHaveBeenCalledOnce();
    });

    it('fires onDisconnected on session close', async () => {
      const onDisconnected = vi.fn();
      const session = createSession({ onDisconnected });
      await session.connect();

      (capturedCallbacks.onclose as () => void)();

      expect(onDisconnected).toHaveBeenCalledOnce();
    });

    it('fires onError on session error', async () => {
      const onError = vi.fn();
      const session = createSession({ onError });
      await session.connect();

      (capturedCallbacks.onerror as (e: unknown) => void)({ message: 'connection lost' });

      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'connection lost' }));
    });

    it('uses fallback error message when event has no message', async () => {
      const onError = vi.fn();
      const session = createSession({ onError });
      await session.connect();

      (capturedCallbacks.onerror as (e: unknown) => void)({ message: '' });

      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Gemini Live connection error' }));
    });

    it('rejects pending turn on error', async () => {
      const session = createSession();
      await session.connect();

      const sendPromise = session.sendText('hello');

      (capturedCallbacks.onerror as (e: unknown) => void)({ message: 'fail' });

      await expect(sendPromise).rejects.toThrow('fail');
    });
  });

  describe('sendText', () => {
    it('throws if session not connected', async () => {
      await expect(createSession().sendText('hi')).rejects.toThrow('Gemini Live session is not connected');
    });

    it('throws if already responding', async () => {
      const session = createSession();
      await session.connect();

      const first = session.sendText('first');
      await expect(session.sendText('second')).rejects.toThrow('Gemini is already responding');

      // Resolve the first turn so tests clean up
      fireCallback('onmessage',{ serverContent: { turnComplete: true } });
      await first;
    });

    it('sends client content and resolves on turnComplete', async () => {
      const session = createSession();
      await session.connect();

      const responsePromise = session.sendText('add Bob');

      expect(mockSession.sendClientContent).toHaveBeenCalledWith({
        turns: [{ role: 'user', parts: [{ text: 'add Bob' }] }],
        turnComplete: true,
      });

      fireCallback('onmessage',{ serverContent: { outputTranscription: { text: 'Sure' }, turnComplete: true } });

      expect(await responsePromise).toBe('Sure');
    });

    it('falls back to default text on empty transcript', async () => {
      const session = createSession();
      await session.connect();

      const promise = session.sendText('hi');
      fireCallback('onmessage',{ serverContent: { turnComplete: true } });

      expect(await promise).toBe('Gemini completed the request.');
    });
  });

  describe('sendAudio', () => {
    it('throws if session not connected', () => {
      expect(() => createSession().sendAudio('base64data')).toThrow('Gemini Live session is not connected');
    });

    it('sends realtime audio input', async () => {
      const session = createSession();
      await session.connect();

      session.sendAudio('pcm-data');

      expect(mockSession.sendRealtimeInput).toHaveBeenCalledWith({
        audio: { data: 'pcm-data', mimeType: 'audio/pcm;rate=16000' },
      });
    });
  });

  describe('endAudioStream', () => {
    it('does nothing if session is null', () => {
      createSession().endAudioStream(); // no throw
    });

    it('sends audioStreamEnd signal', async () => {
      const session = createSession();
      await session.connect();
      session.endAudioStream();

      expect(mockSession.sendRealtimeInput).toHaveBeenCalledWith({ audioStreamEnd: true });
    });
  });

  describe('close', () => {
    it('closes session and clears state', async () => {
      const onDisconnected = vi.fn();
      const session = createSession({ onDisconnected });
      await session.connect();

      session.close();

      expect(mockSession.close).toHaveBeenCalled();
      expect(onDisconnected).not.toHaveBeenCalled(); // close() doesn't fire onDisconnected
    });

    it('clears pending turn without resolving', async () => {
      const session = createSession();
      await session.connect();
      session.close();

      // Should not throw or leak
    });
  });

  describe('handleMessage', () => {
    it('dispatches tool calls to onToolCall and sends responses', async () => {
      const onToolCall = vi.fn().mockResolvedValue({ id: 'athlete-1' });
      const session = createSession({ onToolCall });
      await session.connect();

      fireCallback('onmessage',{
        toolCall: { functionCalls: [{ id: 'c1', name: 'create_athlete', args: { name: 'Bob' } }] },
      });

      await vi.waitFor(() => expect(onToolCall).toHaveBeenCalledWith({
        id: 'c1', name: 'create_athlete', args: { name: 'Bob' },
      }));
      expect(mockSession.sendToolResponse).toHaveBeenCalledWith({
        functionResponses: [{ id: 'c1', name: 'create_athlete', response: { result: { id: 'athlete-1' } } }],
      });
    });

    it('handles sleep_assistant tool call natively', async () => {
      const onSleepRequested = vi.fn();
      const session = createSession({ onSleepRequested });
      await session.connect();

      fireCallback('onmessage',{
        toolCall: { functionCalls: [{ id: 'c1', name: 'sleep_assistant' }] },
      });

      await vi.waitFor(() => expect(mockSession.sendToolResponse).toHaveBeenCalledWith({
        functionResponses: [{ id: 'c1', name: 'sleep_assistant', response: { success: true } }],
      }));
      expect(onSleepRequested).toHaveBeenCalledOnce();
    });

    it('sends error response when tool call throws', async () => {
      const onToolCall = vi.fn().mockRejectedValue(new Error('DB error'));
      const session = createSession({ onToolCall });
      await session.connect();

      fireCallback('onmessage',{
        toolCall: { functionCalls: [{ id: 'c1', name: 'create_athlete' }] },
      });

      await vi.waitFor(() => expect(mockSession.sendToolResponse).toHaveBeenCalledWith({
        functionResponses: [{ id: 'c1', name: 'create_athlete', response: { error: 'DB error' } }],
      }));
    });

    it('throws when tool call arrives but no onToolCall configured', async () => {
      const session = createSession();
      await session.connect();

      fireCallback('onmessage',{
        toolCall: { functionCalls: [{ id: 'c1', name: 'create_athlete' }] },
      });

      await vi.waitFor(() => expect(mockSession.sendToolResponse).toHaveBeenCalledWith({
        functionResponses: [{ id: 'c1', name: 'create_athlete', response: { error: 'No Gemini tool handler configured' } }],
      }));
    });

    it('accumulates audio and transcription during a turn', async () => {
      const onAudio = vi.fn();
      const onTranscript = vi.fn();
      const onTurnStart = vi.fn();
      const session = createSession({ onAudio, onTranscript, onTurnStart });
      await session.connect();

      fireCallback('onmessage',{
        serverContent: {
          modelTurn: { parts: [{ inlineData: { data: 'audio1', mimeType: 'audio/pcm' } }] },
          outputTranscription: { text: 'Hello' },
        },
      });

      expect(onTurnStart).toHaveBeenCalledOnce();
      expect(onAudio).toHaveBeenCalledWith('audio1');
      expect(onTranscript).toHaveBeenCalledWith('Hello');
    });

    it('skips audio parts without audio mimeType', async () => {
      const onAudio = vi.fn();
      const session = createSession({ onAudio });
      await session.connect();

      fireCallback('onmessage',{
        serverContent: {
          modelTurn: { parts: [{ inlineData: { data: 'text', mimeType: 'text/plain' } }] },
        },
      });

      expect(onAudio).not.toHaveBeenCalled();
    });

    it('resolves pending turn on turnComplete', async () => {
      const onTurnComplete = vi.fn();
      const session = createSession({ onTurnComplete });
      await session.connect();

      const promise = session.sendText('hi');
      fireCallback('onmessage',{
        serverContent: { outputTranscription: { text: 'Sure' }, turnComplete: true },
      });

      expect(await promise).toBe('Sure');
      expect(onTurnComplete).toHaveBeenCalledOnce();
    });

    it('handles interrupted response', async () => {
      const onInterrupted = vi.fn();
      const session = createSession({ onInterrupted });
      await session.connect();

      const promise = session.sendText('hi');

      // Start a turn, then interrupt
      fireCallback('onmessage',{
        serverContent: { outputTranscription: { text: 'Partial' } },
      });
      fireCallback('onmessage',{
        serverContent: { interrupted: true },
      });

      expect(await promise).toBe('Partial');
      expect(onInterrupted).toHaveBeenCalledOnce();
    });

    it('falls back to default text on interrupt with empty transcript', async () => {
      const session = createSession();
      await session.connect();

      const promise = session.sendText('hi');
      fireCallback('onmessage',{ serverContent: { interrupted: true } });

      expect(await promise).toBe('Gemini response interrupted.');
    });

    it('does not fire onTurnStart twice in same turn', async () => {
      const onTurnStart = vi.fn();
      const session = createSession({ onTurnStart });
      await session.connect();

      fireCallback('onmessage',{ serverContent: { outputTranscription: { text: 'a' } } });
      fireCallback('onmessage',{ serverContent: { outputTranscription: { text: 'b' } } });

      expect(onTurnStart).toHaveBeenCalledOnce();
    });

    it('ignores messages without serverContent or toolCall', async () => {
      const session = createSession();
      await session.connect();

      fireCallback('onmessage',{});
      fireCallback('onmessage',{ somethingElse: true });
      // No throw
    });

    it('resets receivingTurn after turnComplete', async () => {
      const onTurnStart = vi.fn();
      const session = createSession({ onTurnStart });
      await session.connect();

      // First turn
      fireCallback('onmessage',{ serverContent: { outputTranscription: { text: 'a' }, turnComplete: true } });
      // Second turn should fire onTurnStart again
      fireCallback('onmessage',{ serverContent: { outputTranscription: { text: 'b' } } });

      expect(onTurnStart).toHaveBeenCalledTimes(2);
    });
  });
});
