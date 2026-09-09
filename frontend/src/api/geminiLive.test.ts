import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectGeminiLive, sendGeminiText } from './geminiLive';

class MockWebSocket {
  readyState = 1;
  send = vi.fn();
  close = vi.fn();
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string | ArrayBuffer }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;

  private listeners: Record<string, Array<(...args: unknown[]) => void>> = {};

  addEventListener = vi.fn((event: string, handler: (...args: unknown[]) => void) => {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(handler);
  });

  removeEventListener = vi.fn((event: string, handler: (...args: unknown[]) => void) => {
    this.listeners[event] = (this.listeners[event] ?? []).filter((h) => h !== handler);
  });

  triggerOpen() { this.onopen?.(); }
  triggerMessage(data: string | ArrayBuffer) {
    this.onmessage?.({ data });
    for (const handler of this.listeners['message'] ?? []) handler({ data });
  }
  triggerError() { this.onerror?.(); }
  triggerClose(code = 1000, reason = '') {
    const event = { code, reason };
    this.onclose?.(event);
    for (const handler of this.listeners['close'] ?? []) handler(event);
  }

  reset() {
    this.readyState = 1;
    this.send.mockReset();
    this.close.mockReset();
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    this.onclose = null;
    this.listeners = {};
    this.addEventListener.mockClear();
    this.removeEventListener.mockClear();
  }
}

let mockSocket: MockWebSocket;

