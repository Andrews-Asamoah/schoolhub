import { config } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

// Loads the root .env in development (does nothing when the host sets env vars)
config({ path: resolve(__dirname, "../../../.env") });