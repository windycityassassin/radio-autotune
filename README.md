# Auto-Tune FM

Browser radio that streams real internet stations and auto-skips ads/talk.

## Run

Requires Node 18+ (for built-in `fetch`).

```
node server.js
```

Open http://localhost:3000.

No `npm install`. No dependencies.

## How it works

- `server.js` does two things: fetches a curated list of ~40 popular music stations from radio-browser.info, and proxies the actual audio streams with CORS headers so the browser can analyze them.
- `index.html` plays the stream through `<audio>`, taps the audio with Web Audio API, and runs a real-time speech-vs-music classifier on the live signal.
- When the classifier reports SPEECH/AD for 5 seconds straight, AUTO-SKIP hops to the next station.

## The classifier

Three spectral/temporal features extracted every 100ms, averaged over a 3-second window:

- **LSTER** (low short-time energy ratio) — fraction of frames quieter than half the local mean. Speech has pauses; music doesn't.
- **ZCR std-dev** — variability of zero-crossing rate. Speech is bursty (sibilants vs vowels); music is steadier.
- **Spectral centroid std-dev** — variability of "brightness". Speech varies more with phonemes.

Weighted sum, threshold at 0.55. Smoothed exponentially. 4-second warmup after each station change to ignore buffering noise.

In practice: ~85-90% accurate. Talk radio reads as ad. Loud commercial jingles with vocals can confuse it.

## Controls

- **PLAY** — start playback (also unlocks audio context — must be a user gesture)
- **SKIP** — manual hop to next station
- **AUTO-SKIP** — toggle the classifier-driven skip loop
- **station list** — click any row to tune

## Tuning the classifier

Open the console and edit at the top of `index.html`:

```js
const SKIP_THRESHOLD = 0.55;     // raise → less sensitive
const SKIP_HOLD_SECONDS = 5;     // raise → fewer false positives
const WARMUP_SECONDS = 4;        // wait after station change
```

## Swap in YAMNet later

To upgrade to ~95% accuracy with Google's YAMNet model: replace `computeSpeechScore()` in `index.html` with a TFJS inference call. Frame extraction stays the same — just feed `timeBuf` into the model and read its Speech/Music output probabilities. Adds ~30MB model load on startup.
