# RecordMint — product specification

**Status:** Draft. Nothing in this document is implemented yet.

## 1 · What it is

Free, self-hosted, open-source video messaging. You open a web page, press record, and your screen, camera and microphone are captured in the browser. The moment you stop there is a share link ready to paste, and the video is in a bucket you own on a server you run.

No desktop install. No vendor account. No storage you do not control.

## 2 · The boundary

> **The browser records. The server stores, serves and transcribes. Nothing else runs on the user's machine.**

This single line decides the whole design. `getDisplayMedia` and `MediaRecorder` are web platform APIs that give screen, window, tab, camera and microphone with no native code — no per-OS capture path, no code signing, no notarisation, no auto-updater, no app store.

The cost is real and stated in §16: capture targets Chrome and Edge. The benefit is that there is nothing to install, nothing to sign, and one codebase instead of one per operating system.

## 3 · Who it is for

- **Engineering and product teams** who already send each other screen recordings and would rather not keep them in a third-party service.
- **Organisations with a data-residency or procurement constraint** that rules out a hosted vendor.
- **Product companies embedding video messaging in their own product** — which is what the MIT licence is for.
- **Self-hosters** who run their own stack and want one more service that behaves.

## 4 · The problem

Async video replaced a category of meetings, and the recordings ended up inside subscriptions. Three things follow:

1. **Recordings are tied to a plan.** They stop being reachable when it lapses.
2. **The library belongs to someone else.** There is no bucket to point at, and no export that keeps the links working.
3. **Video messaging cannot be put inside your own product** without either building it or buying it.

RecordMint answers all three by being permissively licensed, browser-only and self-hosted: MIT, so it can run inside a closed product without opening its source; browser-only, so there is nothing to install or sign; self-hosted, so the files are yours.

## 5 · What ships in v1

| Ships | Does not ship |
|---|---|
| Browser capture — screen, window, tab, camera, mic | Native desktop app |
| Upload while recording | Multi-track editing |
| Share link the moment you stop | Hosted tier |
| Hosted player page | Browser extension |
| Timestamped comments | Live streaming, meeting-recorder bot |
| On-host transcripts and captions | AI summaries and chapters |
| Workspaces, members, email/password auth | SSO / SAML |
| Self-hosted deploy — one compose file | Mobile capture |

## 6 · Capabilities

### Essential

Screen, window and tab capture · microphone capture · camera capture composited as a picture-in-picture bubble · tab audio capture · start, pause, resume and stop with a countdown · **upload while recording**, so the link exists before the file finishes · a share link per recording · a hosted player page that works for a logged-out viewer · title, description and thumbnail · a library of your recordings · workspaces with members and roles · email and password auth with sessions · S3-compatible storage with MinIO in the compose file · `docker compose up` and the product runs.

### Useful

Timestamped comments · reactions on the player timeline · transcript generation on the host · captions rendered as WebVTT · transcript search within a recording · view counts and a per-recording view log · link visibility — private, unlisted, password · link expiry · download the original file · delete a recording and every object behind it · retention policy per workspace · a poster thumbnail extracted on the server · trim the start and end through a background stream-copy remux, which is the only editing v1 has.

### Not in v1

Native desktop app · multi-track editing, zoom effects, backgrounds · a hosted tier and billing · a browser extension · live streaming · meeting-recorder bot · AI summaries, chapters and action items · SSO/SAML · mobile capture.

The browser extension is a later convenience rather than a missing piece: it buys a one-click start from any tab, and the web app already records without it.

## 7 · Why there is no transcoding step

Current Chromium-based browsers can record **MP4 (H.264 + AAC) natively**, which means the file that lands in the bucket already plays everywhere.

> **Server-side transcoding is not on the v1 critical path.**

That removes the heaviest and most expensive component of a self-hosted video platform. There is no encoding farm, no job backlog, no "your video is processing" wall, and no CPU bill on the recording or share-link path. The object uploaded is the object served by default; optional worker-derived assets are separate objects and never block the share link.

**ffmpeg is still present, but demoted.** It extracts poster frames, optionally recompresses for long-term storage, can remux for faster seeking, and performs the post-link start/end trim as a stream copy. It is invoked as a binary on a background worker and never stands between a user and a share link. The original object remains untouched while the replacement is created and verified.

## 8 · Architecture

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

Four processes and two stores. No Redis, no message broker, no transcoding tier.

### The three decisions that define it

**1 · Video bytes never touch the app server.** The browser asks for a presigned URL and uploads straight to the bucket. The server signs, records metadata and serves HTML. This is the difference between a self-hosted video app that costs nothing to run and one that falls over on the third concurrent user.

