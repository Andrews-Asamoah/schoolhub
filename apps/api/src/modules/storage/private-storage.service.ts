import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand, HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { Readable } from "node:stream";
import { env } from "../../env.js";

/** Private buckets must have r2.dev and custom-domain access disabled by the operator. */
@Injectable()
export class PrivateStorageService {
  private readonly logger = new Logger(PrivateStorageService.name);
  private client?: S3Client;

  /** Which settings stop private storage from working. Empty when it is ready to use. */
  private missingConfig() {
    const missing: string[] = [];
    if (!env.R2_ACCOUNT_ID) missing.push("R2_ACCOUNT_ID");
    if (!env.R2_ACCESS_KEY_ID) missing.push("R2_ACCESS_KEY_ID");
    if (!env.R2_SECRET_ACCESS_KEY) missing.push("R2_SECRET_ACCESS_KEY");
    if (!env.R2_PRIVATE_BUCKET_NAME) missing.push("R2_PRIVATE_BUCKET_NAME");
    else if (env.R2_PRIVATE_BUCKET_NAME === env.R2_BUCKET_NAME) missing.push("R2_PRIVATE_BUCKET_NAME (must differ from R2_BUCKET_NAME)");
    return missing;
  }

  private storage() {
    const missing = this.missingConfig();
    if (missing.length) {
      this.logger.error(`Private file storage is not configured. Set in the API environment: ${missing.join(", ")}`);
      // Operators see what to set while developing; production callers get no configuration detail.
      throw new ServiceUnavailableException(
        env.NODE_ENV === "production" ? "Private file storage is not configured." : `Private file storage is not configured. Set: ${missing.join(", ")}.`,
      );
    }
    this.client ??= new S3Client({ region: "auto", endpoint: env.R2_ENDPOINT ?? `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: env.R2_ACCESS_KEY_ID!, secretAccessKey: env.R2_SECRET_ACCESS_KEY! } });
    return this.client;
  }

  async checkHealth() {
    const started = Date.now();
    if (this.missingConfig().length) return { status: "not_configured" as const, latencyMs: null };
    try {
      await this.storage().send(new HeadBucketCommand({ Bucket: env.R2_PRIVATE_BUCKET_NAME }), { abortSignal: AbortSignal.timeout(3_000) });
      return { status: "healthy" as const, latencyMs: Date.now() - started };
    } catch { return { status: "unavailable" as const, latencyMs: null }; }
  }

  assertOwned(schoolId: string, key: string) {
    if (!key.startsWith(`schools/${schoolId}/`) || key.includes("..") || key.includes("\\") || [...key].some(character => character.charCodeAt(0) < 32)) {
      throw new NotFoundException("File not found.");
    }
  }

  async upload(schoolId: string, key: string, body: Buffer, contentType: string) {
    this.assertOwned(schoolId, key);
    await this.storage().send(new PutObjectCommand({ Bucket: env.R2_PRIVATE_BUCKET_NAME, Key: key, Body: body,
      ContentType: contentType, CacheControl: "private, no-store" }), { abortSignal: AbortSignal.timeout(30_000) });
  }

  async read(schoolId: string, key: string, maxBytes: number) {
    this.assertOwned(schoolId, key);
    const result = await this.storage().send(new GetObjectCommand({ Bucket: env.R2_PRIVATE_BUCKET_NAME, Key: key }),
      { abortSignal: AbortSignal.timeout(30_000) });
    const stream = result.Body;
    if (!(stream instanceof Readable)) throw new ServiceUnavailableException("The stored file cannot be served.");
    if ((result.ContentLength ?? 0) > maxBytes) {
      stream.destroy();
      throw new ServiceUnavailableException("The stored file cannot be served.");
    }
    const timer = setTimeout(() => stream.destroy(new Error("Download timeout")), 30_000);
    const parts: Buffer[] = [];
    let total = 0;
    try {
      for await (const chunk of stream) {
        const part = Buffer.from(chunk);
        total += part.length;
        if (total > maxBytes) throw new ServiceUnavailableException("The stored file exceeds the download limit.");
        parts.push(part);
      }
      return Buffer.concat(parts);
    } finally {
      clearTimeout(timer);
      stream.destroy();
    }
  }

  /** Caller must persist a cleanup task if this fails; never silently swallow errors. */
  async delete(schoolId: string, key: string) {
    this.assertOwned(schoolId, key);
    await this.storage().send(new DeleteObjectCommand({ Bucket: env.R2_PRIVATE_BUCKET_NAME, Key: key }),
      { abortSignal: AbortSignal.timeout(10_000) });
  }
}
