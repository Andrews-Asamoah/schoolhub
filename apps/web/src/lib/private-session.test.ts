import { describe, expect, it } from "vitest";
import { hasPendingPrivateDrafts } from "./private-session";
function storage(entries: Record<string, string>) {
  const keys=Object.keys(entries);
  return { length: keys.length, key: (i: number) => keys[i] ?? null, getItem: (key: string) => entries[key] ?? null };
}
describe("desktop logout draft protection", () => {
  it("blocks deletion of a restorable mark draft", () => {
    expect(hasPendingPrivateDrafts(storage({ "schoolhub-draft:synthetic": JSON.stringify({ at: Date.now(), value: { pupil: { value: "9", expectedMarks: null } } }) }))).toBe(true);
  });
  it("does not block on empty, expired or unrelated preferences", () => {
    expect(hasPendingPrivateDrafts(storage({
      "schoolhub-draft:empty": JSON.stringify({ at: Date.now(), value: {} }),
      "schoolhub-draft:expired": JSON.stringify({ at: 0, value: { pupil: 9 } }),
      "theme": "dark",
    }))).toBe(false);
  });
  it("lets storage failures reach the logout handler rather than falsely assuming work is saved", () => {
    expect(() => hasPendingPrivateDrafts({ length: 1, key: () => "schoolhub-draft:synthetic", getItem: () => { throw new Error("blocked"); } })).toThrow("blocked");
  });
});
