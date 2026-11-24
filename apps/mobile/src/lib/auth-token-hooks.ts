type AuthRequest = {
  url?: URL | string;
  headers?: Headers;
  credentials?: RequestCredentials;
};

const endOfPath = (request: AuthRequest) =>
  String(request.url ?? "").split("?")[0] ?? "";
const signInPath = /\/sign-in\/email\/?$/;
const verificationPath = /\/two-factor\/(verify-totp|verify-backup-code)\/?$/;

/** Better Fetch preserves its request-context object through response hooks.
 * WeakMap keys are not transmitted, logged or persisted.
 */
export function createTokenHooks(store: {
  getRevision(): number;
  setToken(token: string): Promise<number>;
}) {
  const requests = new WeakMap<
    object,
    { revision: number; challengeGeneration: number }
  >();
  let challengeGeneration = 0;
  let challenge: {
    cookie: string;
    revision: number;
    expiresAt: number;
  } | null = null;
  function clearChallenge() {
    challenge = null;
    challengeGeneration++;
  }
  function currentChallenge() {
    return challenge &&
      challenge.revision === store.getRevision() &&
      challenge.expiresAt > Date.now()
      ? challenge
      : null;
  }
  const responses = new WeakMap<object, number>();
  return {
    clearChallenge,
    hasChallenge: () => !!currentChallenge(),
    onRequest(request: AuthRequest) {
      const path = endOfPath(request);
      const signIn = signInPath.test(path);
      const verification = verificationPath.test(path);
      if (signIn || /\/sign-out\/?$/.test(path)) clearChallenge();
      if (signIn || verification) {
        request.credentials = "omit";
        request.headers?.set("expo-origin", "schoolhub://");
        request.headers?.delete("cookie");
        request.headers?.delete("authorization");
        if (verification) {
          const active = currentChallenge();
          if (active) request.headers?.set("cookie", active.cookie);
        }
      }
      requests.set(request, {
        revision: store.getRevision(),
        challengeGeneration,
      });
    },
    isCurrentResponse(data: unknown) {
      return (
        typeof data === "object" &&
        data !== null &&
        responses.get(data) === store.getRevision()
      );
    },
    async onSuccess(context: {
      request: AuthRequest;
      data?: unknown;
      response: { headers: Pick<Headers, "get"> };
    }) {
      const owner = requests.get(context.request);
      requests.delete(context.request);
      const path = endOfPath(context.request);
      const verification = verificationPath.test(path);
      if (
        /(?:^|\/)sign-out\/?$/.test(path) ||
        !owner ||
        owner.revision !== store.getRevision() ||
        ((signInPath.test(path) || verification) &&
          owner.challengeGeneration !== challengeGeneration)
      )
        return;
      const challenged =
        (context.data as { twoFactorRedirect?: boolean } | null)
          ?.twoFactorRedirect === true;
      if (challenged && signInPath.test(path)) {
        // Better Auth emits several Set-Cookie fields during the password step.
        // Capture only its signed challenge cookie, never the browser session.
        const setCookie = context.response.headers.get("set-cookie") ?? "";
        const match =
          /(?:^|,\s*)((?:__Secure-)?better-auth\.two_factor=[A-Za-z0-9%._~+/:=-]+)(?=;|,|$)/.exec(
            setCookie,
          );
        if (match?.[1])
          challenge = {
            cookie: match[1],
            revision: owner.revision,
            expiresAt: Date.now() + 5 * 60_000,
          };
      }
      if (verification) clearChallenge();
      const token = challenged
        ? null
        : context.response.headers.get("set-auth-token");
      // setToken returns its own generation, even if logout happens while its
      // secure write is pending. Never bless that old response as a new session.
      const ownerRevision = token
        ? await store.setToken(token)
        : owner.revision;
      if (ownerRevision !== store.getRevision()) return;
      if (typeof context.data === "object" && context.data !== null)
        responses.set(context.data, ownerRevision);
    },
  };
}
