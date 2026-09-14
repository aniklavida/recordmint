import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";
import { getObjectStream, putObject } from "../objects.js";

describe("getObjectStream / putObject", () => {
  it("sends a GetObjectCommand for exactly the requested bucket and key", async () => {
    const fakeBody = { fake: "readable" };
    const client = { send: vi.fn().mockResolvedValue({ Body: fakeBody }) };

    const result = await getObjectStream(client as never, "my-bucket", "recordings/abc/original.mp4");

    expect(client.send).toHaveBeenCalledTimes(1);
    const command = client.send.mock.calls[0]![0] as GetObjectCommand;
    expect(command).toBeInstanceOf(GetObjectCommand);
    expect(command.input).toEqual({ Bucket: "my-bucket", Key: "recordings/abc/original.mp4" });
    expect(result).toBe(fakeBody);
  });

  it("sends a PutObjectCommand carrying the body and content type", async () => {
    const client = { send: vi.fn().mockResolvedValue({}) };
    const body = Buffer.from("poster bytes");

    await putObject(client as never, "my-bucket", "recordings/abc/poster.jpg", body, "image/jpeg");

    expect(client.send).toHaveBeenCalledTimes(1);
    const command = client.send.mock.calls[0]![0] as PutObjectCommand;
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toEqual({
      Bucket: "my-bucket",
      Key: "recordings/abc/poster.jpg",
      Body: body,
      ContentType: "image/jpeg",
    });
  });
});
