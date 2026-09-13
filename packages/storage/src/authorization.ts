/**
 * Thrown when a caller's `authorize` check refuses a storage request.
 * Never carries the key, bucket or any credential — only a stable message
 * — since this error can legitimately reach an HTTP response.
 */
export class StorageAuthorizationError extends Error {
  constructor(message = "This storage request was not authorized.") {
    super(message);
    this.name = "StorageAuthorizationError";
  }
}

export type AuthorizationCheck = () => boolean | Promise<boolean>;

/**
 * Runs a caller-supplied authorization check and throws before returning
 * if it refuses. Every function in this package that mints a presigned
 * URL or opens/completes/aborts a multipart upload takes an `authorize`
 * callback and calls this as its first line — before it builds any AWS
 * SDK command — so a refusal never reaches the SDK, let alone the
 * network. Server-side authorisation runs before a presign is issued, not
 * after, and this is what that means concretely: the check is not a wrapper
 * the caller might forget to apply, it is the first statement inside the
 * function that would otherwise mint the credential.
 *
 * Deliberately opaque to *what* is being authorized — a workspace
 * membership check, a recording ownership check, whatever the app layer
 * needs — because `packages/storage` knows about buckets and keys, not
 * users or workspaces. The caller closes over whatever context it needs
 * and hands this function a plain predicate.
 */
export async function assertAuthorized(authorize: AuthorizationCheck): Promise<void> {
  let allowed: boolean;
  try {
    allowed = await authorize();
  } catch (error) {
    throw new StorageAuthorizationError(
      error instanceof Error
        ? `Authorization check threw before a decision was made: ${error.message}`
        : "Authorization check threw before a decision was made.",
    );
  }
  if (!allowed) {
    throw new StorageAuthorizationError();
  }
}
