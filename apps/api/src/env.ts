import { z } from "zod";

export const env = z
  .object({
    DATABASE_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    WEB_ORIGIN: z.url(),
    PORT: z.coerce.number().default(3001),

    // Cloudflare R2 object storage (optional: uploads return 503 when unset).
    R2_ACCOUNT_ID: z.string().optional(),
    R2_ACCESS_KEY_ID: z.string().optional(),
    R2_SECRET_ACCESS_KEY: z.string().optional(),
    R2_BUCKET_NAME: z.string().optional(),
    R2_ENDPOINT: z.url().optional(),
    // Public base URL of the bucket (r2.dev or a custom domain, e.g. https://files.schoolhub.com)
    R2_PUBLIC_URL: z.url().optional(),
  })
  .parse(process.env);