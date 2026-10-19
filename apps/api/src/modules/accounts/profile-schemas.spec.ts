import { describe, expect, it } from "vitest";
import { updateMyProfileSchema, updateSchoolSettingsSchema } from "@schoolhub/shared";

describe("updateSchoolSettingsSchema", () => {
  it("turns blank optional fields into null so they can be cleared", () => {
    const parsed = updateSchoolSettingsSchema.parse({ motto: "  ", website: "", phone: "" });
    expect(parsed.motto).toBeNull();
    expect(parsed.website).toBeNull();
    expect(parsed.phone).toBeNull();
  });
  it("leaves omitted fields untouched", () => {
    expect(updateSchoolSettingsSchema.parse({ name: "Wesley" })).toEqual({ name: "Wesley" });
  });
  it("adds https to a bare website and rejects other schemes", () => {
    expect(updateSchoolSettingsSchema.parse({ website: "wesley.edu.gh" }).website).toBe("https://wesley.edu.gh");
    expect(updateSchoolSettingsSchema.safeParse({ website: "javascript:alert(1)" }).success).toBe(false);
  });
  it("rejects a bad email, short name and malformed colour", () => {
    expect(updateSchoolSettingsSchema.safeParse({ email: "nope" }).success).toBe(false);
    expect(updateSchoolSettingsSchema.safeParse({ name: "A" }).success).toBe(false);
    expect(updateSchoolSettingsSchema.safeParse({ primaryColor: "blue" }).success).toBe(false);
  });
  it("does not accept the immutable identifiers", () => {
    const parsed = updateSchoolSettingsSchema.parse({ name: "Wesley", code: "X", subdomain: "x" });
    expect(parsed).toEqual({ name: "Wesley" });
  });
});

describe("updateMyProfileSchema", () => {
  it("does not accept email or role changes", () => {
    const parsed = updateMyProfileSchema.parse({ phone: "0244123456", email: "a@b.com", role: "owner" });
    expect(parsed).toEqual({ phone: "0244123456" });
  });
  it("clears a field with blank text and rejects a too-short phone", () => {
    expect(updateMyProfileSchema.parse({ city: "" }).city).toBeNull();
    expect(updateMyProfileSchema.safeParse({ phone: "12" }).success).toBe(false);
  });
});
