import { beforeEach, describe, expect, it, vi } from 'vitest';

function createMockAudioContext(state: AudioContextState = 'running') {
  const sources: Array<{
    buffer: unknown;
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    onended: (() => void) | null;
  }> = [];

  const buffers: Array<{
    getChannelData: ReturnType<typeof vi.fn>;
    duration: number;
  }> = [];

  const ctx = {
    state,
    currentTime: 0,
    sampleRate: 48000,
    destination: { id: 'destination' },
    resume: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    createBuffer: vi.fn((channels: number, length: number, sampleRate: number) => {
      const data = new Float32Array(length);
      const buf = {
        numberOfChannels: channels,
        length,
        sampleRate,
        duration: length / sampleRate,
        getChannelData: vi.fn(() => data),
      };
      buffers.push(buf);
      return buf;
    }),
    createBufferSource: vi.fn(() => {
      const source = {
        buffer: null as unknown,
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        onended: null as (() => void) | null,
      };
      sources.push(source);
      return source;
    }),
    _sources: sources,
    _buffers: buffers,
  };
  return ctx;
}

let mockCtx: ReturnType<typeof createMockAudioContext>;

beforeEach(() => {
  vi.clearAllMocks();
  mockCtx = createMockAudioContext();
  vi.stubGlobal('AudioContext', vi.fn(() => mockCtx));
});

import { GeminiAudioPlayer } from './geminiAudio';

function createPlayer() {
  return new GeminiAudioPlayer();
}

function makeBase64(samples: Int16Array): string {
  const bytes = new Uint8Array(samples.buffer);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

describe('GeminiAudioPlayer', () => {
  describe('prepare', () => {
    it('creates an AudioContext and resumes if suspended', async () => {
      mockCtx.state = 'suspended';
      const player = createPlayer();
      await player.prepare();

      expect(mockCtx.resume).toHaveBeenCalledOnce();
    });

    it('plays a silent unlock buffer', async () => {
      const player = createPlayer();
      await player.prepare();

      expect(mockCtx.createBuffer).toHaveBeenCalledWith(1, 1, expect.any(Number));
      const source = mockCtx._sources[mockCtx._sources.length - 1];
      expect(source.start).toHaveBeenCalledOnce();
    });

    it('is idempotent when context is already running', async () => {
      const player = createPlayer();
      await player.prepare();
      await player.prepare();

      expect(AudioContext).toHaveBeenCalledOnce();
    });

    it('creates new context if previous was closed', async () => {
      const player = createPlayer();
      await player.prepare();

      expect(AudioContext).toHaveBeenCalledOnce();

      mockCtx.state = 'closed';
      const newCtx = createMockAudioContext('running');
      const Ctor = vi.fn(() => newCtx);
      vi.stubGlobal('AudioContext', Ctor);
      await player.prepare();

      expect(Ctor).toHaveBeenCalledOnce();
    });

    it('updates nextStartTime to currentTime', async () => {
      mockCtx.currentTime = 1.5;
      const player = createPlayer();
      await player.prepare();
    });
  });

  describe('playPcm16', () => {
    it('warns and returns if no context', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const player = createPlayer();
      player.playPcm16('base64data');
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('decodes base64 and creates an audio buffer', async () => {
      const player = createPlayer();
      await player.prepare();

      const pcm16 = new Int16Array([16384, -16384]);
      player.playPcm16(makeBase64(pcm16));

      expect(mockCtx.createBuffer).toHaveBeenCalledWith(1, 2, 24000);
    });

    it('schedules playback with gapless sequencing', async () => {
      mockCtx.currentTime = 0;
      const player = createPlayer();
      await player.prepare();

      const pcm16 = new Int16Array([16384]);
      const base64 = makeBase64(pcm16);

      player.playPcm16(base64);
      player.playPcm16(base64);

      const source1 = mockCtx._sources[1];
      const source2 = mockCtx._sources[2];
      expect(source1.start).toHaveBeenCalledOnce();
      expect(source2.start).toHaveBeenCalledOnce();
    });

    it('resumes context if suspended', async () => {
      mockCtx.state = 'suspended';
      const player = createPlayer();
      await player.prepare();
      mockCtx.state = 'running';

      const pcm16 = new Int16Array([16384]);
      player.playPcm16(makeBase64(pcm16));
      expect(mockCtx.resume).toHaveBeenCalled();
    });

    it('warns if context is closed after resume', async () => {
      mockCtx.state = 'suspended';
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const player = createPlayer();
      await player.prepare();
      mockCtx.state = 'closed';

      const pcm16 = new Int16Array([16384]);
      player.playPcm16(makeBase64(pcm16));
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Unable to play Gemini audio'), 'closed');
      warnSpy.mockRestore();
    });

    it('skips zero-length audio', async () => {
      const player = createPlayer();
      await player.prepare();

      player.playPcm16(btoa(''));
    });

    it('converts Int16 samples to float correctly', async () => {
      const player = createPlayer();
      await player.prepare();

      const pcm16 = new Int16Array([32767, -32768, 0]);
      player.playPcm16(makeBase64(pcm16));

      const buffer = mockCtx._buffers[1];
      const channel = buffer.getChannelData(0);
      expect(channel[0]).toBeCloseTo(32767 / 32768, 5);
      expect(channel[1]).toBeCloseTo(-1, 5);
      expect(channel[2]).toBe(0);
    });

    it('handles onended by removing source and resolving idle waiters', async () => {
      const player = createPlayer();
      await player.prepare();

      const pcm16 = new Int16Array([16384]);
      player.playPcm16(makeBase64(pcm16));

      const source = mockCtx._sources[1];
      expect(source.onended).toBeDefined();

      const idlePromise = player.waitUntilIdle();
      source.onended!();

      await idlePromise;
    });
  });

  describe('waitUntilIdle', () => {
    it('resolves immediately if no active sources', async () => {
      const player = createPlayer();
      await player.prepare();

      await player.waitUntilIdle();
    });
  });

  describe('clear', () => {
    it('stops and disconnects all active sources', async () => {
      const player = createPlayer();
      await player.prepare();

      const pcm16 = new Int16Array([16384]);
      const base64 = makeBase64(pcm16);

      player.playPcm16(base64);
      player.playPcm16(base64);

      const source1 = mockCtx._sources[1];
      const source2 = mockCtx._sources[2];
      player.clear();

      expect(source1.stop).toHaveBeenCalled();
      expect(source1.disconnect).toHaveBeenCalled();
      expect(source2.stop).toHaveBeenCalled();
      expect(source2.disconnect).toHaveBeenCalled();
    });

    it('resolves idle waiters on clear', async () => {
      const player = createPlayer();
      await player.prepare();

      const idlePromise = player.waitUntilIdle();
      player.clear();
      await idlePromise;
    });

    it('resets nextStartTime', async () => {
      mockCtx.currentTime = 5;
      const player = createPlayer();
      await player.prepare();
      player.clear();
    });
  });

  describe('close', () => {
    it('clears sources and closes AudioContext', async () => {
      const player = createPlayer();
      await player.prepare();
      player.close();

      expect(mockCtx.close).toHaveBeenCalled();
    });

    it('is safe to call when context is null', () => {
      const player = createPlayer();
      player.close();
    });

    it('resets nextStartTime to 0', async () => {
      const player = createPlayer();
      await player.prepare();
      player.close();
    });
  });
});
