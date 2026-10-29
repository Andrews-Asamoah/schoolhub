import { describe, expect, it } from "vitest";
import { verifyPassword } from "better-auth/crypto";
import { changePasswordSchema, guardianEmailDomain, passwordSchema, studentLoginEmail } from "@schoolhub/shared";
import { CredentialsService, generateTemporaryPassword, newGuardianLoginEmail } from "./credentials.service.js";
import {
  assertPasswordChangeNotPending,
  isTemporaryPasswordExpired,
  temporaryPasswordExpiry,
} from "../../common/guards/password-change.js";
import { roleForStaffType } from "./staff-roles.js";

describe("temporary passwords", () => {
  const roles = ["owner", "admin", "headteacher", "teacher", "accountant", "staff", "student", "guardian"] as const;

  it.each(roles)("issues a random, policy-compliant password for %s", async (role) => {
    const service = new CredentialsService();
    const a = await service.prepare(role);
    const b = await service.prepare(role);
    expect(a.temporaryPassword).not.toBe(b.temporaryPassword);
    expect(a.passwordHash).not.toBe(b.passwordHash);
    expect(passwordSchema.safeParse(a.temporaryPassword).success).toBe(true);
    expect(a.passwordHash).not.toContain(a.temporaryPassword);
    expect(await verifyPassword({ hash: a.passwordHash, password: a.temporaryPassword })).toBe(true);
    expect(await verifyPassword({ hash: a.passwordHash, password: b.temporaryPassword })).toBe(false);
  });

  it("never reproduces a role-based default like Student@123", async () => {
    const service = new CredentialsService();
    for (const role of roles) {
      const { temporaryPassword } = await service.prepare(role);
      const label = role.charAt(0).toUpperCase() + role.slice(1);
      expect(temporaryPassword).not.toBe(`${label}@123`);
    }
  });

  it("gives students and guardians 12 easy-to-copy letters and digits", () => {
    for (let i = 0; i < 50; i += 1) {
      expect(generateTemporaryPassword(12, { symbols: false })).toMatch(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z0-9]{12}$/);
    }
  });

  it("keeps ambiguous characters out of generated passwords", () => {
    for (let i = 0; i < 50; i += 1) expect(generateTemporaryPassword()).not.toMatch(/[lIO01]/);
  });

  it("never lets a temporary password be kept as the new password", async () => {
    const { temporaryPassword } = await new CredentialsService().prepare("student");
    const result = changePasswordSchema.safeParse({ currentPassword: temporaryPassword, newPassword: temporaryPassword });
    expect(result.success).toBe(false);
  });
});

describe("temporary password expiry", () => {
  const now = new Date("2026-10-28T10:00:00Z");

  it("expires seven days after issue", () => {
    expect(temporaryPasswordExpiry(now).toISOString()).toBe("2026-11-04T10:00:00.000Z");
  });

  it("blocks an expired, unused temporary password with a distinct error", () => {
    const user = { mustChangePassword: true, temporaryPasswordExpiresAt: new Date("2026-10-28T09:59:59Z") };
    expect(() => assertPasswordChangeNotPending(user, now)).toThrow(/expired/i);
    expect(isTemporaryPasswordExpired(user, now)).toBe(true);
  });

  it("still asks for a change while the password is valid", () => {
    const user = { mustChangePassword: true, temporaryPasswordExpiresAt: temporaryPasswordExpiry(now) };
    expect(() => assertPasswordChangeNotPending(user, now)).toThrow(/change your temporary password/i);
    expect(isTemporaryPasswordExpired(user, now)).toBe(false);
  });

  it("ignores expiry once the owner has chosen their own password", () => {
    const user = { mustChangePassword: false, temporaryPasswordExpiresAt: new Date("2020-01-01") };
    expect(isTemporaryPasswordExpired(user, now)).toBe(false);
    expect(() => assertPasswordChangeNotPending(user, now)).not.toThrow();
  });
});

describe("password policy", () => {
  it.each(["short1A", "alllowercase123", "ALLUPPERCASE123", "NoDigitsHereAtAll"])(
    "rejects %s",
    (value) => expect(passwordSchema.safeParse(value).success).toBe(false),
  );
  it("accepts a strong password", () => {
    expect(passwordSchema.safeParse("Sunrise2026Kumasi").success).toBe(true);
  });
});

describe("login identifiers and roles", () => {
  it("builds a deterministic student login email", () => {
    expect(studentLoginEmail(" ABC260001 ", "Abc-School")).toBe(
      "abc260001@students.abc-school.schoolhub.gh",
    );
  });
  it("generates a readable guardian sign-in email on the school's own domain", () => {
    expect(newGuardianLoginEmail("Ama Mensah", "hdm.edu.gh")).toMatch(
      /^amensah-g\d{4}@hdm\.edu\.gh$/,
    );
  });
  it("uses the school's own email domain for guardian logins", () => {
    expect(guardianEmailDomain("info@hdm.edu.gh", "hdm")).toBe("hdm.edu.gh");
  });
  it("falls back to the school's SchoolHub domain for public email providers", () => {
    expect(guardianEmailDomain("info@gmail.com", "heavens-dew")).toBe(
      "heavens-dew.schoolhub.gh",
    );
  });

  it("maps staff types to school roles", () => {
    expect(roleForStaffType("ACCOUNTANT")).toBe("accountant");
    expect(roleForStaffType("HEADTEACHER")).toBe("headteacher");
    expect(roleForStaffType("ADMIN")).toBe("admin");
    expect(roleForStaffType("DRIVER")).toBe("staff");
  });
});

describe("random temporary passwords (privileged accounts)", () => {
  it("always satisfies the shared password policy and is not guessable", async () => {
    const { generateTemporaryPassword } = await import("./credentials.service.js");
    const seen = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      const password = generateTemporaryPassword();
      expect(passwordSchema.safeParse(password).success).toBe(true);
      expect(password).toHaveLength(16);
      seen.add(password);
    }
    expect(seen.size).toBe(200);
  });

  it("prepareRandom returns a hash that verifies only against its own password", async () => {
    const service = new CredentialsService();
    const a = await service.prepareRandom();
    const b = await service.prepareRandom();
    expect(a.temporaryPassword).not.toBe(b.temporaryPassword);
    expect(await verifyPassword({ hash: a.passwordHash, password: a.temporaryPassword })).toBe(true);
    expect(await verifyPassword({ hash: a.passwordHash, password: "Admin@123" })).toBe(false);
  });
});
