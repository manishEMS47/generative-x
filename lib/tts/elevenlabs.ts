/* The ElevenLabs path was originally lifted (with permission) from the open-source
 * MIT licensed big-AGI project. https://github.com/enricoros/big-AGI
 *
 * It is preserved verbatim here, just relocated behind the provider abstraction so
 * `app/api/speech/route.ts` can dispatch to it or to 60db with one shared contract.
 */
import type { SpeechInputSchema } from "./schema";

function elevenlabsVoiceId(voiceId?: string): string {
  return voiceId?.trim() || "21m00Tcm4TlvDq8ikWAM";
}

function elevenlabsAccess(
  elevenKey: string | undefined,
  apiPath: string,
): { headers: HeadersInit; url: string } {
  // API key
  elevenKey = (elevenKey || process.env.ELEVENLABS_API_KEY || "").trim();
  if (!elevenKey) throw new Error("Missing ElevenLabs API key.");

  // API host
  const host = "https://api.elevenlabs.io";

  return {
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": elevenKey,
    },
    url: host + apiPath,
  };
}

export namespace ElevenlabsWire {
  export interface TTSRequest {
    text: string;
    model_id?: "eleven_monolingual_v1" | string;
    voice_settings?: {
      stability: number;
      similarity_boost: number;
    };
  }
}

function createEmptyReadableStream<T = Uint8Array>(): ReadableStream<T> {
  return new ReadableStream({
    start: (controller) => controller.close(),
  });
}

/**
 * Calls ElevenLabs and returns an `audio/mpeg` stream. The upstream body is passed
 * through untouched for the lowest possible latency — this is the canonical response
 * shape every provider in this folder must produce.
 */
export async function elevenLabsSpeech(
  input: SpeechInputSchema,
): Promise<Response> {
  const { apiKey, text, voiceId, nonEnglish, streaming, streamOptimization } =
    input;

  const path =
    `/v1/text-to-speech/${elevenlabsVoiceId(voiceId)}` +
    (streaming
      ? `/stream?optimize_streaming_latency=${streamOptimization || 1}`
      : "");
  const { headers, url } = elevenlabsAccess(apiKey, path);
  const body: ElevenlabsWire.TTSRequest = {
    text: text,
    ...(nonEnglish && { model_id: "eleven_multilingual_v1" }),
  };

  // elevenlabs POST
  const upstreamResponse: Response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!upstreamResponse.ok) {
    const errorPayload: object | null = await upstreamResponse
      .json()
      .catch(() => null);
    throw new Error(
      `${upstreamResponse.statusText} (${upstreamResponse.status})${errorPayload ? " · " + JSON.stringify(errorPayload) : ""}`,
    );
  }

  // stream the data to the client (pass-through for speed)
  const audioReadableStream =
    upstreamResponse.body || createEmptyReadableStream();
  return new Response(audioReadableStream, {
    status: 200,
    headers: { "Content-Type": "audio/mpeg" },
  });
}
