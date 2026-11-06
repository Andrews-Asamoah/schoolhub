const RESERVED_SUBDOMAINS = new Set([
  "www", "app", "api", "admin", "staging", "demo", "mail", "docs",
]);

/** Shared by tenant branding and API headers so they always select one school. */
export function resolveTenantSubdomain(hostname: string, search = ""): string | null {
  const params = new URLSearchParams(search);
  const override = (params.get("school") || params.get("subdomain"))?.trim().toLowerCase();
  const valid = (value: string) =>
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(value) && !RESERVED_SUBDOMAINS.has(value);
  if (override && valid(override)) return override;

  const host = hostname.toLowerCase().replace(/\.$/, "");
  // IPv4/IPv6 addresses are central hosts, never school subdomains.
  if (/^\d+(?:\.\d+){3}$/.test(host) || host.includes(":")) return null;
  const parts = host.split(".");
  const first = parts[0];
  if (first && valid(first) && (host.endsWith(".localhost") || parts.length >= 3)) {
    return first;
  }
  return null;
}

export function getTenantSubdomain(): string | null {
  return typeof window === "undefined" ? null :
    resolveTenantSubdomain(window.location.hostname, window.location.search);
}
