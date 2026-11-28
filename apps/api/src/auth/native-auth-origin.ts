const nativeOrigin = 'schoolhub://';
const nativeAuthPaths = new Set([
  '/api/auth/sign-in/email',
  '/api/auth/two-factor/verify-totp',
  '/api/auth/two-factor/verify-backup-code',
]);

export function isNativeAuthRequest(request?: Request) {
  return (
    request?.method === 'POST' &&
    !request.headers.has('origin') &&
    !request.headers.has('sec-fetch-site') &&
    request.headers.get('expo-origin') === nativeOrigin &&
    nativeAuthPaths.has(new URL(request.url).pathname)
  );
}

export const nativeAuthOrigin = {
  id: 'schoolhub-native-auth-origin',
  async onRequest(request: Request) {
    if (!isNativeAuthRequest(request)) return;
    const headers = new Headers(request.headers);
    headers.set('origin', nativeOrigin);
    return { request: new Request(request, { headers }) };
  },
};

export function trustedAuthOrigins(webOrigins: string[], request?: Request) {
  return isNativeAuthRequest(request)
    ? [...webOrigins, nativeOrigin]
    : webOrigins;
}
