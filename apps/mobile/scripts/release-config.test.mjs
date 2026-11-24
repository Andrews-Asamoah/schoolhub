import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import configure from "../app.config.js";

const input = { config: { name: "SchoolHub" } };

test("preview and production builds require a bare HTTPS API origin", (t) => {
  const oldGoogleServices = process.env.GOOGLE_SERVICES_JSON;
  delete process.env.GOOGLE_SERVICES_JSON;
  const oldProfile = process.env.EAS_BUILD_PROFILE;
  const oldOrigin = process.env.EXPO_PUBLIC_API_URL;
  t.after(() => {
    for (const [key, value] of [
      ["GOOGLE_SERVICES_JSON", oldGoogleServices],
      ["EAS_BUILD_PROFILE", oldProfile],
      ["EXPO_PUBLIC_API_URL", oldOrigin],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  for (const profile of ["preview", "production"]) {
    process.env.EAS_BUILD_PROFILE = profile;
    delete process.env.EXPO_PUBLIC_API_URL;
    assert.throws(() => configure(input), /EXPO_PUBLIC_API_URL/);
    for (const value of [
      "https://schoolhub.example/api",
      "https://schoolhub.example?profile=preview",
      "https://account:password@schoolhub.example",
      "https://localhost:3001",
      "https://mobile-ci.schoolhub.invalid",
      "http://10.0.2.2:3001",
    ]) {
      process.env.EXPO_PUBLIC_API_URL = value;
      assert.throws(() => configure(input), /EXPO_PUBLIC_API_URL/);
    }
    process.env.EXPO_PUBLIC_API_URL = "https://api.schoolhub.example/";
    assert.equal(configure(input), input.config);
  }

  process.env.EAS_BUILD_PROFILE = "development";
  process.env.EXPO_PUBLIC_API_URL = "http://10.0.2.2:3001";
  assert.equal(configure(input), input.config);
});

test("Android store submissions have an explicit internal draft profile", () => {
  const eas = JSON.parse(readFileSync(new URL("../eas.json", import.meta.url)));
  assert.equal(eas.build.production.android.buildType, "app-bundle");
  assert.equal(eas.build.preview.android.buildType, "apk");
  assert.deepEqual(eas.submit.internal.android, {
    track: "internal",
    releaseStatus: "draft",
  });
});

test("Android push config accepts an EAS file variable without replacing package settings", (t) => {
  const prior = process.env.GOOGLE_SERVICES_JSON;
  const priorProfile = process.env.EAS_BUILD_PROFILE;
  t.after(() => {
    if (prior === undefined) delete process.env.GOOGLE_SERVICES_JSON;
    else process.env.GOOGLE_SERVICES_JSON = prior;
    if (priorProfile === undefined) delete process.env.EAS_BUILD_PROFILE;
    else process.env.EAS_BUILD_PROFILE = priorProfile;
  });
  process.env.GOOGLE_SERVICES_JSON = "/tmp/google-services.json";
  delete process.env.EAS_BUILD_PROFILE;
  const config = configure({
    config: { android: { package: "com.schoolhub.mobile" } },
  });
  assert.deepEqual(config.android, {
    package: "com.schoolhub.mobile",
    googleServicesFile: "/tmp/google-services.json",
  });
});
