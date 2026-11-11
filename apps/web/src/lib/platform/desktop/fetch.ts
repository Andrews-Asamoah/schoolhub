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
