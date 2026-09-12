# Architecture

## System boundary

```
  BROWSER                             SERVER                        STORAGE
  ┌──────────────────────┐            ┌────────────────────┐        ┌───────────┐
  │ getDisplayMedia      │            │ web app            │        │    S3     │
  │ getUserMedia         │──create──▶ │  sessions, library │        │ compatible│
  │ MediaRecorder        │            │  player page       │        │  MinIO    │
  │   ↓ timeslice chunks │◀─presign── │  presign broker    │───────▶│  locally  │
  └───────┬──────────────┘            └─────────┬──────────┘        └────┬──────┘
          │                                     │                       │
          │  PUT part N ─────────────────────────────────────────────▶  │
          │  (direct to storage, never through the app server)          │
          │                                     │                       │
                                        ┌───────▼──────────┐            │
                                        │ worker           │◀───────────┘
                                        │  transcript      │
                                        │  thumbnail       │
                                        │  (ffmpeg, opt.)  │
                                        └───────┬──────────┘
                                                │
                                        ┌───────▼──────────┐
                                        │ Postgres         │
                                        │  + job queue     │
                                        └──────────────────┘
```

Four processes and two stores. No Redis, no message broker, no transcoding tier. A self-hoster reads one compose file and understands the entire system.

## The browser is the client

Capture is `getDisplayMedia` and `getUserMedia`, encoding is `MediaRecorder`, and both are web platform APIs. There is no native code anywhere in the product.

What that removes: a per-OS capture implementation, a build and release pipeline per platform, code signing, notarisation, an auto-updater, and an app-store relationship. What it costs is stated openly in the [specification](SPEC.md#16--browser-support) — capture targets Chrome and Edge, and that table stays a target until a person has verified it.

## Video bytes never pass through the app server

The browser requests a presigned URL and uploads directly to object storage. The application signs URLs, records metadata and serves HTML; it never proxies media.

This is the single decision that makes a self-hosted video product affordable to run. An app server that proxies uploads and downloads becomes the bottleneck at the third concurrent user and the largest line on the bandwidth bill.

## Upload happens during recording

`MediaRecorder` runs with a timeslice. Each emitted chunk is appended to a buffer, and whenever the buffer exceeds the multipart minimum part size, that part is uploaded to its own presigned URL. On stop, the tail is flushed and the multipart upload is completed.

The effect is that a long recording is already almost entirely uploaded by the time the user stops, so **the share link is created when recording starts, not when it ends.** The player page shows an explicit "still recording / finishing up" state until the recording is marked ready.

A second effect matters more than it looks: a recording interrupted by a closed tab or a dropped connection has most of its data already in storage, which turns recovery from impossible into a feature that has to be deliberately built.

## Why there is no transcoding step

Current Chromium-based browsers record MP4 (H.264 + AAC) natively, so the uploaded object already plays everywhere. It is served directly.

Where MP4 is unavailable, the recorder falls back to WebM (VP9 or VP8 + Opus), which also plays in every supported browser. Neither path transcodes before a link works.

**ffmpeg is retained as an optimisation**, invoked as a binary on the worker: poster-frame extraction, optional recompression for long-term storage, and a `faststart` remux if seeking on fragmented MP4 turns out to need it. None of that blocks a share link.

## The bucket is never public

Playback uses a short-lived presigned read URL that the player page mints only after resolving the link and applying its visibility rules.

Access control is the application, not URL obscurity. Object URLs are unguessable and expire; that is defence in depth, not the mechanism.

## The worker is never on the critical path

Transcripts, thumbnails, retention sweeps and any optional remux run in a separate process against a PostgreSQL-backed job queue.

If the worker is down, recordings still record, upload, share and play — they simply have no transcript or poster yet. That property is load-bearing, and it is why these jobs live in their own process rather than inside a request handler.

## Why the queue is PostgreSQL

A self-hosted product is judged by how many services its operator has to run. RecordMint needs a durable queue for two kinds of background work, and a dedicated queue server for that is a tax on every operator forever.

Running the queue in the database that is already required removes a service from the compose file, a port from the firewall, and a failure mode from the runbook.

## Boundaries

- **Capture and chunked upload are framework-free.** `packages/recorder` imports no UI framework, so it can be tested in a browser harness and changed independently when browser behaviour shifts.
- **Only `packages/storage` knows which object store is behind it.** MinIO locally and any bucket in production are the same code path.
- **The object key layout is defined in exactly one file**, so deletion and retention cannot leave orphans.
- **Authentication lives in the application**, not in a third-party identity provider — a self-hosted product that needs a vendor to log in is not self-hosted.
- **Migrations are committed SQL, reviewed as code.** A migration is the one thing an operator cannot undo by redeploying.
- **Secrets stay outside the repository.**

## The player page is server-rendered

`/v/<publicId>` renders on the server so it can resolve visibility before minting anything, emit link-preview metadata so a pasted link unfurls where people paste it, and hand the client a read URL that was never guessable.

A share link that does not unfurl looks broken, which makes this a product requirement wearing a rendering decision's clothes.

## Accepted costs

- **Capture is Chrome and Edge.** This is the trade the whole architecture is built on. It is disclosed everywhere it is relevant and detected before a user records something they would lose.
- **Fragmented MP4 seeking is unproven** across browsers. If it disappoints, a remux job fixes it after the link already exists.
- **Storage is the running cost.** Direct upload solves bandwidth through the app, not the size of the bucket. Retention and optional recompression are the answer, and they are in v1.
