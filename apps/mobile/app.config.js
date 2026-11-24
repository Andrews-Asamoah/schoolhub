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

module.exports = ({ config }) => {
  validateReleaseApi(
    process.env.EAS_BUILD_PROFILE,
    process.env.EXPO_PUBLIC_API_URL,
  );
  // EAS file variables resolve to a path during the native Android build.
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON;
  return googleServicesFile
    ? { ...config, android: { ...config.android, googleServicesFile } }
    : config;
};
