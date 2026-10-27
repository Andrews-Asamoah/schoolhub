import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSend, mockEnv } = vi.hoisted(() => ({
  mockSend: vi.fn(),
  mockEnv: {
    R2_ACCOUNT_ID: "account",
    R2_ACCESS_KEY_ID: "access-key",
    R2_SECRET_ACCESS_KEY: "secret-key",
    R2_BUCKET_NAME: "schoolhub-assets",
    R2_ENDPOINT: undefined as string | undefined,
    R2_PUBLIC_URL: "https://assets.example.test",
  },
}));

vi.mock("@aws-sdk/client-s3", () => ({
  DeleteObjectCommand: class {
    constructor(readonly input: unknown) {}
  },
  HeadBucketCommand: class {
    constructor(readonly input: unknown) {}
  },
  PutObjectCommand: class {
    constructor(readonly input: unknown) {}
  },
  S3Client: class {
    send = mockSend;
    constructor(_config: unknown) {}
  },
}));

vi.mock("../../env.js", () => ({ env: mockEnv }));

import { HeadBucketCommand } from "@aws-sdk/client-s3";
import { R2Service } from "./r2.service.js";

describe("R2Service health probe", () => {
  beforeEach(() => {
    mockSend.mockReset();
    mockEnv.R2_ACCOUNT_ID = "account";
    mockEnv.R2_ACCESS_KEY_ID = "access-key";
    mockEnv.R2_SECRET_ACCESS_KEY = "secret-key";
    mockEnv.R2_BUCKET_NAME = "schoolhub-assets";
    mockEnv.R2_PUBLIC_URL = "https://assets.example.test";
    mockEnv.R2_ENDPOINT = undefined;
  });

  it("checks bucket access with a bounded, read-only HeadBucket request", async () => {
    mockSend.mockResolvedValue({});
    const service = new R2Service();

    const result = await service.checkHealth();

    expect(result.status).toBe("healthy");
    expect(result.latencyMs).toEqual(expect.any(Number));
    expect(mockSend).toHaveBeenCalledOnce();
    expect(mockSend.mock.calls[0]?.[0]).toBeInstanceOf(HeadBucketCommand);
    expect((mockSend.mock.calls[0]?.[0] as HeadBucketCommand).input).toEqual({
      Bucket: "schoolhub-assets",
    });
    expect(mockSend.mock.calls[0]?.[1]?.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it("reports not configured without attempting a provider request", async () => {
    mockEnv.R2_BUCKET_NAME = undefined as unknown as string;
    const service = new R2Service();

    await expect(service.checkHealth()).resolves.toEqual({
      status: "not_configured",
      latencyMs: null,
    });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("reports provider failures without exposing SDK errors", async () => {
    mockSend.mockRejectedValue(new Error("sensitive provider endpoint detail"));
    const service = new R2Service();

    await expect(service.checkHealth()).resolves.toEqual({
      status: "unavailable",
      latencyMs: null,
    });
  });
});
