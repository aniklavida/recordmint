# Security policy

## Supported versions

RecordMint has no public release yet, so no version is supported.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability, a leaked credential, or anything containing private data. GitHub private vulnerability reporting must be enabled before v1.0.

Include the affected commit, reproduction steps, impact and sanitized evidence. **Never include a real token, connection string, key or presigned URL** — a presigned URL is itself a credential.

## Security model

RecordMint holds recordings of people's screens. Two properties carry most of the weight:

- **The storage bucket is never public.** Playback uses a short-lived presigned read URL that the player page mints only after resolving the share link and applying its visibility rules. Access control is the application; URL unguessability is defence in depth, not the mechanism.
- **Presigned URLs expire.** A leaked URL stops working on its own. Anyone still entitled gets a fresh one.

The rest:

- Authentication lives in the application, not a third-party identity provider — a self-hosted product that needs a vendor in order to log in is not self-hosted.
- Passwords are hashed with Argon2id. Sessions are server-side rows behind an httpOnly, `SameSite=Lax` cookie.
- **No credential is stored in browser local storage.** It is readable by any cross-site scripting flaw.
- Deleting a recording deletes every object behind it, verified against the bucket rather than assumed.
- Guest commenting on a shared link is off by default, because a public link with open commenting is a spam target.
- Secrets stay outside the repository. `.env` is never committed.
- Every shipped dependency is licence-audited, because users inherit it.

## For self-hosters

- Set a real session secret and a correct public base URL before exposing the instance. The defaults exist to make the first run work locally, not to be deployed.
- Terminate TLS in front of the application. Share links carry recordings of screens.
- Transcription runs as a local process, so audio does not leave your host. If you disable it, everything else keeps working.