beforeEach(() => {
  vi.useFakeTimers();
  mockSocket = new MockWebSocket();
  vi.stubGlobal('WebSocket', Object.assign(
    vi.fn(() => mockSocket),
    { OPEN: 1, CLOSED: 3, CONNECTING: 0, CLOSING: 2 },
  ));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('connectGeminiLive', () => {
  it('resolves with the socket after setupComplete', async () => {
    const promise = connectGeminiLive('test-token');
    mockSocket.triggerOpen();
    mockSocket.triggerMessage(JSON.stringify({ setupComplete: {} }));

    const socket = await promise;
    expect(socket).toBe(mockSocket);
  });

  it('sends the correct setup message on open', async () => {
    const promise = connectGeminiLive('my-token');
    mockSocket.triggerOpen();

    expect(mockSocket.send).toHaveBeenCalledOnce();
    const sent = JSON.parse(mockSocket.send.mock.calls[0][0] as string);
    expect(sent.setup.model).toBe('models/gemini-3.1-flash-live-preview');
    expect(sent.setup.generationConfig.responseModalities).toEqual(['AUDIO']);
    expect(sent.setup.systemInstruction.parts[0].text).toContain('Athlora');
    expect(sent.setup.tools[0].functionDeclarations[0].name).toBe('create_athlete');

    mockSocket.triggerMessage(JSON.stringify({ setupComplete: {} }));
    await promise;
  });

  it('rejects on connection timeout', async () => {
    const promise = connectGeminiLive('token');
    mockSocket.triggerOpen();

    const rejection = expect(promise).rejects.toThrow('Gemini Live connection timed out');
    await vi.advanceTimersByTimeAsync(10_000);
    await rejection;
    expect(mockSocket.close).toHaveBeenCalled();
  });

  it('rejects on error', async () => {
    const promise = connectGeminiLive('token');
    mockSocket.triggerError();

    await expect(promise).rejects.toThrow('Failed to connect to Gemini Live');
  });

  it('rejects on close with reason', async () => {
    const promise = connectGeminiLive('token');
    mockSocket.triggerClose(4003, 'rate limited');

    await expect(promise).rejects.toThrow('Gemini Live connection closed (4003): rate limited');
  });

  it('rejects on close without reason', async () => {
    const promise = connectGeminiLive('token');
    mockSocket.triggerClose(1006);

    await expect(promise).rejects.toThrow('Gemini Live connection closed (1006)');
  });

  it('does not double-settle after setupComplete', async () => {
    const promise = connectGeminiLive('token');
    mockSocket.triggerOpen();
    mockSocket.triggerMessage(JSON.stringify({ setupComplete: {} }));

    const socket = await promise;
    expect(socket).toBe(mockSocket);

    mockSocket.triggerError();
    mockSocket.triggerClose(1000);
  });

  it('rejects if message parsing throws', async () => {
    const promise = connectGeminiLive('token');
    mockSocket.triggerOpen();
    mockSocket.triggerMessage('not-json');

    await expect(promise).rejects.toThrow('Failed to read Gemini Live response');
  });

  it('handles ArrayBuffer data in readWebSocketMessage', async () => {
    const promise = connectGeminiLive('token');
    mockSocket.triggerOpen();

    const text = JSON.stringify({ setupComplete: {} });
    const encoder = new TextEncoder();
    const buffer = encoder.encode(text).buffer as ArrayBuffer;
    mockSocket.triggerMessage(buffer);

    const socket = await promise;
    expect(socket).toBe(mockSocket);
  });
});

describe('sendGeminiText', () => {
  it('rejects if socket is not open', async () => {
    const closedSocket = new MockWebSocket();
    closedSocket.readyState = 3;

    await expect(sendGeminiText(closedSocket as unknown as WebSocket, 'hello'))
      .rejects.toThrow('Gemini Live connection is not open');
  });

  it('sends realtimeInput and resolves on turnComplete', async () => {
    const promise = sendGeminiText(mockSocket as unknown as WebSocket, 'add Runner Bob');

    expect(mockSocket.send).toHaveBeenCalledWith(
      JSON.stringify({ realtimeInput: { text: 'add Runner Bob' } }),
    );

    mockSocket.triggerMessage(JSON.stringify({
      serverContent: {
        modelTurn: { parts: [{ inlineData: { data: 'audio123', mimeType: 'audio/pcm' } }] },
        outputTranscription: { text: 'Hello' },
        turnComplete: true,
      },
    }));

    const transcript = await promise;
    expect(transcript).toBe('Hello');
  });

  it('accumulates transcription across multiple messages', async () => {
    const promise = sendGeminiText(mockSocket as unknown as WebSocket, 'hi');

    mockSocket.triggerMessage(JSON.stringify({
      serverContent: { outputTranscription: { text: 'Hello ' } },
    }));
    mockSocket.triggerMessage(JSON.stringify({
      serverContent: { outputTranscription: { text: 'Coach' }, turnComplete: true },
    }));

    const transcript = await promise;
    expect(transcript).toBe('Hello Coach');
  });

  it('falls back to default text when transcript is empty', async () => {
    const promise = sendGeminiText(mockSocket as unknown as WebSocket, 'hi');
    mockSocket.triggerMessage(JSON.stringify({
      serverContent: { turnComplete: true },
    }));

    const transcript = await promise;
    expect(transcript).toBe('Gemini completed the request.');
  });

  it('dispatches audio chunks to handleAudio callback', async () => {
    const handleAudio = vi.fn();
    const promise = sendGeminiText(mockSocket as unknown as WebSocket, 'hi', undefined, handleAudio);

    mockSocket.triggerMessage(JSON.stringify({
      serverContent: {
        modelTurn: { parts: [{ inlineData: { data: 'chunk1', mimeType: 'audio/pcm' } }] },
        turnComplete: true,
      },
    }));

    await promise;
    expect(handleAudio).toHaveBeenCalledWith('chunk1');
  });

  it('skips audio parts without audio mimeType', async () => {
    const handleAudio = vi.fn();
    const promise = sendGeminiText(mockSocket as unknown as WebSocket, 'hi', undefined, handleAudio);

    mockSocket.triggerMessage(JSON.stringify({
      serverContent: {
        modelTurn: { parts: [{ inlineData: { data: 'text', mimeType: 'text/plain' } }] },
        turnComplete: true,
      },
    }));

    await promise;
    expect(handleAudio).not.toHaveBeenCalled();
  });

  it('executes tool calls and sends responses', async () => {
    const handleToolCall = vi.fn().mockResolvedValue({ id: 'athlete-1' });
    const promise = sendGeminiText(mockSocket as unknown as WebSocket, 'add Bob', handleToolCall);

    mockSocket.triggerMessage(JSON.stringify({
      toolCall: { functionCalls: [{ id: 'call-1', name: 'create_athlete', args: { name: 'Bob' } }] },
    }));

    mockSocket.triggerMessage(JSON.stringify({
      serverContent: { outputTranscription: { text: 'Added Bob' }, turnComplete: true },
    }));

    const transcript = await promise;
    expect(handleToolCall).toHaveBeenCalledWith({ id: 'call-1', name: 'create_athlete', args: { name: 'Bob' } });
    expect(mockSocket.send).toHaveBeenLastCalledWith(JSON.stringify({
      toolResponse: { functionResponses: [{ id: 'call-1', name: 'create_athlete', response: { result: { id: 'athlete-1' } } }] },
    }));
    expect(transcript).toBe('Added Bob');
  });

  it('handles tool call errors gracefully', async () => {
    const handleToolCall = vi.fn().mockRejectedValue(new Error('DB failure'));
    const promise = sendGeminiText(mockSocket as unknown as WebSocket, 'add Bob', handleToolCall);

    mockSocket.triggerMessage(JSON.stringify({
      toolCall: { functionCalls: [{ id: 'call-1', name: 'create_athlete' }] },
    }));

    mockSocket.triggerMessage(JSON.stringify({
      serverContent: { outputTranscription: { text: 'Error occurred' }, turnComplete: true },
    }));

    await promise;
    expect(mockSocket.send).toHaveBeenLastCalledWith(JSON.stringify({
      toolResponse: {
        functionResponses: [{ id: 'call-1', name: 'create_athlete', response: { error: 'DB failure' } }],
      },
    }));
  });

  it('rejects if tool call arrives but no handler configured', async () => {
    const promise = sendGeminiText(mockSocket as unknown as WebSocket, 'hi');

    mockSocket.triggerMessage(JSON.stringify({
      toolCall: { functionCalls: [{ id: 'call-1', name: 'create_athlete' }] },
    }));

    await expect(promise).rejects.toThrow('Gemini requested a tool but no tool handler is configured');
  });

  it('rejects on socket close before response', async () => {
    const promise = sendGeminiText(mockSocket as unknown as WebSocket, 'hi');
    mockSocket.triggerClose(1006);

    await expect(promise).rejects.toThrow('Gemini Live connection closed before responding');
  });

  it('rejects after 20s timeout', async () => {
    const promise = sendGeminiText(mockSocket as unknown as WebSocket, 'hi');

    const rejection = expect(promise).rejects.toThrow('Gemini response timed out');
    await vi.advanceTimersByTimeAsync(20_000);
    await rejection;
  });

  it('ignores non-serverContent messages then resolves', async () => {
    const promise = sendGeminiText(mockSocket as unknown as WebSocket, 'hi');

    mockSocket.triggerMessage(JSON.stringify({ someOtherKey: true }));
    mockSocket.triggerMessage(JSON.stringify({
      serverContent: { turnComplete: true },
    }));

    const transcript = await promise;
    expect(transcript).toBe('Gemini completed the request.');
  });

  it('rejects on message parse error during response', async () => {
    const promise = sendGeminiText(mockSocket as unknown as WebSocket, 'hi');
    mockSocket.triggerMessage('invalid-json');

    await expect(promise).rejects.toThrow();
  });

  it('handles tool call with non-Error rejection', async () => {
    const handleToolCall = vi.fn().mockRejectedValue('string error');
    const promise = sendGeminiText(mockSocket as unknown as WebSocket, 'hi', handleToolCall);

    mockSocket.triggerMessage(JSON.stringify({
      toolCall: { functionCalls: [{ id: 'c1', name: 'create_athlete' }] },
    }));

    mockSocket.triggerMessage(JSON.stringify({
      serverContent: { outputTranscription: { text: 'Failed' }, turnComplete: true },
    }));

    await promise;
    expect(mockSocket.send).toHaveBeenLastCalledWith(JSON.stringify({
      toolResponse: {
        functionResponses: [{ id: 'c1', name: 'create_athlete', response: { error: 'Tool execution failed' } }],
      },
    }));
  });

  it('handles serverContent without modelTurn parts', async () => {
    const promise = sendGeminiText(mockSocket as unknown as WebSocket, 'hi');

    mockSocket.triggerMessage(JSON.stringify({
      serverContent: { outputTranscription: { text: 'Sure' }, turnComplete: true },
    }));

    const transcript = await promise;
    expect(transcript).toBe('Sure');
  });

  it('skips inlineData without data field', async () => {
    const handleAudio = vi.fn();
    const promise = sendGeminiText(mockSocket as unknown as WebSocket, 'hi', undefined, handleAudio);

    mockSocket.triggerMessage(JSON.stringify({
      serverContent: {
        modelTurn: { parts: [{ inlineData: { mimeType: 'audio/pcm' } }] },
        turnComplete: true,
      },
    }));

    await promise;
    expect(handleAudio).not.toHaveBeenCalled();
  });

  it('handles inlineData without mimeType as audio', async () => {
    const handleAudio = vi.fn();
    const promise = sendGeminiText(mockSocket as unknown as WebSocket, 'hi', undefined, handleAudio);

    mockSocket.triggerMessage(JSON.stringify({
      serverContent: {
        modelTurn: { parts: [{ inlineData: { data: 'chunk' } }] },
        turnComplete: true,
      },
    }));

    await promise;
    expect(handleAudio).toHaveBeenCalledWith('chunk');
  });
});
