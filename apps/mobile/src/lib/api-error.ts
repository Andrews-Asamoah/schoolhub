export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
  get code(): string | undefined {
    const e = (this.body as { error?: unknown } | null)?.error;
    return typeof e === "string" ? e : undefined;
  }
}

export class SessionChangedError extends Error {
  constructor() {
    super("The active school session has changed.");
    this.name = "SessionChangedError";
  }
}

export class UnsupportedMobileRoleError extends Error {}
