const GEMINI_OUTPUT_SAMPLE_RATE = 24_000;
const CHUNK_FADE_SECONDS = 0.002;
const DEV = import.meta.env.DEV;

function debugAudio(event: string, details?: Record<string, unknown>): void {
  if (DEV) {
    console.info('[Athlora AI]', event, details ?? '');
  }
}

export class GeminiAudioPlayer {
  private context: AudioContext | null = null;
  private nextStartTime = 0;
  private activeSources = new Set<AudioBufferSourceNode>();
  private sourceGains = new Map<AudioBufferSourceNode, GainNode>();
  private pendingChunks: Float32Array[] = [];
  private draining = false;
  private playbackGeneration = 0;
  private playbackStarted = false;
  private idleResolvers: Array<() => void> = [];

  async prepare(): Promise<void> {
    if (
      !this.context ||
      this.context.state === 'closed'
    ) {
      this.context = new AudioContext();
      this.nextStartTime = 0;
      debugAudio('AudioContext created', {
        outputSampleRate: this.context.sampleRate,
      });
    }

    if (this.context.state === 'suspended') {
      await this.context.resume();
      debugAudio('AudioContext resumed');
    }

    if (this.context.state !== 'running') {
      throw new Error(
        `AudioContext is not ready for playback (${this.context.state})`,
      );
    }

    this.nextStartTime = Math.max(
      this.nextStartTime,
      this.context.currentTime,
    );

    void this.drainQueue();
  }

  playPcm16(base64Audio: string): void {
    const samples = this.decodePcm16(base64Audio);

    if (!samples) {
      return;
    }

    this.pendingChunks.push(samples);

    if (!this.context) {
      debugAudio('Audio queued before player preparation');
    }

    void this.drainQueue();
  }

  async waitUntilIdle(): Promise<void> {
    if (this.isIdle()) {
      return;
    }

    await new Promise<void>((resolve) => {
      this.idleResolvers.push(resolve);
    });
  }

  clear(): void {
    const context = this.context;
    this.playbackGeneration += 1;
    this.pendingChunks = [];
    this.playbackStarted = false;

    for (const source of this.activeSources) {
      try {
        source.stop();
      } catch {
        // Source may already have ended.
      }

      try {
        source.disconnect();
      } catch {
        // Ignore an already-disconnected source.
      }

      try {
        this.sourceGains.get(source)?.disconnect();
      } catch {
        // Ignore an already-disconnected gain node.
      }
    }

    this.activeSources.clear();
    this.sourceGains.clear();

    this.nextStartTime =
      context?.currentTime ?? 0;

    debugAudio('Playback queue cleared');
    this.resolveIdleWaiters();
  }

  private async drainQueue(): Promise<void> {
    if (this.draining) {
      return;
    }

    this.draining = true;
    const generation = this.playbackGeneration;

    try {
      while (
        generation === this.playbackGeneration &&
        this.pendingChunks.length > 0
      ) {
        const context = this.context;

        if (!context || context.state === 'closed') {
          return;
        }

        if (context.state === 'suspended') {
          await context.resume();
          debugAudio('AudioContext resumed for queued playback');
        }

        if (
          generation !== this.playbackGeneration ||
          context !== this.context
        ) {
          return;
        }

        if (context.state !== 'running') {
          debugAudio('Audio queue waiting for a running AudioContext', {
            state: context.state,
          });
          return;
        }

        const samples = this.pendingChunks.shift();

        if (samples) {
          this.scheduleChunk(context, samples, generation);
        }
      }
    } catch (error) {
      debugAudio('Audio queue could not be drained', {
        message: error instanceof Error ? error.message : 'Unknown audio error',
      });
    } finally {
      this.draining = false;

      if (
        this.pendingChunks.length > 0 &&
        this.context?.state === 'running'
      ) {
        void this.drainQueue();
      }

      this.resolveIdleWaiters();
    }
  }

  private scheduleChunk(
    context: AudioContext,
    samples: Float32Array,
    generation: number,
  ): void {
    const audioBuffer = context.createBuffer(
      1,
      samples.length,
      GEMINI_OUTPUT_SAMPLE_RATE,
    );

    audioBuffer.getChannelData(0).set(samples);

    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = audioBuffer;
    source.connect(gain);
    gain.connect(context.destination);

    const startTime = Math.max(
      this.nextStartTime,
      context.currentTime,
    );
    const endTime = startTime + audioBuffer.duration;
    const fadeDuration = Math.min(
      CHUNK_FADE_SECONDS,
      audioBuffer.duration / 2,
    );

    // Fade each raw PCM boundary to prevent an abrupt sample change becoming a click.
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(1, startTime + fadeDuration);
    gain.gain.setValueAtTime(1, endTime - fadeDuration);
    gain.gain.linearRampToValueAtTime(0, endTime);

    source.onended = () => {
      this.activeSources.delete(source);
      this.sourceGains.delete(source);

      try {
        source.disconnect();
      } catch {
        // Ignore an already-disconnected source.
      }

      try {
        gain.disconnect();
      } catch {
        // Ignore an already-disconnected gain node.
      }

      if (generation === this.playbackGeneration) {
        if (this.activeSources.size === 0) {
          this.nextStartTime = Math.max(
            this.nextStartTime,
            context.currentTime,
          );
          this.playbackStarted = false;
        }

        this.resolveIdleWaiters();
      }
    };

    this.activeSources.add(source);
    this.sourceGains.set(source, gain);
    source.start(startTime);

    this.nextStartTime = endTime;

    if (!this.playbackStarted) {
      this.playbackStarted = true;
      debugAudio('Audio playback started');
    }
  }

  private decodePcm16(base64Audio: string): Float32Array | null {
    if (!base64Audio) {
      return null;
    }

    try {
      const binary = atob(base64Audio);

      if (binary.length === 0 || binary.length % 2 !== 0) {
        debugAudio('Ignored malformed PCM audio chunk', {
          byteLength: binary.length,
        });
        return null;
      }

      const bytes = new Uint8Array(binary.length);

      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }

      const view = new DataView(bytes.buffer);
      const samples = new Float32Array(bytes.byteLength / 2);

      for (let index = 0; index < samples.length; index += 1) {
        samples[index] = view.getInt16(index * 2, true) / 32768;
      }

      return samples;
    } catch {
      debugAudio('Ignored invalid Base64 PCM audio chunk');
      return null;
    }
  }

  private isIdle(): boolean {
    return (
      this.activeSources.size === 0 &&
      this.pendingChunks.length === 0
    );
  }

  private resolveIdleWaiters(): void {
    if (!this.isIdle()) {
      return;
    }

    const resolvers = this.idleResolvers;
    this.idleResolvers = [];

    for (const resolve of resolvers) {
      resolve();
    }
  }

  close(): void {
    this.clear();

    if (this.context) {
      void this.context.close();
      this.context = null;
    }

    this.nextStartTime = 0;
  }
}
