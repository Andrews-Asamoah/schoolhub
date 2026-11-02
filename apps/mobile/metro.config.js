const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// A redirect protects navigation, but does not remove modules from a bundle.
// Exclude galleries and sample-data routes from Metro's production file map.
if (process.env.NODE_ENV === "production") {
  const previous = config.resolver.blockList;
  config.resolver.blockList = [
    ...(Array.isArray(previous) ? previous : previous ? [previous] : []),
    /[/\\]apps[/\\]mobile[/\\]app[/\\](?:dev-gallery\.[tj]sx?$|dev-tabs[/\\]|\(tabs\)[/\\]|\(workspace\)[/\\])/,
  ];
}

module.exports = config;