**2 · Upload happens while recording, not after.** `MediaRecorder` runs with a timeslice; each chunk is buffered, and whenever the buffer passes the multipart minimum part size that part is uploaded to its presigned URL. On stop, the tail is flushed and the upload is completed. A ten-minute recording finishes uploading a second or two after the user stops, because nine minutes of it already went.

*A consequence worth stating plainly:* the share link is created when recording **starts**, not when it ends. The player page shows a clear "still recording / finishing up" state until the recording is ready. That is what makes the paste-immediately promise real rather than a race.

**3 · The bucket is never public.** Playback uses a short-lived presigned read URL, minted by the player page only after it has checked the link's visibility rules. Object URLs are not guessable, not permanent, and not the access-control boundary — the application is.

### Format strategy

Record MP4 (H.264 + AAC) where the browser reports support; fall back to WebM (VP9 or VP8 + Opus) where it does not. Whichever arrived is stored, its container and codecs are recorded, and it is served directly. **Neither path transcodes on the critical path** — both play in the browsers RecordMint supports. When an editor trims a recording, the worker creates a separate derived object with the encoded packets copied into a new container; playback uses it only after a full decode check succeeds, and the original remains the download source.

## 9 · Stack

| Concern | Choice | Why |
|---|---|---|
| Language | **TypeScript** end to end | The recorder must be TypeScript because it runs in the browser. A second server language buys nothing. |
| Web app | **Next.js**, App Router | A server-rendered player page so pasted links unfurl, plus route handlers for the app API. One deployable. |
| UI | **Tailwind + shadcn/ui** | Copy-in components, no runtime dependency inherited by users. |
| Player | **Plyr** | Small, accessible, keyboard-complete, built on the native `<video>` element. |
| Adaptive playback | **hls.js** — *planned, not v1* | It earns its place only once there are multiple renditions, which requires transcoding, which v1 does not do. |
| Database | **PostgreSQL** | Boring on purpose. |
| Migrations | **Drizzle** | TypeScript-native; migrations are plain SQL you can read. |
| Job queue | **pg-boss**, on the same PostgreSQL | Removes an entire service from a self-hoster's compose file. A separate queue server for two background jobs is a tax on the operator. |
| Object storage | **S3-compatible** | MinIO in compose, any bucket in production. |
| Transcription | **whisper.cpp**, or **faster-whisper** where a GPU exists | Runs on the host. No API, no key. |
| Media tooling | **ffmpeg**, invoked as a binary | Thumbnails, optional recompression, optional remux. |
| Auth | Own session table, httpOnly cookie, Argon2id | See §12. |
| Tests | **Vitest** and **Playwright** | Playwright can drive a fake capture device, which is the only way to test a recorder in CI. |

## 10 · Structure

Full detail in [STRUCTURE.md](STRUCTURE.md). The spine:

```
recordmint/
├── apps/
│   ├── web/          Next.js — UI, app API, player page
│   └── worker/       transcripts, thumbnails, retention
├── packages/
│   ├── recorder/     capture + chunked upload — framework-free
│   ├── db/           schema, migrations, queries
│   ├── storage/      S3 client, presigning, multipart
│   └── shared/       types, IDs, validation, errors
├── infra/            compose.yaml · minio/ · postgres/
└── docs/
```

**`packages/recorder` is deliberately framework-free.** Capture, chunking, part upload and recovery are plain TypeScript against the web platform, with no React in them — testable in a browser harness, reusable later, and isolated because it is the part most likely to need changing when a browser changes.

## 11 · Storage and playback

### Object layout

```
recordings/<recordingId>/original.<ext>     the uploaded file
recordings/<recordingId>/poster.jpg         extracted frame
recordings/<recordingId>/transcript.vtt     WebVTT
```

One prefix per recording, so deletion is one prefix delete and retention is one list-and-delete.

### Playback path

1. A viewer opens `/v/<publicId>`.
2. The server resolves the link, applies the visibility rules, and — only if they pass — mints a short-lived presigned read URL.
3. Plyr wraps a native `<video>` pointed at that URL, with the WebVTT track attached when a transcript exists.
4. Range requests are served by the storage layer.

**Presigned URLs live for six hours.** Long enough that nobody watching a long recording is cut off mid-way, short enough that a leaked URL expires on its own. A refresh endpoint re-mints for anyone still entitled.

### One thing that must be verified before it is claimed

`MediaRecorder` emits **fragmented** MP4, which is built for streaming and is not identical to a progressive file with its index at the front. Seeking behaviour on a plain `<video>` element across browsers is therefore **an open question, not a settled fact** — and it is the one place the no-transcoding design could need help.

If seeking proves poor, a single `ffmpeg -movflags +faststart` remux fixes it on the worker, after the share link already exists. **No claim about seeking will appear in this documentation until it has been tested in every supported browser.**

