import { beforeEach, describe, expect, it, vi } from "vitest";

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

const liveConnect = vi
  .fn()
  .mockImplementation(async (config: Record<string, unknown>) => {
    capturedCallbacks = (config.callbacks as Record<string, unknown>) ?? {};
    return mockSession;
  });

vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn(() => ({ live: { connect: liveConnect } })),
  Behavior: { NON_BLOCKING: "NON_BLOCKING" },
  InteractionStatus: {
    IN_PROGRESS: "IN_PROGRESS",
    IDLE: "IDLE",
  },
  Modality: { AUDIO: "AUDIO" },
  ThinkingLevel: { MEDIUM: "MEDIUM" },
  Type: {
    ARRAY: "ARRAY",
    INTEGER: "INTEGER",
    OBJECT: "OBJECT",
    STRING: "STRING",
  },
}));

import {
  AthloraGeminiSession,
  GEMINI_LIVE_DEFAULT_MODEL,
  GEMINI_LIVE_ROLLBACK_MODEL,
} from "./geminiLiveSdk";

function createSession(overrides = {}) {
  return new AthloraGeminiSession({
    token: "test-token",
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

describe("AthloraGeminiSession", () => {
  describe("connect", () => {
    it("connects to the Gemini live API and fires onConnected", async () => {
      liveConnect.mockImplementation(
        async (config: Record<string, unknown>) => {
          capturedCallbacks =
            (config.callbacks as Record<string, unknown>) ?? {};
          (capturedCallbacks.onopen as () => void)?.();
          return mockSession;
        },
      );

      const onConnected = vi.fn();
      const session = createSession({ onConnected });

      await session.connect();

      expect(liveConnect).toHaveBeenCalledOnce();
      expect(onConnected).toHaveBeenCalledOnce();
    });

    it("sends the default model, thinking config, tools, and system prompt", async () => {
      await createSession().connect();

      const config = liveConnect.mock.calls[0][0];
      expect(config.model).toBe(GEMINI_LIVE_DEFAULT_MODEL);
      expect(GEMINI_LIVE_DEFAULT_MODEL).toBe(
        "gemini-3.8-live-extended-thinking",
      );
      expect(GEMINI_LIVE_ROLLBACK_MODEL).toBe("gemini-3.1-flash-live-preview");
      expect(config.config.responseModalities).toEqual(["AUDIO"]);
      expect(config.config.thinkingConfig).toEqual({
        thinkingLevel: "MEDIUM",
      });
      expect(config.config.speechConfig).toEqual({
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: "Sulafat",
          },
        },
      });
      expect(config.config.systemInstruction.parts[0].text).toContain(
        "Athlora",
      );
      expect(config.config.systemInstruction.parts[0].text).toContain(
        "slightly slower than normal",
      );
      expect(config.config.systemInstruction.parts[0].text).toContain(
        "Never invent Athlora platform data",
      );
      expect(config.config.systemInstruction.parts[0].text).toContain(
        "never creates an athlete",
      );
      expect(config.config.systemInstruction.parts[0].text).toContain(
        "Use evidence first",
      );
      expect(config.config.systemInstruction.parts[0].text).toContain(
        "no data or no conclusion",
      );
      expect(config.config.systemInstruction.parts[0].text).toContain(
        "Never claim or infer workload, wellness, or readiness",
      );
      expect(config.config.systemInstruction.parts[0].text).toContain(
        "Reports require actual tool results",
      );
      expect(config.config.inputAudioTranscription).toEqual({});
      expect(
        config.config.tools[0].functionDeclarations.map(
          (t: { name: string }) => t.name,
        ),
      ).toEqual([
        "get_current_page_context",
        "list_disciplines",
        "search_athletes",
        "get_athlete_discipline_analysis",
        "get_workspace_discipline_analysis",
        "get_coach_performance_analysis",
        "get_coach_injury_analysis",
        "get_coach_rankings_analysis",
        "download_coach_performance_report",
        "download_coach_injury_report",
        "download_coach_rankings_report",
        "prepare_athlete_draft",
        "get_named_place_weather",
        "get_current_location_weather",
        "sleep_assistant",
      ]);
      expect(
        config.config.tools[0].functionDeclarations.map(
          (t: { name: string }) => t.name,
        ),
      ).not.toContain("create_athlete");
    });

    it("uses a caller-supplied model, including the exported rollback model", async () => {
      await createSession({ model: GEMINI_LIVE_ROLLBACK_MODEL }).connect();

      expect(liveConnect.mock.calls[0][0].model).toBe(
        GEMINI_LIVE_ROLLBACK_MODEL,
      );
    });

    it("sets every function declaration to non-blocking", async () => {
      await createSession().connect();

      const declarations =
        liveConnect.mock.calls[0][0].config.tools[0].functionDeclarations;

      expect(declarations).not.toHaveLength(0);
      expect(declarations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "get_coach_rankings_analysis",
            behavior: "NON_BLOCKING",
          }),
        ]),
      );
      expect(
        declarations.every(
          (declaration: { behavior?: string }) =>
            declaration.behavior === "NON_BLOCKING",
        ),
      ).toBe(true);
    });

    it("declares filters for coach analytics and report tools", async () => {
      await createSession().connect();

      const declarations = liveConnect.mock.calls[0][0].config.tools[0]
        .functionDeclarations as Array<{
        name: string;
        parameters: {
          properties: Record<string, unknown>;
        };
      }>;
      for (const name of [
        "get_coach_performance_analysis",
        "download_coach_performance_report",
      ]) {
        const declaration = declarations.find(
          (candidate) => candidate.name === name,
        );
        expect(declaration?.parameters.properties).toEqual(
          expect.objectContaining({
            athleteIds: expect.any(Object),
            discipline: expect.any(Object),
            dateFrom: expect.any(Object),
            dateTo: expect.any(Object),
            lifecycleStatus: expect.any(Object),
          }),
        );
      }

      for (const name of [
        "get_coach_injury_analysis",
        "download_coach_injury_report",
      ]) {
        const declaration = declarations.find(
          (candidate) => candidate.name === name,
        );
        expect(declaration?.parameters.properties).toEqual(
          expect.objectContaining({
            athleteIds: expect.any(Object),
            dateFrom: expect.any(Object),
            dateTo: expect.any(Object),
            lifecycleStatus: expect.any(Object),
          }),
        );
        expect(declaration?.parameters.properties).not.toHaveProperty("discipline");
      }

      for (const name of [
        "get_coach_rankings_analysis",
        "download_coach_rankings_report",
      ]) {
        const declaration = declarations.find(
          (candidate) => candidate.name === name,
        );
        expect(declaration?.parameters.properties).toEqual(
          expect.objectContaining({
            discipline: expect.any(Object),
            dateFrom: expect.any(Object),
            dateTo: expect.any(Object),
            lifecycleStatus: expect.any(Object),
            limit: expect.objectContaining({ type: "INTEGER" }),
          }),
        );
        expect(declaration?.parameters.properties).not.toHaveProperty("athleteIds");
      }
    });

    it("fires onReady only after the Live session resolves", async () => {
      const onReady = vi.fn();
      const session = createSession({ onReady });

      await session.connect();

      expect(onReady).toHaveBeenCalledOnce();
    });

    it("does nothing if already connected (idempotent)", async () => {
      const session = createSession();
      await session.connect();
      await session.connect();

      expect(liveConnect).toHaveBeenCalledOnce();
    });

    it("fires onDisconnected on session close", async () => {
      const onDisconnected = vi.fn();
      const session = createSession({ onDisconnected });
      await session.connect();

      (capturedCallbacks.onclose as (event: { code: number; reason: string }) => void)(
        { code: 1000, reason: "" },
      );

      expect(onDisconnected).toHaveBeenCalledOnce();
    });

    it("rejects setup when Gemini closes before acknowledging it", async () => {
      liveConnect.mockImplementation(
        (config: Record<string, unknown>) => {
          capturedCallbacks =
            (config.callbacks as Record<string, unknown>) ?? {};
          return new Promise(() => undefined);
        },
      );
      const onError = vi.fn();
      const session = createSession({ onError });

      const connecting = session.connect();
      (capturedCallbacks.onclose as (event: { code: number; reason: string }) => void)(
        { code: 1007, reason: "Thinking level must be specified" },
      );

      await expect(connecting).rejects.toThrow(
        "Gemini closed before setup completed",
      );
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Gemini closed before setup completed. Please try again.",
        }),
      );
    });

    it("rejects setup after the bounded timeout", async () => {
      vi.useFakeTimers();
      liveConnect.mockImplementation(
        (config: Record<string, unknown>) => {
          capturedCallbacks =
            (config.callbacks as Record<string, unknown>) ?? {};
          return new Promise(() => undefined);
        },
      );
      const session = createSession();
      const connecting = session.connect();
      const expectedRejection = expect(connecting).rejects.toThrow(
        "Gemini did not complete setup. Please try again.",
      );

      await vi.advanceTimersByTimeAsync(15_000);

      await expectedRejection;
      vi.useRealTimers();
    });

    it("fires onError on session error", async () => {
      const onError = vi.fn();
      const session = createSession({ onError });
      await session.connect();

      (capturedCallbacks.onerror as (e: unknown) => void)({
        message: "connection lost",
      });

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: "connection lost" }),
      );
    });

    it("uses fallback error message when event has no message", async () => {
      const onError = vi.fn();
      const session = createSession({ onError });
      await session.connect();

      (capturedCallbacks.onerror as (e: unknown) => void)({ message: "" });

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Gemini Live connection error" }),
      );
    });

    it("rejects pending turn on error", async () => {
      const session = createSession();
      await session.connect();

      const sendPromise = session.sendText("hello");

      (capturedCallbacks.onerror as (e: unknown) => void)({ message: "fail" });

      await expect(sendPromise).rejects.toThrow("fail");
    });
  });

  describe("sendText", () => {
    it("throws if session not connected", async () => {
      await expect(createSession().sendText("hi")).rejects.toThrow(
        "Gemini Live session is not connected",
      );
    });

    it("throws if already responding", async () => {
      const session = createSession();
      await session.connect();

      const first = session.sendText("first");
      await expect(session.sendText("second")).rejects.toThrow(
        "Gemini is already responding",
      );

      // Resolve the first turn so tests clean up
      fireCallback("onmessage", { serverContent: { turnComplete: true } });
      await first;
    });

    it("sends client content and resolves on turnComplete", async () => {
      const session = createSession();
      await session.connect();

      const responsePromise = session.sendText("add Bob");

      expect(mockSession.sendClientContent).toHaveBeenCalledWith({
        turns: [{ role: "user", parts: [{ text: "add Bob" }] }],
        turnComplete: true,
      });

      fireCallback("onmessage", {
        serverContent: {
          outputTranscription: { text: "Sure" },
          turnComplete: true,
        },
      });

      expect(await responsePromise).toBe("Sure");
    });

    it("falls back to default text on empty transcript", async () => {
      const session = createSession();
      await session.connect();

      const promise = session.sendText("hi");
      fireCallback("onmessage", { serverContent: { turnComplete: true } });

      expect(await promise).toBe("Gemini completed the request.");
    });
  });

  describe("sendAudio", () => {
    it("throws if session not connected", () => {
      expect(() => createSession().sendAudio("base64data")).toThrow(
        "Gemini Live session is not connected",
      );
    });

    it("sends realtime audio input", async () => {
      const session = createSession();
      await session.connect();

      session.sendAudio("pcm-data");

      expect(mockSession.sendRealtimeInput).toHaveBeenCalledWith({
        audio: { data: "pcm-data", mimeType: "audio/pcm;rate=16000" },
      });
    });
  });

  describe("endAudioStream", () => {
    it("does nothing if session is null", () => {
      createSession().endAudioStream(); // no throw
    });

    it("sends audioStreamEnd signal", async () => {
      const session = createSession();
      await session.connect();
      session.endAudioStream();

      expect(mockSession.sendRealtimeInput).toHaveBeenCalledWith({
        audioStreamEnd: true,
      });
    });
  });

  describe("close", () => {
    it("closes session and clears state", async () => {
      const onDisconnected = vi.fn();
      const session = createSession({ onDisconnected });
      await session.connect();

      session.close();

      expect(mockSession.close).toHaveBeenCalled();
      expect(onDisconnected).not.toHaveBeenCalled(); // close() doesn't fire onDisconnected
    });

    it("rejects a pending turn when explicitly closed", async () => {
      const session = createSession();
      await session.connect();
      const pending = session.sendText("Tell me about the roster.");
      session.close();

      await expect(pending).rejects.toThrow("Gemini Live session closed");
    });
  });

  describe("handleMessage", () => {
    it("dispatches tool calls to onToolCall and sends responses", async () => {
      const onToolCall = vi.fn().mockResolvedValue({ id: "athlete-1" });
      const session = createSession({ onToolCall });
      await session.connect();

      fireCallback("onmessage", {
        toolCall: {
          functionCalls: [
            { id: "c1", name: "list_disciplines", args: { query: "100m" } },
          ],
        },
      });

      await vi.waitFor(() =>
        expect(onToolCall).toHaveBeenCalledWith(
          { id: "c1", name: "list_disciplines", args: { query: "100m" } },
          expect.anything(),
        ),
      );
      await vi.waitFor(() =>
        expect(mockSession.sendToolResponse).toHaveBeenCalledWith({
          functionResponses: [
            {
              id: "c1",
              name: "list_disciplines",
              response: { result: { id: "athlete-1" } },
            },
          ],
        }),
      );
    });

    it("executes multiple tool calls concurrently and sends one combined response", async () => {
      let resolveFirst: (value: unknown) => void = () => undefined;
      let resolveSecond: (value: unknown) => void = () => undefined;
      const first = new Promise<unknown>((resolve) => {
        resolveFirst = resolve;
      });
      const second = new Promise<unknown>((resolve) => {
        resolveSecond = resolve;
      });
      const onToolCall = vi.fn((call: { id?: string }) =>
        call.id === "c1" ? first : second,
      );
      const onToolCallStart = vi.fn();
      const onToolCallEnd = vi.fn();
      const session = createSession({
        onToolCall,
        onToolCallStart,
        onToolCallEnd,
      });
      await session.connect();

      fireCallback("onmessage", {
        toolCall: {
          functionCalls: [
            { id: "c1", name: "search_athletes" },
            { id: "c2", name: "list_disciplines" },
          ],
        },
      });

      await vi.waitFor(() => expect(onToolCall).toHaveBeenCalledTimes(2));
      expect(onToolCallStart).toHaveBeenCalledTimes(2);

      resolveSecond({ second: true });
      await Promise.resolve();
      expect(mockSession.sendToolResponse).not.toHaveBeenCalled();

      resolveFirst({ first: true });

      await vi.waitFor(() =>
        expect(mockSession.sendToolResponse).toHaveBeenCalledWith({
          functionResponses: [
            {
              id: "c1",
              name: "search_athletes",
              response: { result: { first: true } },
            },
            {
              id: "c2",
              name: "list_disciplines",
              response: { result: { second: true } },
            },
          ],
        }),
      );
      expect(onToolCallEnd).toHaveBeenCalledTimes(2);
    });

    it("handles sleep_assistant tool call natively", async () => {
      const onSleepRequested = vi.fn();
      const session = createSession({ onSleepRequested });
      await session.connect();

      fireCallback("onmessage", {
        toolCall: { functionCalls: [{ id: "c1", name: "sleep_assistant" }] },
      });

      await vi.waitFor(() =>
        expect(mockSession.sendToolResponse).toHaveBeenCalledWith({
          functionResponses: [
            { id: "c1", name: "sleep_assistant", response: { success: true } },
          ],
        }),
      );
      expect(onSleepRequested).toHaveBeenCalledOnce();
    });

    it("sends error response when tool call throws", async () => {
      const onToolCall = vi.fn().mockRejectedValue(new Error("DB error"));
      const session = createSession({ onToolCall });
      await session.connect();

      fireCallback("onmessage", {
        toolCall: { functionCalls: [{ id: "c1", name: "search_athletes" }] },
      });

      await vi.waitFor(() =>
        expect(mockSession.sendToolResponse).toHaveBeenCalledWith({
          functionResponses: [
            {
              id: "c1",
              name: "search_athletes",
              response: { error: "DB error" },
            },
          ],
        }),
      );
    });

    it("throws when tool call arrives but no onToolCall configured", async () => {
      const session = createSession();
      await session.connect();

      fireCallback("onmessage", {
        toolCall: { functionCalls: [{ id: "c1", name: "search_athletes" }] },
      });

      await vi.waitFor(() =>
        expect(mockSession.sendToolResponse).toHaveBeenCalledWith({
          functionResponses: [
            {
              id: "c1",
              name: "search_athletes",
              response: { error: "No Gemini tool handler configured" },
            },
          ],
        }),
      );
    });

    it("aborts in-flight tool calls on interruption without sending stale responses", async () => {
      let resolveTool: (value: unknown) => void = () => undefined;
      let signal: AbortSignal | undefined;
      const pendingTool = new Promise<unknown>((resolve) => {
        resolveTool = resolve;
      });
      const onToolCall = vi.fn((_: unknown, toolSignal?: AbortSignal) => {
        signal = toolSignal;
        return pendingTool;
      });
      const onToolCallEnd = vi.fn();
      const session = createSession({ onToolCall, onToolCallEnd });
      await session.connect();

      fireCallback("onmessage", {
        toolCall: {
          functionCalls: [{ id: "c1", name: "search_athletes" }],
        },
      });

      await vi.waitFor(() => expect(onToolCall).toHaveBeenCalledOnce());
      expect(signal?.aborted).toBe(false);

      fireCallback("onmessage", {
        serverContent: { interrupted: true },
      });
      expect(signal?.aborted).toBe(true);

      resolveTool({ stale: true });
      await vi.waitFor(() => expect(onToolCallEnd).toHaveBeenCalledOnce());

      expect(mockSession.sendToolResponse).not.toHaveBeenCalled();
    });

    it("aborts tool calls on close and suppresses stale responses after reconnect", async () => {
      let resolveTool: (value: unknown) => void = () => undefined;
      let signal: AbortSignal | undefined;
      const pendingTool = new Promise<unknown>((resolve) => {
        resolveTool = resolve;
      });
      const onToolCall = vi.fn((_: unknown, toolSignal?: AbortSignal) => {
        signal = toolSignal;
        return pendingTool;
      });
      const onToolCallEnd = vi.fn();
      const session = createSession({ onToolCall, onToolCallEnd });
      await session.connect();

      fireCallback("onmessage", {
        toolCall: {
          functionCalls: [{ id: "c1", name: "search_athletes" }],
        },
      });
      await vi.waitFor(() => expect(onToolCall).toHaveBeenCalledOnce());

      session.close();
      expect(signal?.aborted).toBe(true);
      await session.connect();
      resolveTool({ stale: true });
      await vi.waitFor(() => expect(onToolCallEnd).toHaveBeenCalledOnce());

      expect(mockSession.sendToolResponse).not.toHaveBeenCalled();
    });

    it("accumulates audio and transcription during a turn", async () => {
      const onAudio = vi.fn();
      const onTranscript = vi.fn();
      const onTurnStart = vi.fn();
      const session = createSession({ onAudio, onTranscript, onTurnStart });
      await session.connect();

      fireCallback("onmessage", {
        serverContent: {
          modelTurn: {
            parts: [{ inlineData: { data: "audio1", mimeType: "audio/pcm" } }],
          },
          outputTranscription: { text: "Hello" },
        },
      });

      expect(onTurnStart).toHaveBeenCalledOnce();
      expect(onAudio).toHaveBeenCalledWith("audio1");
      expect(onTranscript).toHaveBeenCalledWith("Hello");
    });

    it("forwards input transcription separately from model output", async () => {
      const onInputTranscript = vi.fn();
      const onTranscript = vi.fn();
      const session = createSession({ onInputTranscript, onTranscript });
      await session.connect();

      fireCallback("onmessage", {
        serverContent: {
          inputTranscription: { text: "Yes please" },
          outputTranscription: { text: "I can help." },
        },
      });

      expect(onInputTranscript).toHaveBeenCalledWith("Yes please");
      expect(onTranscript).toHaveBeenCalledWith("I can help.");
    });

    it("skips audio parts without audio mimeType", async () => {
      const onAudio = vi.fn();
      const session = createSession({ onAudio });
      await session.connect();

      fireCallback("onmessage", {
        serverContent: {
          modelTurn: {
            parts: [{ inlineData: { data: "text", mimeType: "text/plain" } }],
          },
        },
      });

      expect(onAudio).not.toHaveBeenCalled();
    });

    it("forwards only Gemini 24kHz PCM audio", async () => {
      const onAudio = vi.fn();
      const session = createSession({ onAudio });
      await session.connect();

      fireCallback("onmessage", {
        serverContent: {
          modelTurn: {
            parts: [
              {
                inlineData: { data: "pcm-default-rate", mimeType: "audio/pcm" },
              },
              {
                inlineData: {
                  data: "pcm-24k",
                  mimeType: "audio/pcm;rate=24000",
                },
              },
              {
                inlineData: {
                  data: "pcm-16k",
                  mimeType: "audio/pcm;rate=16000",
                },
              },
              { inlineData: { data: "wav", mimeType: "audio/wav" } },
              { inlineData: { data: "unknown-rate" } },
            ],
          },
        },
      });

      expect(onAudio).toHaveBeenCalledTimes(2);
      expect(onAudio).toHaveBeenNthCalledWith(1, "pcm-default-rate");
      expect(onAudio).toHaveBeenNthCalledWith(2, "pcm-24k");
    });

    it("resolves pending turns on turnComplete even after an interaction status", async () => {
      const onTurnComplete = vi.fn();
      const onInteractionStatus = vi.fn();
      const session = createSession({
        onInteractionStatus,
        onTurnComplete,
      });
      await session.connect();

      const promise = session.sendText("hi");
      fireCallback("onmessage", {
        serverContent: {
          interactionStatus: "IN_PROGRESS",
          outputTranscription: { text: "Sure" },
          turnComplete: true,
        },
      });

      expect(await promise).toBe("Sure");
      expect(onInteractionStatus).toHaveBeenNthCalledWith(1, "IN_PROGRESS");
      expect(onTurnComplete).toHaveBeenCalledOnce();
    });

    it("handles interrupted response", async () => {
      const onInterrupted = vi.fn();
      const session = createSession({ onInterrupted });
      await session.connect();

      const promise = session.sendText("hi");

      // Start a turn, then interrupt
      fireCallback("onmessage", {
        serverContent: { outputTranscription: { text: "Partial" } },
      });
      fireCallback("onmessage", {
        serverContent: { interrupted: true },
      });

      expect(await promise).toBe("Partial");
      expect(onInterrupted).toHaveBeenCalledOnce();
    });

    it("falls back to default text on interrupt with empty transcript", async () => {
      const session = createSession();
      await session.connect();

      const promise = session.sendText("hi");
      fireCallback("onmessage", { serverContent: { interrupted: true } });

      expect(await promise).toBe("Gemini response interrupted.");
    });

    it("does not fire onTurnStart twice in same turn", async () => {
      const onTurnStart = vi.fn();
      const session = createSession({ onTurnStart });
      await session.connect();

      fireCallback("onmessage", {
        serverContent: { outputTranscription: { text: "a" } },
      });
      fireCallback("onmessage", {
        serverContent: { outputTranscription: { text: "b" } },
      });

      expect(onTurnStart).toHaveBeenCalledOnce();
    });

    it("ignores messages without serverContent or toolCall", async () => {
      const session = createSession();
      await session.connect();

      fireCallback("onmessage", {});
      fireCallback("onmessage", { somethingElse: true });
      // No throw
    });

    it("resets receivingTurn after turnComplete", async () => {
      const onTurnStart = vi.fn();
      const session = createSession({ onTurnStart });
      await session.connect();

      // First turn
      fireCallback("onmessage", {
        serverContent: {
          outputTranscription: { text: "a" },
          turnComplete: true,
        },
      });
      // Second turn should fire onTurnStart again
      fireCallback("onmessage", {
        serverContent: { outputTranscription: { text: "b" } },
      });

      expect(onTurnStart).toHaveBeenCalledTimes(2);
    });
  });
});
