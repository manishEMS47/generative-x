import { z } from "zod";

/**
 * Shared TTS request contract used by both the browser client (`lib/tts.client.ts`)
 * and the edge route (`app/api/speech/route.ts`). Keeping it in one place is what
 * lets a single payload shape drive multiple providers consistently.
 */

export const TTS_PROVIDERS = ["elevenlabs", "60db"] as const;
export type TTSProvider = (typeof TTS_PROVIDERS)[number];

export const DEFAULT_TTS_PROVIDER: TTSProvider = "elevenlabs";

export const speechInputSchema = z.object({
  // optional per-call override; falls back to the TTS_PROVIDER env var, then the default
  provider: z.enum(TTS_PROVIDERS).optional(),
  // optional per-call API key override; otherwise the provider reads its own env var
  apiKey: z.string().optional(),
  text: z.string(),
  voiceId: z.string().optional(),
  nonEnglish: z.boolean().optional().default(false),
  streaming: z.boolean().optional(),
  streamOptimization: z.number().optional(),
});

export type SpeechInputSchema = z.infer<typeof speechInputSchema>;

/**
 * Resolves the active provider: explicit request value wins, then the TTS_PROVIDER
 * env var, then the hardcoded default. Unknown values degrade to the default rather
 * than throwing, so a typo in env config never takes speech offline.
 */
export function resolveProvider(requested?: string): TTSProvider {
  const candidate = (
    requested ||
    process.env.TTS_PROVIDER?.trim() ||
    DEFAULT_TTS_PROVIDER
  ).toLowerCase();
  return (TTS_PROVIDERS as readonly string[]).includes(candidate)
    ? (candidate as TTSProvider)
    : DEFAULT_TTS_PROVIDER;
}
