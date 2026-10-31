import { describe, expect, it, vi } from "vitest";
import { AssetsService } from "./assets.service.js";

describe("managed person photos", () => {
  for (const kind of ["teacher", "student"]) {
    it(`rejects a missing or cross-school ${kind} before uploading`, async () => {
      const findFirst = vi.fn().mockResolvedValue(null);
      const prisma = { client: { [kind]: { findFirst } } };
      const service = new AssetsService(prisma as never, {} as never, {} as never, {} as never, {} as never);
      const upload = vi.spyOn(service, "setAvatar");
      await expect(service.setPersonAvatar({ id: "school-a" } as never, kind, "other-person", undefined, {} as never)).rejects.toThrow("Person not found");
      expect(findFirst).toHaveBeenCalledWith({ where: { id: "other-person", schoolId: "school-a", deletedAt: null }, select: { profileId: true } });
      expect(upload).not.toHaveBeenCalled();
    });
  }
  it("rejects unsupported person kinds", async () => {
    const service = new AssetsService({} as never, {} as never, {} as never, {} as never, {} as never);
    await expect(service.setPersonAvatar({ id: "school-a" } as never, "guardian", "id", undefined, {} as never)).rejects.toThrow("Invalid photo target");
  });
});
