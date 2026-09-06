---
sidebar_position: 3
---

# AI Voice Integration (Gemini)

Athlora integrates Google Gemini Live for voice-assisted athlete creation. A coach can speak to the assistant to add athletes to their roster without typing. The integration uses WebSocket-based streaming for real-time voice interaction and function-tool calling.

## Architecture

```
┌──────────────────────┐     HTTPS (token)      ┌──────────────────────┐
│  Frontend (Browser)  │ ──────────────────────► │  Backend API         │
│  GeminiMicrophone    │                         │  POST /ai/gemini-token│
│  AthloraGeminiSession│ ◄──── API key ──────── │  (returns Gemini key)│
│  GeminiAudioPlayer   │                         └──────────────────────┘
└──────────┬───────────┘
           │ WebSocket (wss://)
           ▼
┌──────────────────────┐
│  Gemini Live API     │
│  gemini-3.1-flash-   │
│  live-preview        │
└──────────────────────┘
```

## Backend

### POST /api/v1/ai/gemini-token

Returns a Gemini API key for the authenticated user. This is a thin proxy that creates a short-lived token for the frontend to authenticate directly with the Gemini Live WebSocket API.

| Field | Value |
|---|---|
| Authentication | Required (Auth0 JWT + synchronized user) |
| Response | `{ data: { token: string } }` |

The API key is never embedded in the frontend build — it is fetched on demand after authentication.

## Frontend Modules

### AthloraGeminiSession (`geminiLiveSdk.ts`)

The primary SDK wrapper around `@google/genai`'s Live session. This is the recommended implementation for production use.

**Constructor:** `new AthloraGeminiSession(options)`

| Option | Type | Description |
|---|---|---|
| `token` | `string` | Gemini API key from `/ai/gemini-token` |
| `onAudio` | `(base64: string) => void` | Receives PCM16 audio chunks from Gemini |
| `onTranscript` | `(text: string) => void` | Receives text transcription of Gemini's speech |
| `onTurnStart` | `() => void` | Gemini begins a response |
| `onTurnComplete` | `() => void` | Gemini finishes a response |
| `onInterrupted` | `() => void` | Gemini was interrupted by the user |
| `onSleepRequested` | `() => void` | Gemini called the `sleep_assistant` tool |
| `onConnected` | `() => void` | WebSocket connected |
| `onDisconnected` | `() => void` | WebSocket closed |
| `onError` | `(error: Error) => void` | Connection or response error |
| `onToolCall` | `GeminiToolHandler` | Handles function-tool calls from Gemini |

**Methods:**

| Method | Returns | Description |
|---|---|---|
| `connect()` | `Promise<void>` | Opens WebSocket, sends setup, resolves on `setupComplete` |
| `sendText(text)` | `Promise<string>` | Sends a text message; resolves with Gemini's transcript response |
| `sendAudio(base64)` | `void` | Streams a PCM16 audio chunk to Gemini |
| `endAudioStream()` | `void` | Signals end of an audio stream |
| `close()` | `void` | Closes the session |

### GeminiLive (`geminiLive.ts`)

A lower-level raw WebSocket implementation of the same protocol. Exports `connectGeminiLive(token)` and `sendGeminiText(socket, text, handleToolCall?, handleAudio?)`. This module is used for testing and as a fallback; the SDK wrapper is preferred for production.

### GeminiAudioPlayer (`geminiAudio.ts`)

Queued PCM16 audio playback using the Web Audio API. Gemini outputs audio at 24kHz; the player decodes base64 PCM16 chunks, schedules them sequentially via `AudioBufferSourceNode`, and manages an internal playback queue.

| Method | Description |
|---|---|
| `prepare()` | Creates/resumes `AudioContext`, unlocks browser audio with a silent sample |
| `playPcm16(base64)` | Decodes and queues a PCM16 chunk for playback at 24kHz |
| `waitUntilIdle()` | Resolves when all queued chunks have finished playing |
| `clear()` | Stops and removes all queued sources |
| `close()` | Clears playback and closes the `AudioContext` |

### GeminiMicrophone (`geminiMicrophone.ts`)

Captures microphone audio via `getUserMedia`, resamples to 16kHz mono, converts Float32 samples to PCM16, and fires base64-encoded chunks via callback. Uses `ScriptProcessorNode` routed through a silent `GainNode` to prevent feedback.

| Method | Description |
|---|---|
| `start(onChunk)` | Requests mic access, begins streaming PCM16 chunks at 16kHz |
| `pause()` | Pauses forwarding audio (microphone stays open for echo cancellation) |
| `resume()` | Resumes forwarding audio to Gemini |
| `isPaused()` | Returns whether forwarding is paused |
| `isActive()` | Returns whether the microphone stream is active |
| `stop()` | Stops all tracks, disconnects nodes, closes `AudioContext` |

## Function Tools

Gemini is configured with two function tools:

### create_athlete

Creates a new athlete in the coach's roster after explicit user confirmation.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `name` | `string` | Yes | Athlete full name |
| `dob` | `string` | No | Date of birth (`YYYY-MM-DD`) |
| `gender` | `string` | No | Gender category |
| `notes` | `string` | No | Coach notes |

The assistant confirms details with the user before calling this tool. It is only invoked after explicit confirmation.

### sleep_assistant

Puts the assistant to sleep when the user asks it to deactivate. After success, the assistant says "Going to sleep." and stops listening. This tool is only triggered by commands directed at the assistant (e.g., "go to sleep", "deactivate"), not ordinary uses of the word "sleep".

## System Instruction

The Gemini model receives this system instruction:

> You are Athlora, the Athlora voice assistant. Your current job is to help authorised users add athletes. Never invent missing information. Before creating an athlete, clearly confirm the details with the user. Only use create_athlete after the user explicitly confirms. Keep responses short and conversational.

The SDK version adds: "If the user asks you to sleep, go to sleep, switch off, deactivate, stop listening, or otherwise go inactive, call sleep_assistant."

## Audio Format

| Direction | Format | Sample Rate | Encoding |
|---|---|---|---|
| Microphone → Gemini | Mono PCM16 | 16kHz | Base64 |
| Gemini → Speaker | Mono PCM16 | 24kHz | Base64 |

## Session Lifecycle

1. Coach opens the voice assistant panel
2. Frontend fetches a Gemini API key via `POST /ai/gemini-token`
3. `AthloraGeminiSession.connect()` opens a WebSocket and sends the setup message (model, system instruction, tools)
4. Gemini responds with `setupComplete`
5. Coach speaks — `GeminiMicrophone` captures and streams audio chunks
6. Coach can also type text — `sendText()` sends it as `realtimeInput`
7. Gemini responds with audio chunks (`onAudio`) and text transcription (`onTranscript`)
8. When Gemini calls `create_athlete`, the frontend `onToolCall` handler calls `POST /api/v1/athletes` and returns the result
9. When Gemini calls `sleep_assistant`, the session is closed

## Dependencies

- `@google/genai` — Google Generative AI SDK (Live API support)
- Web Audio API — PCM16 playback (browser built-in)
- `getUserMedia` — Microphone capture (browser built-in)

## AI declaration

This document was created with the assistance of opencode[mimo-v2.5-free].
