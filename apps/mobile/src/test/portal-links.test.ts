import { redirectSystemPath } from "../../app/+native-intent";
import {
  clearRecoveryLink,
  getRecoveryLink,
  subscribeToRecoveryLink,
} from "@/features/auth/recovery-link";
import { guardianFeesPortalUrl } from "@/lib/portal-links";

const portal = "https://app.schoolhub.example";
const token = "a".repeat(43);

beforeEach(() => {
  process.env.EXPO_PUBLIC_PORTAL_ORIGIN = portal;
});

afterEach(() => {
  clearRecoveryLink();
  jest.useRealTimers();
  delete process.env.EXPO_PUBLIC_PORTAL_ORIGIN;
});

test.each([true, false])(
  "handles a verified-style link on cold/warm launch (%s)",
  (initial) => {
    const listener = jest.fn();
    const stop = subscribeToRecoveryLink(listener);
    expect(
      redirectSystemPath({
        path: `${portal}/reset-password?school=demo-school#token=${token}`,
        initial,
      }),
    ).toBe("/password-recovery-link");
    expect(getRecoveryLink()?.token).toBe(token);
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
  },
);

test("rejects invalid, custom-scheme and other-host reset links", () => {
  for (const path of [
    `${portal}.other.example/reset-password#token=${token}`,
    "http://app.schoolhub.example/reset-password#token=" + token,
    "schoolhub://reset-password#token=" + token,
    `${portal}/reset-password?token=${token}`,
    `${portal}/reset-password#token=${token}&token=${token}`,
    `${portal}/reset-password#token=short`,
  ]) {
    expect(redirectSystemPath({ path, initial: false })).toBeNull();
    expect(getRecoveryLink()).toBeNull();
  }
  expect(
    redirectSystemPath({ path: "schoolhub://notices", initial: false }),
  ).toBe("schoolhub://notices");
});

test("expires the in-memory secret", () => {
  jest.useFakeTimers();
  redirectSystemPath({
    path: `${portal}/reset-password#token=${token}`,
    initial: true,
  });
  jest.advanceTimersByTime(15 * 60 * 1000);
  expect(getRecoveryLink()).toBeNull();
});

test("guardian handoff carries school context and stays off without a portal origin", () => {
  expect(guardianFeesPortalUrl("north-school")).toBe(
    `${portal}/login?school=north-school&continue=guardian-fees`,
  );
  expect(guardianFeesPortalUrl(null)).toBeNull();
  delete process.env.EXPO_PUBLIC_PORTAL_ORIGIN;
  expect(guardianFeesPortalUrl("north-school")).toBeNull();
  expect(
    redirectSystemPath({
      path: `${portal}/reset-password#token=${token}`,
      initial: true,
    }),
  ).toBeNull();
});
