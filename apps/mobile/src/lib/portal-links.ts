function portalOrigin() {
  return process.env.EXPO_PUBLIC_PORTAL_ORIGIN?.replace(
    /\/$/,
    "",
  ).toLowerCase();
}

export function guardianFeesPortalUrl(subdomain: string | null) {
  const origin = portalOrigin();
  if (!origin || !subdomain) return null;
  return `${origin}/login?school=${encodeURIComponent(subdomain)}&continue=guardian-fees`;
}

export function readRecoveryLink(path: string) {
  const origin = portalOrigin();
  const prefix = `${origin}/reset-password`;
  if (!origin || !path.startsWith(prefix)) return null;
  // Match the API's HTTPS link exactly, including its optional tenant and
  // single base64url fragment. The fragment never becomes a router parameter.
  const tail = path.slice(prefix.length);
  return (
    /^(?:\?school=[a-z0-9-]+)?#token=([A-Za-z0-9_-]{43})$/.exec(tail)?.[1] ??
    null
  );
}
