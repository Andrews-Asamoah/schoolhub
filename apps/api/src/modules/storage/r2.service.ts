import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { env } from "../../env.js";

/**
 * Cloudflare R2 (S3-compatible) object storage.
 *
 * Every object lives under `schools/<schoolId>/…`. The immutable school id is
 * used rather than the subdomain, so renaming a school's address never orphans
 * its files and one school's keys can never collide with another's.
 */
@Injectable()
export class R2Service {
  private readonly logger = new Logger(R2Service.name);
  private client: S3Client | null = null;

  private readonly publicBase = env.R2_PUBLIC_URL?.replace(/\/+$/, "");

  get isConfigured(): boolean {
    return Boolean(
      env.R2_ACCOUNT_ID &&
        env.R2_ACCESS_KEY_ID &&
        env.R2_SECRET_ACCESS_KEY &&
        env.R2_BUCKET_NAME &&
        this.publicBase,
    );
  }

  private getClient(): S3Client {
    if (!this.isConfigured) {
      throw new ServiceUnavailableException(
        "File storage is not configured on this server.",
      );
    }
    this.client ??= new S3Client({
      region: "auto",
      endpoint:
        env.R2_ENDPOINT ?? `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID!,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
      },
    });
    return this.client;
  }

  /** Key prefixes. A random id per upload means a URL never changes content. */
  readonly keys = {
    schoolPrefix: (schoolId: string) => `schools/${schoolId}/`,
    logo: (schoolId: string, ext: string) =>
      `schools/${schoolId}/images/logo/${randomUUID()}.${ext}`,
    avatar: (schoolId: string, userId: string, ext: string) =>
      `schools/${schoolId}/images/avatars/${userId}-${randomUUID()}.${ext}`,
    document: (schoolId: string, kind: string, ext: string) =>
      `schools/${schoolId}/files/${kind}/${randomUUID()}.${ext}`,
  };

  publicUrl(key: string): string {
    return `${this.publicBase}/${key}`;
  }

  /** Reverse of publicUrl(); null for URLs that aren't ours. */
  keyFromUrl(url: string | null | undefined): string | null {
    if (!url || !this.publicBase || !url.startsWith(`${this.publicBase}/`)) {
      return null;
    }
    return url.slice(this.publicBase.length + 1);
  }

  async upload(key: string, body: Buffer, contentType: string): Promise<string> {
    await this.getClient().send(
      new PutObjectCommand({
        Bucket: env.R2_BUCKET_NAME,
        Key: key,
        Body: body,
        ContentType: contentType,
        // Keys are unique per upload, so the object never changes: cache hard.
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
    return this.publicUrl(key);
  }

  /** Best-effort: a failed cleanup must never fail the user's request. */
  async delete(key: string): Promise<void> {
    try {
      await this.getClient().send(
        new DeleteObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key }),
      );
    } catch (error) {
      this.logger.warn(`Could not delete R2 object "${key}": ${String(error)}`);
    }
  }
}
