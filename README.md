# Generative-X

Generative-X (twitter) augments your twitter timeline with AI using image filters, text-to-speech, auto replies, and dynamic UI components that pop in to give more context to tweets!

Built during the SPCxOpenAI Hackathon

## Demo Video 
[Watch the video on X](https://x.com/ultrasoundchad/status/1764464890960638099?s=20)

<img src="public/demo.png" height="750">


## Getting Started
Under the hood, there's a nextjs application and a chrome extension used to pull tweets off of your feed and inject the nextjs app as an iframe into X

Let's start by running the nextjs app wwhich will use a sample twitter feed
1. Add your OPENAI_API_KEY and ELEVENLABS_API_KEY (used for tts)  
`cp .env.local.example .env.local`

   Text-to-speech runs through a single provider-agnostic endpoint and supports
   both **ElevenLabs** (default) and **[60db](https://60db.ai)**. See
   [Text-to-Speech Providers](#text-to-speech-providers) below to switch.
2. Run the application   
`npm run dev`
3. Try out the image filters (these will be snappy as they're cached)
4. Try out the dynamic UI switch

## Chrome Extension
You'll need to load the extension into your browser to use it

### Installation

1. Download this repo - the extension is in the `chrome_extensions/src` folder (where this file is)
2. Open Chrome > Go to Extensions
3. Enable Developer mode (switch top-right)
4. Click on "Load unpacked" and select the `src` folder at the same level of this file

### Usage

1. Browse to https://twitter.com
2. Click on the extension icon in the toolbar (heart-shaped for now)
3. Select "X Timeline" from the menu
	 ![Extension Menu](chrome_extension/docs/usage-enable.png)


## Dynamic User Interfaces
There are currently 5 dynamic components that can be rendered based on tweet context. We use GPT3.5 with function calling to determine which component to render. 

Dynamic User Interfaces (DUIs) can be found in `/app/components/dui`

1. `weather.tsx`  
Renders live weather data if location and "weather" is mentioned in a tweet

2. `stocks.tsx`  
Renders live stock data if a ticker symbol i.e $TSLA is mentioned in a tweet

3. `poltics.tsx`
Renders a political scale with refeference links (generated from perplexity sonar) if a tweet is poltical

4. `clothing.tsx`  
This component will try to match the clothing items in a tweet image to items in the Nordstrom Rack catalog. For the demo it will only render for tweets under the [@TechBroDrip](https://twitter.com/TechBroDrip0)

5. `Reply.tsx`  
Renders a few suggested replies with tts in a reply component. This is the default component is there are not other components rendered.

## Text-to-Speech Providers
The 🔊 speaker icons on tweets and suggested replies use text-to-speech. The app
ships with two interchangeable TTS backends behind one endpoint:

- **ElevenLabs** — the original provider (default)
- **[60db](https://60db.ai)** — multilingual TTS, added alongside ElevenLabs

Both are accessed through the provider-agnostic edge route `app/api/speech`, and
both stream `audio/mpeg`, so the rest of the app (the streaming player, the UI,
the per-filter voice plumbing) behaves identically no matter which one is active.

### Choosing a provider
Set the `TTS_PROVIDER` env var in `.env.local`:

```bash
# ElevenLabs (default — nothing to change)
TTS_PROVIDER=elevenlabs
ELEVENLABS_API_KEY=your-elevenlabs-key

# 60db
TTS_PROVIDER=60db
SIXTYDB_API_KEY=your-60db-key
SIXTYDB_DEFAULT_VOICE_ID=your-60db-voice-uuid   # optional; list yours at GET https://api.60db.ai/myvoices
```

A request can also override the global default per call by passing a `provider`
field (`"elevenlabs"` or `"60db"`) to `/api/speech`. Resolution order is:
**request `provider` → `TTS_PROVIDER` env → `elevenlabs`**. An unknown value
falls back to the default rather than failing.

### How it's wired
| File | Role |
|------|------|
| `lib/tts/schema.ts` | Shared request schema + `resolveProvider()` |
| `lib/tts/elevenlabs.ts` | ElevenLabs backend (`xi-api-key`, raw `audio/mpeg` passthrough) |
| `lib/tts/sixtydb.ts` | 60db backend — decodes 60db's base64 JSON/NDJSON into an `audio/mpeg` stream |
| `app/api/speech/route.ts` | Edge route that picks a provider and dispatches |
| `lib/tts.client.ts` | Browser helper `EXPERIMENTAL_speakTextStream(text, voiceId, provider?)` + streaming player |

### Notes on 60db
- Auth is `Authorization: Bearer <key>` (ElevenLabs uses `xi-api-key`).
- 60db returns base64 audio inside JSON (`/tts-synthesize`) or NDJSON chunks
  (`/tts-stream`); the route decodes both into raw mp3 so playback is identical.
- 60db uses a single configured default voice. The per-filter voice IDs in
  `lib/filters.ts` are ElevenLabs-specific and are intentionally ignored when
  60db is active. To theme 60db voices per filter, map filter → 60db voice UUID.

## Adding New Components
This application gets better with more components. If you have ideas for components that could augment the X experience, open a PR. 

Docs on adding new components flow coming soon.

## TODO
- [ ] move function calling router out of `actions/tsx` and into it's own api (there is currently an issue where server action calls are not parallelized in production see https://github.com/vercel/next.js/discussions/50743)