## 12 · Auth and permissions

Email and password, Argon2id hashing, a session row, and an httpOnly `SameSite=Lax` cookie. Authentication lives in the application, not in a third-party identity provider, because a self-hosted product that needs a vendor in order to log in is not self-hosted.

Browser local storage is never used for anything resembling a credential — it is readable by any cross-site scripting flaw.

| Role | Can |
|---|---|
| Owner | Everything, including deleting the workspace and changing retention |
| Member | Record, share, comment, delete their own recordings |
| Viewer | Watch and comment inside the workspace, not record |
| Anonymous | Only what a share link grants |

### Link visibility

| Level | Meaning |
|---|---|
| `private` | Workspace members only |
| `unlisted` | Anyone with the link. The default for a new recording |
| `password` | The link plus a shared password |
| `expiring` | Any of the above, plus a hard expiry timestamp |

`unlisted` is the default because the product's promise is *paste the link and it works*, and a default that breaks that promise gets quietly turned off by everyone. The setting is per-recording, has a per-workspace default, and appears in the share dialog rather than buried in settings.

## 13 · Comments

Timestamped against the playhead, threaded one level deep, written by a workspace member or — on a shared link — by a guest who supplies a display name. Guest commenting is per-recording and off by default, because a public link with open commenting is a spam target.

Comments render as markers on the player timeline; clicking one seeks to that moment.

**A recording's creator can get an email when someone else comments on it** — never for their own comment, and never more than one email per recording within a five-minute window, however many comments land in that window. On by default for the creator, togglable per user. The email carries the recording's title, the commenter's display name (or "a guest"), the comment's timestamp in the video, and a link to the player page — nothing that could act as a credential on its own.

## 14 · Transcripts

When a recording becomes ready, a transcript job is queued. The worker pulls the object, feeds the audio to whisper.cpp — or faster-whisper where a GPU is configured — and writes WebVTT alongside the video.

- **Model size is configuration, not code.** The default is a small model: fast enough on a laptop-class CPU, accurate enough to be useful.
- **Transcription can be disabled entirely.** A small self-hoster should not be forced to spend CPU on a feature they do not want, and every other capability keeps working without it.
- The output feeds captions in the player, search within a recording, and a copyable transcript pane.
- **Nothing leaves the host.** There is no API and no key, because the transcriber runs as a local process.

Failure is non-fatal. A recording without a transcript is a normal recording.

## 15 · Dependency policy

**Every dependency shipped here is inherited by every user.** Each one is licence-audited before it enters, in two classes audited differently.

| Class | Rule |
|---|---|
| Compiled into shipped code | **MIT / Apache / BSD only** |
| Run as a separate process | Copyleft acceptable — it never reaches user code |

| Dependency | Licence | Class | Status |
|---|---|---|---|
| Next.js | MIT | compiled | shipped |
| React / ReactDOM | MIT | compiled | shipped |
| Drizzle ORM | Apache-2.0 | compiled | shipped |
| pg-boss | MIT | compiled | shipped |
| `postgres` (client) | Unlicense | compiled | shipped |
| AWS SDK for JavaScript v3 | Apache-2.0 | compiled | shipped |
| nanoid | MIT | compiled | shipped |
| Plyr | — | compiled (planned) | **not yet a dependency of any workspace member** |
| hls.js | Apache-2.0 | compiled (planned) | **not yet a dependency of any workspace member** |
| Tailwind CSS | — | compiled (planned) | **not yet a dependency of any workspace member** |
| PostgreSQL (image) | PostgreSQL Licence | separate process | shipped, `infra/compose.yaml` |
| MinIO (image) | AGPL-3.0 | **separate process — copyleft never reaches user code** | shipped, `infra/compose.yaml` |
| whisper.cpp / faster-whisper | MIT | separate process | **planned — no worker code invokes either yet** |
| ffmpeg | LGPL/GPL depending on build | **invoked as a binary, never linked** | **planned — not installed by any Dockerfile yet** |

This table states the policy and the current shape of the dependency tree; it is not the audit itself. **The audited inventory — every compiled-class package including the transitive tree, every pinned container image, the licence, the class and the date each was verified — lives in [`THIRD_PARTY_LICENSES.md`](THIRD_PARTY_LICENSES.md) and is re-checked by CI on every push.**

**MinIO and ffmpeg are why the two-class rule exists.** Both are copyleft, both are fine, and both would be a licence problem if they were linked instead of run. The compose file starts MinIO as a service; the worker will shell out to ffmpeg once it is actually wired in. Neither is a library RecordMint imports.

**Browser capture itself needs no dependency.** `getDisplayMedia` and `MediaRecorder` are the platform.

