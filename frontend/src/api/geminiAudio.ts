const GEMINI_OUTPUT_SAMPLE_RATE = 24_000;

export class GeminiAudioPlayer {
  private context: AudioContext | null = null;
  private nextStartTime = 0;
  private activeSources = new Set<AudioBufferSourceNode>();
  private idleResolvers: Array<() => void> = [];

  async prepare(): Promise<void> {
    if (
      !this.context ||
      this.context.state === 'closed'
    ) {
      this.context = new AudioContext();
      this.nextStartTime = 0;
    }

    if (this.context.state === 'suspended') {
      await this.context.resume();
    }

    /*
     * Play one silent sample so browser audio is unlocked
     * from the user's interaction. The sample value is zero,
     * so this should not intentionally create any audible sound.
     */
    const unlockBuffer = this.context.createBuffer(
      1,
      1,
      this.context.sampleRate,
    );

    const unlockSource =
      this.context.createBufferSource();

    unlockSource.buffer = unlockBuffer;
    unlockSource.connect(this.context.destination);
    unlockSource.start();

    this.nextStartTime = Math.max(
      this.nextStartTime,
      this.context.currentTime,
    );
  }

  playPcm16(base64Audio: string): void {
    const context = this.context;

    if (!context) {
      console.warn(
        'Gemini audio arrived before the audio player was prepared',
      );
      return;
    }

    void this.playChunk(context, base64Audio);
  }

  async waitUntilIdle(): Promise<void> {
    if (this.activeSources.size === 0) {
      return;
    }

    await new Promise<void>((resolve) => {
      this.idleResolvers.push(resolve);
    });
  }

  clear(): void {
    const context = this.context;

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
    }

    this.activeSources.clear();

    this.nextStartTime =
      context?.currentTime ?? 0;

    this.resolveIdleWaiters();
  }

  private async playChunk(
    context: AudioContext,
    base64Audio: string,
  ): Promise<void> {
    if (context.state === 'suspended') {
      await context.resume();
    }

    if (context.state !== 'running') {
      console.warn(
        'Unable to play Gemini audio. AudioContext state:',
        context.state,
      );
      return;
    }

    const binary = atob(base64Audio);
    const bytes = new Uint8Array(binary.length);

    for (
      let index = 0;
      index < binary.length;
      index += 1
    ) {
      bytes[index] = binary.charCodeAt(index);
    }

    const view = new DataView(bytes.buffer);

    const sampleCount = Math.floor(
      bytes.byteLength / 2,
    );

    if (sampleCount === 0) {
      return;
    }

    const audioBuffer = context.createBuffer(
      1,
      sampleCount,
      GEMINI_OUTPUT_SAMPLE_RATE,
    );

    const channel = audioBuffer.getChannelData(0);

    for (
      let index = 0;
      index < sampleCount;
      index += 1
    ) {
      const sample = view.getInt16(
        index * 2,
        true,
      );

      channel[index] = sample / 32768;
    }

    const source = context.createBufferSource();

    source.buffer = audioBuffer;
    source.connect(context.destination);

    source.onended = () => {
      this.activeSources.delete(source);

      try {
        source.disconnect();
      } catch {
        // Ignore an already-disconnected source.
      }

      if (this.activeSources.size === 0) {
        this.nextStartTime = Math.max(
          this.nextStartTime,
          context.currentTime,
        );

        this.resolveIdleWaiters();
      }
    };

    const startTime = Math.max(
      this.nextStartTime,
      context.currentTime,
    );

    this.activeSources.add(source);
    source.start(startTime);

    this.nextStartTime =
      startTime + audioBuffer.duration;
  }

  private resolveIdleWaiters(): void {
    if (this.activeSources.size !== 0) {
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
