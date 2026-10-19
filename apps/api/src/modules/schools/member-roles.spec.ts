import { describe, expect, it } from "vitest";
import { checkRoleChange } from "./member-roles.js";

const teacher = { role: "teacher", roles: [] as string[] };

describe("checkRoleChange", () => {
  it("lets an admin give a teacher more everyday roles and stores only the extras", () => {
    const result = checkRoleChange({ actorRole: "admin", target: teacher, requested: ["teacher", "accountant", "staff"] });
    expect(result).toEqual({ ok: true, roles: ["accountant", "staff"] });
  });
  it("removes an extra role when it is left out", () => {
    const result = checkRoleChange({
      actorRole: "admin",
      target: { role: "teacher", roles: ["accountant"] },
      requested: ["teacher"],
    });
    expect(result).toEqual({ ok: true, roles: [] });
  });
  it("never drops the primary role", () => {
    const result = checkRoleChange({ actorRole: "owner", target: teacher, requested: ["accountant"] });
    expect(result).toMatchObject({ ok: false, kind: "bad-request" });
  });
  it("never grants owner as an extra role", () => {
    const result = checkRoleChange({ actorRole: "owner", target: teacher, requested: ["teacher", "owner"] });
    expect(result).toMatchObject({ ok: false, kind: "bad-request" });
  });
  it("only the owner may grant administrator or headmistress", () => {
    for (const role of ["admin", "headmistress"]) {
      expect(checkRoleChange({ actorRole: "admin", target: teacher, requested: ["teacher", role] })).toMatchObject({
        ok: false,
        kind: "forbidden",
      });
      expect(checkRoleChange({ actorRole: "headmistress", target: teacher, requested: ["teacher", role] })).toMatchObject({
        ok: false,
        kind: "forbidden",
      });
      expect(checkRoleChange({ actorRole: "owner", target: teacher, requested: ["teacher", role] })).toEqual({
        ok: true,
        roles: [role],
      });
    }
  });
  it("only the owner may take administrator access away", () => {
    const target = { role: "teacher", roles: ["admin"] };
    expect(checkRoleChange({ actorRole: "admin", target, requested: ["teacher"] })).toMatchObject({
      ok: false,
      kind: "forbidden",
    });
    expect(checkRoleChange({ actorRole: "owner", target, requested: ["teacher"] })).toEqual({ ok: true, roles: [] });
  });
  it("leaves management roles alone when they are unchanged", () => {
    const target = { role: "admin", roles: ["teacher"] };
    expect(checkRoleChange({ actorRole: "admin", target, requested: ["admin", "teacher", "staff"] })).toEqual({
      ok: true,
      roles: ["teacher", "staff"],
    });
  });
});
