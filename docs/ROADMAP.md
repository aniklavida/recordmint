# Roadmap to v1.0

One useful, self-hostable release, then maintenance driven by real issues and demonstrated demand.

## 0 · Lock

Positioning, scope, the capability list, the folder structure and the dependency set are agreed and recorded.

**Done:** no unresolved product contradiction remains.

## 1 · Capture, proven by hand

The browser capability matrix is produced by a human clicking through it: screen, window and tab capture, camera, microphone, and tab audio, per browser and per capture source. The unsupported-browser probe is written and refuses before a user can record.

**Done:** the matrix is documented, including everywhere capture does *not* work.

## 2 · Record to a link

`packages/recorder` end to end — capture, `MediaRecorder`, chunk buffering, presigned multipart upload during recording, completion on stop. A minimal page that records and returns a URL.

**Done:** a ten-minute recording finishes uploading within five seconds of stop, and the resulting object plays in a browser.

## 3 · The player page

Server-rendered `/v/<publicId>`, short-lived presigned reads, Plyr, link-preview metadata. Seeking is tested forwards and backwards in every supported browser, and a remux job is added only if that testing demands it.

**Done:** a logged-out viewer on a different machine opens the link and watches it, and the link unfurls where it is pasted.

## 4 · Accounts, workspaces and the library

Email and password auth, sessions, workspaces, members, roles, and the recording library. Link visibility: private, unlisted, password, expiring.

**Done:** visibility rules are enforced against a logged-out viewer, and the bucket refuses unsigned public reads.

## 5 · The worker

The job queue, transcripts on the host, poster frames, retention sweeps, and deletion that removes every object behind a recording.

**Done:** a transcript renders as captions and is searchable; deleting a recording leaves nothing in the bucket; stopping the worker breaks nothing else.

## 6 · Comments and the rest of the surface

Timestamped comments and timeline markers, guest commenting, reactions, view counts, download, trim.

**Done:** a comment seeks the player when clicked, and guest commenting is off unless deliberately enabled. Start/end trim is a background stream-copy remux; the derived file is verified before playback switches, and the original is never deleted or overwritten.

## 7 · Self-hosting, documentation and release

One compose file, idempotent migrations, a health endpoint, an honest browser-support page, installation documentation, a demo, and release automation.

**Done:** a first-time operator records and shares a video without reading the documentation.

## After v1.0

Maintain compatibility. Fix reproducible bugs and security issues. Then, only on repeated user evidence: a browser extension for one-click capture, adaptive playback once there is a reason to produce multiple renditions, and broader browser capture as the platform allows.

**Not planned at any point:** a native desktop application, a hosted tier, or a capability placed behind a licence tier.
