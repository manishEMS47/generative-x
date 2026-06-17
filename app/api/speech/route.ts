/* Provider-neutral text-to-speech endpoint.
 *
 * Accepts the shared SpeechInputSchema payload, resolves which backend to use
 * (request override -> TTS_PROVIDER env -> default), and dispatches to the matching
 * provider. Every provider returns an `audio/mpeg` stream, so the browser side is
 * identical regardless of which service produced the audio.
 */
import { NextRequest } from "next/server";
import { speechInputSchema, resolveProvider } from "@/lib/tts/schema";
import { elevenLabsSpeech } from "@/lib/tts/elevenlabs";
import { sixtyDbSpeech } from "@/lib/tts/sixtydb";

async function speechHandler(req: NextRequest) {
  try {
    const input = speechInputSchema.parse(await req.json());
    const provider = resolveProvider(input.provider);

    const response =
      provider === "60db"
        ? await sixtyDbSpeech(input)
        : await elevenLabsSpeech(input);

    return response;
  } catch (error: any) {
    const fetchOrVendorError =
      (error?.message || error?.error || "unknown error") +
      (error?.cause ? " · " + error.cause : "");
    console.log(`api/speech: fetch issue: ${fetchOrVendorError}`);
    return new Response(`[Issue] tts: ${fetchOrVendorError}`, {
      status: 500,
    });
  }
}

export const runtime = "edge";
export { speechHandler as POST };
