# Basket Random 2

A compact, independent pixel-art ragdoll basketball recreation for Android and the browser. It boots to a main menu with a persistent, editable nickname. Normal modes are **2v2**: each side has a front and back player, and one button controls both teammates at once. A separate **1V1** button offers one player per side against a bot, a friend on the same device, or online.

- **2 Player** — two people on one phone, 2v2, with independent jump and dunk buttons on each side.
- **Online** — a real matchmaking queue, shared seeded matches, rematches, and disconnect handling. 1v1 and 2v2 queues are kept separate.
- **Vs Bot** — Noob, Casual, Pro, and LeBron James, with different reaction times, shot timing, blocking, and dunk decisions.
- **1V1** — the same rules with one player per team: vs bot, friendly local, or online.

First to **5 points** wins. Each basket changes the court, ball, player proportions, jerseys, skin tones, hair, and hoop layout. Rainbow balls score two. Jumping uses a fixed-step, constraint-based ragdoll; grab the ball, hold jump to grip/charge, and release to throw with the swing's momentum. **Dunk is the added mechanic:** it launches a ball-carrying player toward the rim, has a cooldown, and is deliberately missable. Without the ball it is a blocking lunge.

## Scope and rights

This is a new implementation of the game's general mechanics and pixel-art direction, **not a pixel-identical port**. The repository contained no original source, licensed asset pack, or physics reference implementation. Artwork is drawn in code; no original game assets, fonts, audio, or code were copied. Physics and presentation are tuned to reproduce the original one-button ragdoll feel. Basket Random and its characters belong to their respective rights holders; this project is not affiliated with them. The MIT license covers only this repository's original implementation.

## Run locally

Requires Node.js 22 or newer.

```sh
npm ci
npm run dev
```

Open `http://localhost:8080`. The development server serves source files and the matchmaking endpoint on the same port. For the optimized build:

```sh
npm run build
npm start
```

The browser uses its own host for online play when the server field is empty. Two browser tabs can queue against each other. There are no accounts, ads, analytics, downloaded assets, or client-side runtime dependencies.

### Controls

| Action | Gold side | Red side in local mode |
|---|---|---|
| Jump / hold / release to shoot | `W` or `Space` | `↑` |
| Dunk / blocking lunge | `S` | `↓` |
| Pause | `Esc` or `P` | `Esc` or `P` |

In bot and online modes, `W`, `↑`, or `Space` all control your assigned side; `S` or `↓` dunks. On touch screens, use the four local-mode buttons or the two buttons on your assigned side. Multi-touch is supported. In 2v2, one press moves both teammates. The possession meter expires automatically. Landscape is enforced in the APK.

## Online hosting

**No public match server is deployed by checking out this repository.** Local and bot modes work immediately; online needs one reachable server shared by both players.

### Render

The included `render.yaml` is a Render Blueprint. Create a Blueprint from this repository, deploy `basket-random-match`, and use the resulting **HTTPS URL** as the server address in the game. Render provides TLS and supports WebSockets. Its free instance can sleep, so the first connection may take longer.

### Docker / your own server

```sh
docker compose up --build -d
```

This exposes port 8080. Put an HTTPS reverse proxy such as Caddy or nginx in front of it, including WebSocket upgrade headers, and forward `/health` for health checks. Point both phones at that HTTPS address using **SERVER** in the main menu. The Android app rejects insecure remote `ws://`/`http://` endpoints. `HOST` defaults to `0.0.0.0`; `PORT` defaults to `8080`.

The server pairs queued sockets by team size, assigns opposite sides and a shared seed, and broadcasts both input masks at 20 Hz. Clients run the same integer fixed-point simulation at 60 Hz, three steps per network frame. Final scores must agree before a rematch is offered. This is a casual input-relay design, **not an anti-cheat-authoritative physics server**. Disconnects end the match; there is no hidden bot substitution or automatic reconnection.

## Android APK

The `Test and build Android APK` GitHub workflow runs engine/server tests, browser and multi-touch smoke tests, then builds and verifies an APK. Download **BasketRandom-APK** from the workflow run's artifacts.

- Minimum: Android 8.0 / API 26. Target/compile SDK: 35.
- Landscape, immersive fullscreen, screen kept awake during the activity, lifecycle pause handling.
- Uses the installed **Android System WebView**, rather than bundling a browser engine. This is the main APK-size tradeoff; a disabled or missing System WebView must be enabled/updated before play.
- Without signing secrets, the artifact is **debug-signed with an ephemeral CI key**: installable for testing, not suitable as a store release or stable update signing identity.
- For a release-signed APK, configure repository Actions secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD`. Never commit the keystore or passwords.

Local Android build with JDK 17 and SDK platform/build-tools 35 installed:

```sh
npm ci
npm run build
ANDROID_HOME=/path/to/android/sdk bash android/build.sh
```

Output: `build/apk/BasketRandom-debug.apk` or `BasketRandom-release.apk`. The script runs `apksigner verify`, checks that the dex/assets are present, and rejects APKs larger than 256 KiB. CI also checks that `resources.arsc` is stored uncompressed and that the APK is aligned and launchable.

The shell loads bundled assets from a local `https://appassets.androidplatform.net` origin instead of `file://`, keeps file-system access disabled, and handles WebView renderer loss. If startup fails, it shows a native diagnostic screen instead of silently closing. A Java crash is saved and shown on the next launch; reopen once more to retry. Because CI debug keys are ephemeral, uninstall an older CI debug build before installing a newer one if Android reports a signature conflict.

## Size and performance

The renderer uses a fixed **480 × 270** canvas, nearest-neighbor scaling, cached court backgrounds, and no image/font downloads. Physics runs at a fixed 60 Hz with bounded catch-up; rendering interpolates independently. Audio is synthesized after a user gesture. The production web payload is roughly **58 KB raw / 22 KB gzip**; `build.mjs` enforces a 160 KB raw ceiling. The APK has a 256 KiB CI ceiling. Actual APK size is printed in the workflow summary.

These are size and implementation budgets, not a claim of measured 60 FPS on every phone. WebView/device performance varies.

## Tests

```sh
npm test
npm run build
CHROME_PATH=/path/to/chrome npm run test:browser
```

Tests cover deterministic replays, scoring, rainbow points, match completion, dunk carry/release/cooldown and misses, ragdoll bounds, all bots in 1v1 and 2v2, one-button team control, per-round appearance reshuffling, nickname sanitization, static-file safety, real WebSocket queue/input/rematch/disconnect behavior, team-size queue separation, result disagreement, browser persistence, pause, multi-touch, 1v1 menu flows, two-page online play, and connection-loss UI.

## Layout

- `web/src/` — fixed-point math, ragdoll/ball physics, rules, bots, renderer, UI, audio, network client.
- `server/` — static serving, health endpoint, queue and match relay.
- `android/` — dependency-free Java WebView shell and direct SDK build script.
- `.github/workflows/android.yml` — verification and APK artifact build.
- `Dockerfile`, `compose.yaml`, `render.yaml` — server deployment.
