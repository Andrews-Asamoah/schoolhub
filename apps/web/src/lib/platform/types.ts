export interface Platform {
  readonly target: "web" | "desktop";
  readonly apiBase: string;
  readonly authOrigin: string;
  readonly authOptions: {
    disableDefaultFetchPlugins?: boolean;
    fetchOptions?: { customFetchImpl: typeof fetch };
  };
  fetch: typeof fetch;
  prepareSignIn?(school: string): Promise<void>;
  rememberSession?(): Promise<void>;
  savedSignInWarning?(): void;
  tenantSubdomain(): string | null;
}

export class DesktopConnectionError extends TypeError {}

export function signInConnectionMessage(error: unknown): string {
  return error instanceof DesktopConnectionError
    ? error.message
    : "We couldn’t connect. Check your internet connection and try again.";
}
