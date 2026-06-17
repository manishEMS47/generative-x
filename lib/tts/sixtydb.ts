/* 60db (https://60db.ai) text-to-speech provider.
 *
 * 60db differs from ElevenLabs in two ways that matter here:
 *   1. Auth is `Authorization: Bearer <key>` (ElevenLabs uses `xi-api-key`).
 *   2. Audio comes back base64-encoded inside JSON — a single `audio_base64`
 *      field for the sync endpoint, or newline-delimited JSON (NDJSON) chunks
 *      with an `audioContent` field for the streaming endpoint.
 *
 * To stay consistent with the rest of the app, this module decodes that base64
 * and re-emits a raw `audio/mpeg` stream — the exact same response shape the
 * ElevenLabs path produces and that `AudioLivePlayer` already knows how to play.
 * We always request mp3 output so the decoded bytes feed the browser's
 * `audio/mpeg` MediaSource buffer directly.
 */
import type { SpeechInputSchema } from "./schema";

const SIXTYDB_HOST = "https://api.60db.ai";

function sixtyDbAccess(apiKey?: string): { headers: HeadersInit } {
  const key = (apiKey || process.env.SIXTYDB_API_KEY || "").trim();
  if (!key) throw new Error("Missing 60db API key.");
  return {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
  };
}

/**
 * 60db uses a single default voice (its own UUIDs, unrelated to ElevenLabs voice
 * ids). The filter-derived `voiceId` the app sends is an ElevenLabs id, so it is
 * intentionally ignored here — we use the configured 60db default instead. If the
 * env var is unset, `voice_id` is omitted and 60db falls back to its system voice.
 */
function sixtyDbVoiceId(): string | undefined {
  return process.env.SIXTYDB_DEFAULT_VOICE_ID?.trim() || undefined;
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function sixtyDbError(res: Response): Promise<Error> {
  const payload = await res.json().catch(() => null);
  return new Error(
    `60db ${res.statusText} (${res.status})${payload ? " · " + JSON.stringify(payload) : ""}`,
  );
}

// Defensive extraction: the streaming payload shape is documented loosely
// (message types: chunk / complete / error), so accept the common variants.
function extractAudioB64(obj: any): string | undefined {
  return (
    obj?.audioContent ??
    obj?.chunk?.audioContent ??
    obj?.audio_base64 ??
    obj?.audio ??
    obj?.data?.audioContent
  );
}

function extractError(obj: any): string | undefined {
  if (obj?.error)
    return typeof obj.error === "string" ? obj.error : obj.error?.message;
  if (obj?.type === "error") return obj.message;
  return undefined;
}

export async function sixtyDbSpeech(
  input: SpeechInputSchema,
): Promise<Response> {
  const { headers } = sixtyDbAccess(input.apiKey);
  const voiceId = sixtyDbVoiceId();

  const body = {
    text: input.text,
    ...(voiceId && { voice_id: voiceId }),
    output_format: "mp3",
  };

  return input.streaming
    ? sixtyDbSpeechStream(headers, body)
    : sixtyDbSpeechSync(headers, body);
}

// POST /tts-synthesize -> { audio_base64, ... }. Decode to a single mp3 buffer.
async function sixtyDbSpeechSync(
  headers: HeadersInit,
  body: object,
): Promise<Response> {
  const upstream = await fetch(`${SIXTYDB_HOST}/tts-synthesize`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!upstream.ok) throw await sixtyDbError(upstream);

  const json: any = await upstream.json();
  const b64 = json?.audio_base64;
  if (!b64) throw new Error(json?.message || "60db: no audio in response");

  return new Response(base64ToBytes(b64), {
    status: 200,
    headers: { "Content-Type": "audio/mpeg" },
  });
}

// POST /tts-stream -> NDJSON of { audioContent } chunks. Decode each line and
// re-emit the raw mp3 bytes as they arrive, so playback starts before the full
// clip is generated (matching the ElevenLabs streaming behaviour).
async function sixtyDbSpeechStream(
  headers: HeadersInit,
  body: object,
): Promise<Response> {
  const upstream = await fetch(`${SIXTYDB_HOST}/tts-stream`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!upstream.ok || !upstream.body) throw await sixtyDbError(upstream);

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const handleLine = (
    line: string,
    controller: ReadableStreamDefaultController<Uint8Array>,
  ): void => {
    let obj: any;
    try {
      obj = JSON.parse(line);
    } catch {
      return; // ignore non-JSON keep-alive lines
    }
    const err = extractError(obj);
    if (err) {
      controller.error(new Error(`60db: ${err}`));
      return;
    }
    const b64 = extractAudioB64(obj);
    if (b64) controller.enqueue(base64ToBytes(b64));
  };

  const audioStream = new ReadableStream<Uint8Array>({
    start(controller) {
      (async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let nl: number;
            while ((nl = buffer.indexOf("\n")) >= 0) {
              const line = buffer.slice(0, nl).trim();
              buffer = buffer.slice(nl + 1);
              if (line) handleLine(line, controller);
            }
          }
          const last = buffer.trim();
          if (last) handleLine(last, controller);
          controller.close();
        } catch (e) {
          controller.error(e);
        }
      })();
    },
    cancel() {
      void reader.cancel();
    },
  });

  return new Response(audioStream, {
    status: 200,
    headers: { "Content-Type": "audio/mpeg" },
  });
}
