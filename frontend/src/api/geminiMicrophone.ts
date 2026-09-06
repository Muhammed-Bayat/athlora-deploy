const GEMINI_INPUT_SAMPLE_RATE = 16_000;
const BUFFER_SIZE = 512;

export type GeminiMicrophoneChunkHandler = (
  base64Audio: string,
) => void;

export class GeminiMicrophone {
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;

  private source:
    | MediaStreamAudioSourceNode
    | null = null;

  private processor:
    | ScriptProcessorNode
    | null = null;

  private silentOutput:
    | GainNode
    | null = null;

  private paused = false;

  async start(
    onAudioChunk: GeminiMicrophoneChunkHandler,
  ): Promise<void> {
    if (this.stream) {
      return;
    }

    this.paused = false;

    this.stream =
      await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });

    this.context =
      new AudioContext({
        sampleRate:
          GEMINI_INPUT_SAMPLE_RATE,
      });

    if (
      this.context.state ===
      'suspended'
    ) {
      await this.context.resume();
    }

    this.source =
      this.context.createMediaStreamSource(
        this.stream,
      );

    this.processor =
      this.context.createScriptProcessor(
        BUFFER_SIZE,
        1,
        1,
      );

    /*
     * ScriptProcessorNode must remain connected
     * to the audio graph to keep processing.
     *
     * Route it through a muted GainNode so the
     * microphone can never feed into the speakers.
     */
    this.silentOutput =
      this.context.createGain();

    this.silentOutput.gain.value = 0;

    this.processor.onaudioprocess = (
      event: AudioProcessingEvent,
    ) => {
      const output =
        event.outputBuffer.getChannelData(
          0,
        );

      output.fill(0);

      /*
       * Athlora keeps the microphone open while
       * speaking, but pauses forwarding audio
       * to Gemini until playback has finished.
       */
      if (this.paused) {
        return;
      }

      const input =
        event.inputBuffer.getChannelData(
          0,
        );

      const pcm16 =
        this.float32ToPcm16(input);

      const base64 =
        this.pcm16ToBase64(pcm16);

      onAudioChunk(base64);
    };

    this.source.connect(
      this.processor,
    );

    this.processor.connect(
      this.silentOutput,
    );

    this.silentOutput.connect(
      this.context.destination,
    );
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  isPaused(): boolean {
    return this.paused;
  }

  isActive(): boolean {
    return this.stream !== null;
  }

  async stop(): Promise<void> {
    this.paused = false;

    if (this.processor) {
      this.processor.onaudioprocess =
        null;

      this.processor.disconnect();
      this.processor = null;
    }

    if (this.silentOutput) {
      this.silentOutput.disconnect();
      this.silentOutput = null;
    }

    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }

    if (this.stream) {
      for (
        const track
        of this.stream.getTracks()
      ) {
        track.stop();
      }

      this.stream = null;
    }

    if (this.context) {
      await this.context.close();
      this.context = null;
    }
  }

  private float32ToPcm16(
    input: Float32Array,
  ): Int16Array {
    const output =
      new Int16Array(
        input.length,
      );

    for (
      let index = 0;
      index < input.length;
      index += 1
    ) {
      const sample =
        Math.max(
          -1,
          Math.min(
            1,
            input[index] ?? 0,
          ),
        );

      output[index] =
        sample < 0
          ? sample * 0x8000
          : sample * 0x7fff;
    }

    return output;
  }

  private pcm16ToBase64(
    pcm: Int16Array,
  ): string {
    const bytes =
      new Uint8Array(
        pcm.buffer,
      );

    let binary = '';

    for (
      let index = 0;
      index < bytes.length;
      index += 1
    ) {
      binary +=
        String.fromCharCode(
          bytes[index] ?? 0,
        );
    }

    return btoa(binary);
  }
}
