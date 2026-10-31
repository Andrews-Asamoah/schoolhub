/** One explicit deployment policy shared by CORS and Better Auth. */
export function originPolicy(config: Record<string, string | undefined>) {
  const production = config.NODE_ENV === "production";
  const web = new URL(config.WEB_ORIGIN ?? "http://localhost:5173");
  if (web.username || web.password || web.pathname !== "/" || web.search || web.hash ||
    (production && web.protocol !== "https:")) throw new Error("WEB_ORIGIN must be a bare HTTPS origin in production.");
  const roots = (config.TENANT_ROOT_DOMAINS ?? "").split(",").map(value => value.trim().toLowerCase()).filter(Boolean);
  for (const root of roots) if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(root)) throw new Error("TENANT_ROOT_DOMAINS must contain comma-separated owned domain names.");
  const exact = new Set([web.origin]);
  for (const root of roots) exact.add(`https://${root}`);
  const trustedOrigins = [...exact, ...roots.map(root => `https://*.${root}`)];
  if (!production) {
    const development = ["http://localhost:5173", "http://localhost:3000", "http://tauri.localhost", "tauri://localhost"];
    development.forEach(origin => exact.add(origin));
    trustedOrigins.push(...development, "http://*.localhost:5173", "http://*.localhost:3000");
  }
  return {
    trustedOrigins: [...new Set(trustedOrigins)],
    allows(origin: string | undefined) {
      if (!origin) return true; // Native clients must still authenticate and pass tenant/resource guards.
      if (exact.has(origin)) return true;
      try {
        const url = new URL(origin);
        if (url.origin !== origin || url.username || url.password) return false;
        if (!production && url.protocol === "http:" && ["5173", "3000"].includes(url.port) && /^[a-z0-9-]+\.localhost$/.test(url.hostname)) return true;
        return url.protocol === "https:" && !url.port && roots.some(root => {
          const suffix = `.${root}`;
          const prefix = url.hostname.endsWith(suffix) ? url.hostname.slice(0, -suffix.length) : "";
          return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(prefix);
        });
      } catch { return false; }
    },
  };
}
