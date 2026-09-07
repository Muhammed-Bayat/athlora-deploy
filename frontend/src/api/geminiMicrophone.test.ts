import { beforeEach, describe, expect, it, vi } from 'vitest';

function createMockTrack() {
  return { stop: vi.fn(), kind: 'audio' };
}

function createMockStream() {
  const track = createMockTrack();
  return {
    getTracks: vi.fn(() => [track]),
    getAudioTracks: vi.fn(() => [track]),
  } as unknown as MediaStream;
}

let mockSources: Array<{ connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }>;
let mockProcessors: Array<{
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  onaudioprocess: ((event: AudioProcessingEvent) => void) | null;
}>;
let mockGains: Array<{
  gain: { value: number };
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}>;

function createMockAudioContext(state: AudioContextState = 'running') {
  mockSources = [];
  mockProcessors = [];
  mockGains = [];

  return {
    state,
    currentTime: 0,
    sampleRate: 16000,
    destination: {},
    resume: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    createMediaStreamSource: vi.fn(() => {
      const source = { connect: vi.fn(), disconnect: vi.fn() };
      mockSources.push(source);
      return source;
    }),
    createScriptProcessor: vi.fn(() => {
      const processor: {
        connect: ReturnType<typeof vi.fn>;
        disconnect: ReturnType<typeof vi.fn>;
        onaudioprocess: ((event: AudioProcessingEvent) => void) | null;
      } = {
        connect: vi.fn(),
        disconnect: vi.fn(),
        onaudioprocess: null,
      };
      mockProcessors.push(processor);
      return processor;
    }),
    createGain: vi.fn(() => {
      const gain = {
        gain: { value: 1 },
        connect: vi.fn(),
        disconnect: vi.fn(),
      };
      mockGains.push(gain);
      return gain;
    }),
  };
}

let mockCtx: ReturnType<typeof createMockAudioContext>;
let mockStream: MediaStream;

beforeEach(() => {
  vi.clearAllMocks();
  mockCtx = createMockAudioContext();
  mockStream = createMockStream();

  vi.stubGlobal('AudioContext', vi.fn(() => mockCtx));
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: vi.fn().mockResolvedValue(mockStream) },
    writable: true,
    configurable: true,
  });
});

import { GeminiMicrophone } from './geminiMicrophone';

function createMic() {
  return new GeminiMicrophone();
}

function fireAudioEvent(inputData: Float32Array) {
  const processor = mockProcessors[mockProcessors.length - 1];
  const onaudioprocess = processor.onaudioprocess;
  expect(onaudioprocess).toBeDefined();

  const outputData = new Float32Array(inputData.length);

  const event = {
    inputBuffer: {
      getChannelData: vi.fn(() => inputData),
    },
    outputBuffer: {
      getChannelData: vi.fn(() => outputData),
    },
  } as unknown as AudioProcessingEvent;

  onaudioprocess!(event);
  return outputData;
}

