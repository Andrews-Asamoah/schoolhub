/**
 * Safety policy shared by the destructive development-only payment reset script.
 * This is a heuristic guard, not a substitute for using a disposable database.
 */
export interface DevResetSafetyInput {
  allowDevReset?: string;
  nodeEnv?: string;
  databaseUrl?: string;
}

const DEVELOPMENT_LABEL = /(?:^|[._-])(?:dev|development|local|test|testing)(?:[._-]|$)/i;
const PRODUCTION_LABEL = /(?:^|[._-])(?:prod|production|live|primary)(?:[._-]|$)/i;

function hasLabel(value: string, label: RegExp): boolean {
  return label.test(value);
}

/**
 * Returns a refusal message when a reset must not proceed; otherwise returns null.
 * The explicit opt-in is required in every mode, including a dry run, because a
 * dry run still connects to and reads from the selected database.
 */
export function getDevResetSafetyError(input: DevResetSafetyInput): string | null {
  if (input.nodeEnv?.toLowerCase() === "production") {
    return "Refusing to run: NODE_ENV is production. This script deletes financial records.";
  }

  if (input.allowDevReset !== "true") {
    return "Refusing to run: set ALLOW_DEV_RESET=true explicitly to use this destructive development script.";
  }

  if (!input.databaseUrl?.trim()) {
    return "Refusing to run: DATABASE_URL must identify a local or development/test database.";
  }

  let target: URL;
  try {
    target = new URL(input.databaseUrl);
  } catch {
    return "Refusing to run: DATABASE_URL is not a valid PostgreSQL connection URL.";
  }

  if (target.protocol !== "postgres:" && target.protocol !== "postgresql:") {
    return "Refusing to run: DATABASE_URL must use the postgres or postgresql protocol.";
  }

  const hostname = target.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  let databaseName = target.pathname.split("/").filter(Boolean).at(-1) ?? "";
  try {
    databaseName = decodeURIComponent(databaseName);
  } catch {
    return "Refusing to run: DATABASE_URL contains an invalid database name.";
  }

  if (hasLabel(hostname, PRODUCTION_LABEL) || hasLabel(databaseName, PRODUCTION_LABEL)) {
    return "Refusing to run: DATABASE_URL appears to target a production, live, or primary database.";
  }

  const isLocalHost =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local");

  const isClearlyDevOrTest =
    hasLabel(hostname, DEVELOPMENT_LABEL) || hasLabel(databaseName, DEVELOPMENT_LABEL);

  if (!isLocalHost && !isClearlyDevOrTest) {
    return "Refusing to run: DATABASE_URL does not appear to target a local or clearly labelled development/test database.";
  }

  return null;
}