**MIT is not a detail.** It is the commercial reason this project exists: an organisation can run RecordMint inside a closed product without opening its own source. No dependency compiled into shipped code may take that away, which is why the compiled class is MIT, Apache or BSD with no exceptions.

## 16 · Browser support

**This table is the v1 target, not a test result.** Nothing below has been verified by hand yet, and the table will be rewritten to match what a person actually clicked through before any of it is presented as support.

| Browser | Capture — planned | Playback — planned |
|---|---|---|
| Chrome | supported | supported |
| Edge | supported | supported |
| Firefox | partial; audio capture is expected to be the gap | supported |
| Safari | **not a v1 target** | supported |

**Playback is universal; capture is not.** That asymmetry is what makes the trade acceptable: the person recording is typically a colleague on a work machine, and the people watching are everyone.

Two commitments about this table:

- **It never widens on the strength of documentation.** A capability enters it after a human has tried it, per browser and per capture source — screen, window and tab behave differently, and tab and system audio differ again by operating system.
- **It records failure as carefully as success.** A table that quietly omits where capture does not work costs somebody a recording, which is the most expensive thing this product can do to a user.

Safari capture is not a v1 promise and will not be implied by any installation page or feature table. The recorder detects an unsupported browser and says so **before** the user records anything they are about to lose.

## 17 · Self-hosting

One `docker compose up` brings up the web app, the worker, PostgreSQL and MinIO. Configuration is environment variables with working defaults; the only values a first-run operator must supply are a secret and a public base URL.

- Migrations run on start and are idempotent.
- A health endpoint reports storage reachability, database reachability, and whether transcription is enabled.
- Storage is any S3-compatible endpoint. MinIO is the default because it needs no account, and nothing in the code knows which implementation it is talking to.
- **The first run must produce a working recording without reading the documentation.** That is the acceptance bar for the deployment story — not "it starts".

## 18 · Non-goals

Not a native desktop app · not a video editor · not a hosted service · not a livestreaming platform · not a meeting recorder · **not a product whose core capability sits behind a licence tier** — there are no tiers.

## 19 · v1 acceptance

Binary. A box is ticked only when the thing works from a clean checkout.

- [ ] `docker compose up` on a clean machine brings up every service with no manual steps.
- [ ] A first-time operator records and shares a video without reading the documentation.
- [ ] Screen, window and tab capture each produce a playable recording in Chrome and Edge.
- [ ] Camera and microphone capture work, alone and combined with screen capture.
- [ ] Tab-audio capture is verified by a human, and the working/not-working matrix is documented per capture source and browser.
- [ ] A ten-minute recording finishes uploading within five seconds of the user pressing stop.
- [ ] The share link resolves for a logged-out viewer, in a clean browser profile, on a different machine.
- [ ] The player seeks correctly forwards and backwards in every supported browser — or a remux step exists and is proven to fix it.
- [ ] A recording plays end to end with the app server stopped after the read URL was minted, proving bytes do not flow through it.
- [ ] The storage bucket rejects unsigned public reads.
- [ ] `private` links are refused to a logged-out viewer, `password` links without the password, and `expiring` links after expiry.
- [ ] A timestamped comment appears on the timeline and seeks when clicked.
- [ ] A transcript is generated on the host, renders as captions, and is searchable within the recording.
- [ ] Disabling transcription leaves every other capability working.
- [ ] Deleting a recording removes every object under its prefix, verified against the bucket.
- [ ] An unsupported browser is detected and refused **before** the user records anything.
- [ ] A recording interrupted by a closed tab or a lost network either recovers or fails visibly — it never silently produces an unplayable file.
- [ ] Every shipped dependency is listed with its licence and passes the class rule.
- [ ] Every README claim has working evidence or is labelled planned.

## 20 · Risks

- **Fragmented-MP4 seeking is the biggest open question.** The whole no-transcoding design rests on the browser's own file being good enough to serve directly. If seeking is poor across browsers a remux step returns — cheap, but it must be found by testing rather than by a user.
- **Browser capture limits are not fully mapped.** System and tab audio behave differently per platform and per capture source. That matrix has to be produced by a human clicking through it; assuming it is how a project ships something embarrassing.
- **Video is heavy, and storage is the running cost.** Direct-to-bucket upload solves bandwidth through the app; it does not solve the storage bill. Retention policy and optional recompression are the answer, and they ship in v1 rather than being promised.
- **A lost recording is worse than one that never started.** Someone will record fifteen minutes and close the tab. Chunked upload means most of it is already safe — that has to become deliberate recovery, not a lucky accident.
- **Scope creep toward a native app.** Every complaint about a browser limitation will point that way. The answer is no: the browser-only boundary is the reason this ships at all.