describe('GeminiMicrophone', () => {
  describe('start', () => {
    it('requests microphone with correct constraints', async () => {
      const mic = createMic();
      await mic.start(vi.fn());

      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
    });

    it('creates AudioContext at 16kHz', async () => {
      const mic = createMic();
      await mic.start(vi.fn());

      expect(AudioContext).toHaveBeenCalledWith({ sampleRate: 16_000 });
    });

    it('resumes AudioContext if suspended', async () => {
      mockCtx.state = 'suspended';
      const mic = createMic();
      await mic.start(vi.fn());

      expect(mockCtx.resume).toHaveBeenCalledOnce();
    });

    it('connects source → processor → gain → destination', async () => {
      const mic = createMic();
      await mic.start(vi.fn());

      const source = mockSources[0];
      const processor = mockProcessors[0];
      const gain = mockGains[0];

      expect(source.connect).toHaveBeenCalledWith(processor);
      expect(processor.connect).toHaveBeenCalledWith(gain);
      expect(gain.connect).toHaveBeenCalledWith(mockCtx.destination);
    });

    it('sets gain to 0 for silent output', async () => {
      const mic = createMic();
      await mic.start(vi.fn());

      const gain = mockGains[0];
      expect(gain.gain.value).toBe(0);
    });

    it('does nothing if already started (idempotent)', async () => {
      const mic = createMic();
      await mic.start(vi.fn());
      await mic.start(vi.fn());

      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledOnce();
    });

    it('forwards audio chunks via callback', async () => {
      const onChunk = vi.fn();
      const mic = createMic();
      await mic.start(onChunk);

      const input = new Float32Array([0.5, -0.5, 1.0]);
      fireAudioEvent(input);

      expect(onChunk).toHaveBeenCalledOnce();
      expect(typeof onChunk.mock.calls[0][0]).toBe('string');
    });

    it('fills output buffer with zeros (silent)', async () => {
      const onChunk = vi.fn();
      const mic = createMic();
      await mic.start(onChunk);

      const input = new Float32Array([0.5, -0.5]);
      const output = fireAudioEvent(input);

      expect(output.every((v) => v === 0)).toBe(true);
    });
  });

  describe('pause/resume/isPaused', () => {
    it('starts unpaused', async () => {
      const mic = createMic();
      await mic.start(vi.fn());
      expect(mic.isPaused()).toBe(false);
    });

    it('pauses audio forwarding', async () => {
      const onChunk = vi.fn();
      const mic = createMic();
      await mic.start(onChunk);

      mic.pause();
      expect(mic.isPaused()).toBe(true);

      fireAudioEvent(new Float32Array([0.5]));
      expect(onChunk).not.toHaveBeenCalled();
    });

    it('resumes audio forwarding after pause', async () => {
      const onChunk = vi.fn();
      const mic = createMic();
      await mic.start(onChunk);

      mic.pause();
      fireAudioEvent(new Float32Array([0.5]));
      expect(onChunk).not.toHaveBeenCalled();

      mic.resume();
      expect(mic.isPaused()).toBe(false);
      fireAudioEvent(new Float32Array([0.5]));
      expect(onChunk).toHaveBeenCalledOnce();
    });
  });

  describe('isActive', () => {
    it('returns false before start', () => {
      expect(createMic().isActive()).toBe(false);
    });

    it('returns true after start', async () => {
      const mic = createMic();
      await mic.start(vi.fn());
      expect(mic.isActive()).toBe(true);
    });

    it('returns false after stop', async () => {
      const mic = createMic();
      await mic.start(vi.fn());
      await mic.stop();
      expect(mic.isActive()).toBe(false);
    });
  });

  describe('stop', () => {
    it('disconnects all audio nodes', async () => {
      const mic = createMic();
      await mic.start(vi.fn());
      await mic.stop();

      expect(mockProcessors[0].disconnect).toHaveBeenCalled();
      expect(mockGains[0].disconnect).toHaveBeenCalled();
      expect(mockSources[0].disconnect).toHaveBeenCalled();
    });

    it('stops all tracks', async () => {
      const mic = createMic();
      await mic.start(vi.fn());
      await mic.stop();

      const track = mockStream.getTracks()[0] as ReturnType<typeof createMockTrack>;
      expect(track.stop).toHaveBeenCalled();
    });

    it('closes AudioContext', async () => {
      const mic = createMic();
      await mic.start(vi.fn());
      await mic.stop();

      expect(mockCtx.close).toHaveBeenCalledOnce();
    });

    it('resets paused state', async () => {
      const mic = createMic();
      await mic.start(vi.fn());
      mic.pause();
      await mic.stop();

      expect(mic.isPaused()).toBe(false);
    });

    it('is safe to call when nothing is active', async () => {
      const mic = createMic();
      await mic.stop();
    });
  });

  describe('signal processing', () => {
    it('converts Float32 to PCM16 correctly', async () => {
      const onChunk = vi.fn();
      const mic = createMic();
      await mic.start(onChunk);

      fireAudioEvent(new Float32Array([0, 1, -1, 0.5, -0.5]));

      const base64 = onChunk.mock.calls[0][0];
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      const view = new DataView(bytes.buffer);
      expect(view.getInt16(0, true)).toBe(0);
      expect(view.getInt16(2, true)).toBe(32767);
      expect(view.getInt16(4, true)).toBe(-32768);
      expect(view.getInt16(6, true)).toBe(16383);
      expect(view.getInt16(8, true)).toBe(-16384);
    });

    it('clamps values outside [-1, 1]', async () => {
      const onChunk = vi.fn();
      const mic = createMic();
      await mic.start(onChunk);

      fireAudioEvent(new Float32Array([2.0, -2.0]));

      const base64 = onChunk.mock.calls[0][0];
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      const view = new DataView(bytes.buffer);
      expect(view.getInt16(0, true)).toBe(32767);
      expect(view.getInt16(2, true)).toBe(-32768);
    });

    it('handles undefined samples as 0', async () => {
      const onChunk = vi.fn();
      const mic = createMic();
      await mic.start(onChunk);

      fireAudioEvent(new Float32Array([undefined as unknown as number]));

      const base64 = onChunk.mock.calls[0][0];
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      const view = new DataView(bytes.buffer);
      expect(view.getInt16(0, true)).toBe(0);
    });
  });
});
