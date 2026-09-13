# RecordMint

**Record in the browser. Share a link. Own the file.**

RecordMint is free, self-hosted, open-source video messaging. You open a web page, press record, and your screen, camera and microphone are captured in the browser. When you stop, there is a share link ready to paste — and the video is sitting in a bucket you own, on a server you run.

Nothing to install. No vendor account. No storage you do not control.

> **Pre-implementation.** This repository currently contains the product specification, architecture and structure. **There is no working release yet.** Every capability below is planned unless explicitly marked implemented.

## The idea

Async video replaced a category of meetings. The tools that made that happen are subscriptions that hold the recordings — so the library is somebody else's, the links stop working when the plan does, and there is no way to put video messaging inside your own product.

RecordMint is the permissively licensed, browser-only, self-hosted answer. **MIT**, so a company can run it inside a closed product without opening its own source.

## The boundary

> **The browser records. The server stores, serves and transcribes. Nothing else runs on your machine.**

Capture uses `getDisplayMedia` and `MediaRecorder` — web platform APIs, no native code. That means no per-OS build, no code signing, no notarisation, no auto-updater, and nothing for a viewer or a recorder to install.

It also means one honest limitation: **capture targets Chrome and Edge.** Playback is universal. The support table is a target rather than a tested result until a person has clicked through every browser and capture source — see [browser support](docs/SPEC.md#16--browser-support).

## Why there is no transcoding step

Current Chromium-based browsers can record **MP4 (H.264 + AAC) natively**. The file that lands in your bucket already plays everywhere, so RecordMint serves it directly.

No encoding farm, no job backlog, no "your video is processing" wall. `ffmpeg` is present as an optimisation — poster frames and optional recompression — and never stands between you and a share link.

## What comes wired

**Essential** — screen, window and tab capture · camera and microphone · upload *while* recording, so the link exists before the file finishes · a share link per recording · a hosted player page that works for a logged-out viewer · your recording library · workspaces, members and roles · email and password auth · S3-compatible storage with MinIO in the compose file · `docker compose up` and it runs.

**Useful** — timestamped comments · transcripts generated on your own host · captions and in-recording search · link visibility controls, passwords and expiry · view counts · download the original · delete a recording and every object behind it · retention policy.

## Transcripts stay on your server

Transcription runs on the host with [whisper.cpp](https://github.com/ggml-org/whisper.cpp) or [faster-whisper](https://github.com/SYSTRAN/faster-whisper). There is no third-party API and no key to configure, so no audio leaves the machine you run this on. It can also be turned off entirely.

## Not in v1

Native desktop app · multi-track editing · a hosted tier · a browser extension · live streaming · meeting-recorder bots · AI summaries · SSO/SAML · mobile capture.

The browser extension is a later convenience, not a missing piece — the web app records without it.

## Development

The monorepo skeleton and local infrastructure exist; recording, upload and
playback do not yet. There is nothing to demo.

```
cp .env.example .env   # for a real deployment — docker compose up below needs no setup
pnpm install
pnpm run build
pnpm run lint
pnpm run typecheck
pnpm run test
```

`docker compose -f infra/compose.yaml up` starts Postgres, MinIO (with its
bucket already created) and both application processes, using throwaway
local-development credentials baked into `infra/compose.yaml` — not the
values in `.env.example`, which are for a real deployment. The web app is
then reachable at `http://localhost:3000`, and `/api/health` reports
database, storage and transcription status.

`pnpm run e2e` runs the Playwright suite, which drives a browser with a
fake capture device (`--use-fake-device-for-media-stream`) so recording
behaviour can be tested in CI without a human at a screen picker. It
currently proves the harness itself works; specs that exercise an actual
record → share → play flow land with the cards that build those features.

## Documentation

- [Product specification](docs/SPEC.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Folder structure](docs/STRUCTURE.md)
- [Roadmap](docs/ROADMAP.md)
- [Release checklist](docs/RELEASE_CHECKLIST.md)
- [Third-party licence audit](docs/THIRD_PARTY_LICENSES.md)

## Licence

MIT. See [LICENSE](LICENSE). Every dependency that ships in the compiled code is audited to the same standard — see the [third-party licence audit](docs/THIRD_PARTY_LICENSES.md) and [`THIRD_PARTY_NOTICES`](THIRD_PARTY_NOTICES).
