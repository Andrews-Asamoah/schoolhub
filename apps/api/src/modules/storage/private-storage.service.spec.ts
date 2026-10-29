import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
const { send, config } = vi.hoisted(() => ({ send: vi.fn(), config: {
  R2_ACCOUNT_ID: "account", R2_ACCESS_KEY_ID: "key", R2_SECRET_ACCESS_KEY: "secret", R2_BUCKET_NAME: "public",
  R2_PRIVATE_BUCKET_NAME: "private", R2_ENDPOINT: undefined,
} }));
vi.mock("../../env.js", () => ({ env: config }));
vi.mock("@aws-sdk/client-s3", () => ({
  HeadBucketCommand: class { constructor(readonly input: unknown) {} },
  GetObjectCommand: class { constructor(readonly input: unknown) {} },
  PutObjectCommand: class { constructor(readonly input: unknown) {} },
  DeleteObjectCommand: class { constructor(readonly input: unknown) {} },
  S3Client: class { send = send; },
}));
import { PrivateStorageService } from "./private-storage.service.js";
describe("separate private storage", () => {
  afterEach(() => { send.mockReset(); config.R2_PRIVATE_BUCKET_NAME = "private"; });
  it("never falls back to the public bucket", async () => {
    config.R2_PRIVATE_BUCKET_NAME = "public";
    await expect(new PrivateStorageService().upload("a", "schools/a/one", Buffer.from("data"), "image/png")).rejects.toThrow("not configured");
    expect(send).not.toHaveBeenCalled();
  });
  it.each(["schools/b/one", "schools/a/../b/one", "schools/a/evil\\path", "schools/a/evil\0path"])("rejects cross-school or malformed key %j", async key => {
    await expect(new PrivateStorageService().read("a", key, 100)).rejects.toThrow("not found");
    expect(send).not.toHaveBeenCalled();
  });
  it("writes private no-store metadata to the dedicated bucket", async () => {
    await new PrivateStorageService().upload("a", "schools/a/one", Buffer.from("data"), "image/png");
    expect(send.mock.calls[0]?.[0].input).toMatchObject({ Bucket: "private", Key: "schools/a/one", CacheControl: "private, no-store" });
  });
  it("bounds the actual byte stream even when a provider omits content length", async () => {
    const stream = Readable.from([Buffer.alloc(60), Buffer.alloc(60)]);
    send.mockResolvedValue({ Body: stream });
    await expect(new PrivateStorageService().read("a", "schools/a/one", 100)).rejects.toThrow("download limit");
    expect(stream.destroyed).toBe(true);
  });
});
