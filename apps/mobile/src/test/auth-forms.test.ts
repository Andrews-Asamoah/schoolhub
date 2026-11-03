import {
  authFailureMessage,
  changePasswordFormSchema,
  changePasswordRequest,
  loginSchema,
} from "@/features/auth/forms";
import { ApiError } from "@/lib/api-error";

test("school login requires an identifier and password", () => {
  expect(
    loginSchema.safeParse({ login: "  ", password: "secret" }).success,
  ).toBe(false);
  expect(loginSchema.parse({ login: " student ", password: "secret" })).toEqual(
    {
      login: "student",
      password: "secret",
    },
  );
});

test("password-change form applies server policy and confirmation checks", () => {
  const valid = {
    currentPassword: "Temporary123",
    newPassword: "NewSecure123",
    confirmPassword: "NewSecure123",
  };
  expect(changePasswordFormSchema.safeParse(valid).success).toBe(true);
  expect(
    changePasswordFormSchema.safeParse({
      ...valid,
      newPassword: "weak",
      confirmPassword: "weak",
    }).success,
  ).toBe(false);
  expect(
    changePasswordFormSchema.safeParse({
      ...valid,
      confirmPassword: "Different123",
    }).success,
  ).toBe(false);
  expect(
    changePasswordFormSchema.safeParse({
      ...valid,
      newPassword: valid.currentPassword,
      confirmPassword: valid.currentPassword,
    }).success,
  ).toBe(false);
  expect(changePasswordRequest(valid)).toEqual({
    currentPassword: valid.currentPassword,
    newPassword: valid.newPassword,
  });
});

test("bad credentials receive the same non-enumerating message", () => {
  expect(
    authFailureMessage(new ApiError(401, "Unknown user", {}), "signIn"),
  ).toBe(authFailureMessage(new ApiError(401, "Wrong password", {}), "signIn"));
});

test("rate limits and unknown schools have actionable messages", () => {
  expect(authFailureMessage({ status: 429 }, "signIn")).toMatch(
    /wait a minute/,
  );
  expect(
    authFailureMessage(new ApiError(404, "Not found", {}), "school"),
  ).toMatch(/school code/);
});
