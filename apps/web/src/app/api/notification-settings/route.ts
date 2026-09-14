import { requireUser } from "../../../auth/guards";
import {
  getMyNotificationSettings,
  setMyNotificationSettings,
} from "../../../features/notification-settings/application/notification-settings";
import { toErrorResponse } from "../../../lib/error-response";

export const dynamic = "force-dynamic";

/**
 * The signed-in caller's own notification settings. `requireUser()` is
 * the only source of identity here — there is no id in the URL or body
 * for a request to ask about anyone else's row.
 */
export async function GET(): Promise<Response> {
  try {
    const user = await requireUser();
    const settings = await getMyNotificationSettings(user.id);
    return Response.json(settings);
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * Updates the signed-in caller's own notification settings. The request
 * body is read only for the one value being changed
 * (`newCommentEmailEnabled`) — never for identity. Even a body that
 * carries a `userId` field is ignored: `user.id`, resolved from the
 * session, is the only id ever passed through to the application layer,
 * so this route cannot be made to change anyone else's setting.
 */
export async function PATCH(request: Request): Promise<Response> {
  try {
    const user = await requireUser();
    const body = (await request.json()) as { newCommentEmailEnabled?: unknown };
    const settings = await setMyNotificationSettings({
      callerId: user.id,
      newCommentEmailEnabled: body.newCommentEmailEnabled,
    });
    return Response.json(settings);
  } catch (error) {
    return toErrorResponse(error);
  }
}
