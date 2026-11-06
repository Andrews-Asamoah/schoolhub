/** Better Fetch preserves its request-context object through response hooks.
 * WeakMap keys are not transmitted, logged or persisted.
 */
export function createTokenHooks(store: {
  getRevision(): number;
  setToken(token: string): Promise<number>;
}) {
  const requests = new WeakMap<object, number>();
  const responses = new WeakMap<object, number>();
  return {
    onRequest(request: object) {
      requests.set(request, store.getRevision());
    },
    isCurrentResponse(data: unknown) {
      return (
        typeof data === "object" &&
        data !== null &&
        responses.get(data) === store.getRevision()
      );
    },
    async onSuccess(context: {
      request: { url?: URL | string };
      data?: unknown;
      response: { headers: Pick<Headers, "get"> };
    }) {
      const revision = requests.get(context.request);
      requests.delete(context.request);
      const path = String(context.request.url ?? "").split("?")[0] ?? "";
      if (
        /(?:^|\/)sign-out\/?$/.test(path) ||
        revision === undefined ||
        revision !== store.getRevision()
      )
        return;
      const challenged =
        (context.data as { twoFactorRedirect?: boolean } | null)
          ?.twoFactorRedirect === true;
      const token = challenged
        ? null
        : context.response.headers.get("set-auth-token");
      // setToken returns its own generation, even if logout happens while its
      // secure write is pending. Never bless that old response as a new session.
      const ownerRevision = token ? await store.setToken(token) : revision;
      if (ownerRevision !== store.getRevision()) return;
      if (typeof context.data === "object" && context.data !== null)
        responses.set(context.data, ownerRevision);
    },
  };
}
