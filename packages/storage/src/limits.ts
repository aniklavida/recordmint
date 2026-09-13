/**
 * Presigned URLs are credentials — this repository's own CI scans for one
 * leaking into a committed file alongside token patterns (see
 * `.github/workflows/validate.yml`'s "Reject presigned storage URLs" step).
 * A short presign lifetime is enforced here as a hard ceiling, not left to
 * every caller remembering to pass a small number: no function in this
 * package can mint a URL that outlives `MAX_PRESIGN_TTL_SECONDS`, no matter
 * what it is asked for.
 */
export const MAX_PRESIGN_TTL_SECONDS = 24 * 60 * 60;

/**
 * Resolves the TTL a caller asked for against the package default, and
 * rejects anything non-positive or past the ceiling above. Every presign
 * function in this package routes its `expiresInSeconds` through this
 * before it reaches the AWS SDK.
 */
export function resolvePresignTtlSeconds(requested: number | undefined, fallbackSeconds: number): number {
  const seconds = requested ?? fallbackSeconds;
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(`Presign TTL must be a positive number of seconds, got ${seconds}`);
  }
  if (seconds > MAX_PRESIGN_TTL_SECONDS) {
    throw new Error(
      `Presign TTL of ${seconds}s exceeds the maximum of ${MAX_PRESIGN_TTL_SECONDS}s — a link that outlives its need is a leak`,
    );
  }
  return seconds;
}
