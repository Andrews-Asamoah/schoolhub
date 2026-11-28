function validateReleaseApi(profile, value) {
  if (profile !== "preview" && profile !== "production") return;
  let origin;
  try {
    origin = new URL(value);
  } catch {
    throw new Error(
      `Set EXPO_PUBLIC_API_URL to the SchoolHub HTTPS API origin for the ${profile} build.`,
    );
  }
  if (
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash ||
    /^(localhost|127\.|\[::1\])|\.(invalid|localhost)$/.test(origin.hostname)
  ) {
    throw new Error(
      `EXPO_PUBLIC_API_URL for the ${profile} build must be a reachable HTTPS origin without /api, credentials, or a query string.`,
    );
  }
}

function readPortalOrigin(value) {
  if (!value) return undefined;
  // Native HTTPS associations require a DNS host on the default HTTPS port.
  if (!/^https:\/\/(?:[a-z0-9][a-z0-9-]*\.)+[a-z][a-z0-9-]*\/?$/i.test(value)) {
    throw new Error(
      "Set EXPO_PUBLIC_PORTAL_ORIGIN to the bare HTTPS SchoolHub web origin.",
    );
  }
  return new URL(value);
}

module.exports = ({ config }) => {
  validateReleaseApi(
    process.env.EAS_BUILD_PROFILE,
    process.env.EXPO_PUBLIC_API_URL,
  );
  // EAS file variables resolve to a path during the native Android build.
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON;
  const portal = readPortalOrigin(process.env.EXPO_PUBLIC_PORTAL_ORIGIN);
  if (!portal && !googleServicesFile) return config;

  const android = { ...config.android };
  if (googleServicesFile) android.googleServicesFile = googleServicesFile;
  if (!portal) return { ...config, android };

  android.intentFilters = [
    ...(android.intentFilters ?? []),
    {
      action: "VIEW",
      autoVerify: true,
      category: ["BROWSABLE", "DEFAULT"],
      data: [
        { scheme: "https", host: portal.hostname, path: "/reset-password" },
      ],
    },
  ];

  const ios = {
    ...config.ios,
    associatedDomains: [
      ...new Set([
        ...(config.ios?.associatedDomains ?? []),
        `applinks:${portal.hostname}`,
      ]),
    ],
  };

  return {
    ...config,
    android,
    ios,
  };
};
