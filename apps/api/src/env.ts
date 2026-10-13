import { z } from "zod";

export const env = z
  .object({
    DATABASE_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    WEB_ORIGIN: z.url(),
    PORT: z.coerce.number().default(3001),
  })
  .parse(process.env);