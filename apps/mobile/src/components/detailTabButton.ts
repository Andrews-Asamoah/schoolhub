// Expo Router treats a hidden route as unavailable and redirects it. Keep the
// route registered and navigable, but give it no button in either tab bar.
export function detailTabButton() {
  return null;
}
