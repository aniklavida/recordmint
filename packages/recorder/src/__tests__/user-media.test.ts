import { describe, expect, it, vi } from "vitest";
import { captureUserMedia, type UserMediaGlobals } from "../capture/user-media.js";

describe("captureUserMedia", () => {
  it("calls getUserMedia with provided constraints", async () => {
    const stream = {} as MediaStream;
    const globals: UserMediaGlobals = {
      getUserMedia: vi.fn().mockResolvedValue(stream),
    };
    const constraints = { audio: true };
    const result = await captureUserMedia(constraints, globals);
    expect(result).toBe(stream);
    expect(globals.getUserMedia).toHaveBeenCalledWith(constraints);
  });
});
