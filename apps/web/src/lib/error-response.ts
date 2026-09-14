import { isAppError } from "@recordmint/shared";
import { StorageAuthorizationError } from "@recordmint/storage";

const STATUS_BY_CODE: Record<string, number> = {
  UNAUTHENTICATED: 401,
  INVALID_CREDENTIALS: 401,
  NOT_A_MEMBER: 403,
  INSUFFICIENT_ROLE: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  CONFLICT: 409,
  RATE_LIMITED: 429,
};

/**
 * One place every route handler funnels a caught error through. An
 * `AppError` becomes the stable envelope its own code maps to; a storage
 * authorization refusal becomes a 403 with no leaked detail (presigned
 * URLs and the reasons access was refused are never something a client
 * response should carry); anything else is an unexpected 500 that does
 * not echo the original error message to the caller, only logs it
 * server-side.
 */
export function toErrorResponse(error: unknown): Response {
  if (isAppError(error)) {
    const status = STATUS_BY_CODE[error.code] ?? 400;
    return Response.json(error.toEnvelope(), { status });
  }
  if (error instanceof StorageAuthorizationError) {
    return Response.json(
      { error: { code: "FORBIDDEN", message: "This action is not authorized." } },
      { status: 403 },
    );
  }
  console.error("Unhandled route error:", error);
  return Response.json(
    { error: { code: "INTERNAL", message: "Something went wrong." } },
    { status: 500 },
  );
}
