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
