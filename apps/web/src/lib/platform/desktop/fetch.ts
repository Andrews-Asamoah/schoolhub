import { DESKTOP_SESSION_NOTICE } from "./session";
import { DESKTOP_ACCESS_EVENT, desktopAccessIssue } from "./access";
import { invoke } from "@tauri-apps/api/core";

// Used only to construct Request objects; Rust alone chooses the network origin.
export const DESKTOP_REQUEST_ORIGIN = "https://schoolhub.desktop.invalid";

interface NativeResponse {
  status: number;
  headers: Record<string, string>;
  body: number[];
}

/** Binary and multipart data cross a single narrow IPC command; credentials stay in Rust. */
export const desktopFetch: typeof fetch = async (input, init) => {
  const original =
    input instanceof Request
      ? input
      : new Request(new URL(String(input), DESKTOP_REQUEST_ORIGIN));
  const request = new Request(original, init);
  const url = new URL(request.url);
  if (
    url.origin !== DESKTOP_REQUEST_ORIGIN ||
    !url.pathname.startsWith("/api/")
  ) {
    throw new TypeError("Desktop requests must use the SchoolHub API.");
  }
  if (request.signal.aborted)
    throw new DOMException("Request cancelled.", "AbortError");
  const headers = Object.fromEntries(request.headers.entries());
  const body = request.body
    ? Array.from(new Uint8Array(await request.arrayBuffer()))
    : [];
  const result = await invoke<NativeResponse>("desktop_request", {
    request: {
      path: url.pathname + url.search,
      method: request.method,
      headers,
      body,
    },
  });
  // IPC requests currently finish in Rust even if the caller cancels. Do not
  // deliver their response into a cancelled or changed application context.
  if (request.signal.aborted)
    throw new DOMException("Request cancelled.", "AbortError");
  if (result.headers["x-schoolhub-local-logout"] === "true") {
    window.dispatchEvent(
      new CustomEvent(DESKTOP_SESSION_NOTICE, {
        detail:
          "Signed out on this computer. The server could not confirm sign-out while the connection was unavailable.",
      }),
    );
  }
  if (result.status === 426 || result.status === 403) {
    try {
      const issue = desktopAccessIssue(
        result.status,
        JSON.parse(new TextDecoder().decode(new Uint8Array(result.body))),
      );
      if (issue)
        window.dispatchEvent(
          new CustomEvent(DESKTOP_ACCESS_EVENT, { detail: issue }),
        );
    } catch {
      /* Preserve the original HTTP error when a response is not JSON. */
    }
  }
  return new Response(
    [204, 205, 304].includes(result.status)
      ? null
      : new Uint8Array(result.body),
    {
      status: result.status,
      headers: result.headers,
    },
  );
};
