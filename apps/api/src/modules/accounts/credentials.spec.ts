import { describe, expect, it } from "vitest";
import { verifyPassword } from "better-auth/crypto";
import { changePasswordSchema, guardianEmailDomain, passwordSchema, studentLoginEmail } from "@schoolhub/shared";
import { CredentialsService, DEFAULT_PASSWORDS, newGuardianLoginEmail } from "./credentials.service.js";
import { roleForStaffType } from "./staff-roles.js";

describe("default passwords", () => {
  it("uses the documented default for each role", () => {
    expect(DEFAULT_PASSWORDS.student).toBe("Student@123");
    expect(DEFAULT_PASSWORDS.guardian).toBe("Guardian@123");
    expect(DEFAULT_PASSWORDS.teacher).toBe("Teacher@123");
    expect(DEFAULT_PASSWORDS.accountant).toBe("Accountant@123");
    expect(DEFAULT_PASSWORDS.headteacher).toBe("Headteacher@123");
    expect(DEFAULT_PASSWORDS.admin).toBe("Admin@123");
  });

  it("hashes with a fresh salt and verifies against the role default", async () => {
    const service = new CredentialsService();
    const a = await service.prepare("student");
    const b = await service.prepare("student");
    expect(a.passwordHash).not.toBe(b.passwordHash);
    expect(a.passwordHash).not.toContain("Student@123");
    expect(await verifyPassword({ hash: a.passwordHash, password: "Student@123" })).toBe(true);
    expect(await verifyPassword({ hash: a.passwordHash, password: "Guardian@123" })).toBe(false);
  });

  it("never lets a default be kept as the new password", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "Student@123",
      newPassword: "Student@123",
    });
    expect(result.success).toBe(false);
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
