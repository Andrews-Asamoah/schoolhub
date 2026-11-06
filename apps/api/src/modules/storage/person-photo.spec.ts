import { describe, expect, it, vi } from "vitest";
vi.mock("../../env.js", () => ({ env: {} }));

import type { ExecutionContext } from "@nestjs/common";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { AssetsService } from "./assets.service.js";
import { AssetsController } from "./assets.controller.js";

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

  it("matches batch photos by student ID or admission number and rejects duplicate student uploads", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: "student-1", studentId: "ABC001", admissionNumber: "AD-001" },
    ]);
    const service = new AssetsService(
      { client: { student: { findMany } } } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const setPersonAvatar = vi.spyOn(service, "setPersonAvatar").mockResolvedValue({ image: "stored" } as never);
    const file = (originalname: string) => ({ originalname, buffer: Buffer.from("image") }) as Express.Multer.File;

    const result = await service.setStudentAvatars(
      { id: "school-a" } as never,
      [file("ABC001.jpg"), file("AD-001.png"), file("UNKNOWN.png")],
      {} as never,
    );

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ schoolId: "school-a", deletedAt: null }),
    }));
    expect(setPersonAvatar).toHaveBeenCalledTimes(1);
    expect(result.results).toEqual([
      { fileName: "ABC001.jpg", identifier: "ABC001", studentId: "ABC001", status: "uploaded" },
      { fileName: "AD-001.png", identifier: "AD-001", studentId: "ABC001", status: "failed", message: "A photo for this student was already included in this upload." },
      { fileName: "UNKNOWN.png", identifier: "UNKNOWN", status: "failed", message: "No active student matches this student ID or admission number." },
    ]);
  });

  it("denies students access to profile-photo upload and removal routes", () => {
    for (const methodName of ["uploadAvatar", "removeAvatar", "uploadStudentAvatars"]) {
      const handler = Object.getOwnPropertyDescriptor(AssetsController.prototype, methodName)?.value;
      const roles = Reflect.getMetadata("roles", handler) as string[];
      expect(roles).not.toContain("student");
      const guard = new RolesGuard({ getAllAndOverride: () => roles } as never);
      const request = { session: { user: { role: "user" } }, membership: { role: "student" }, schoolRole: "student" };
      const context = {
        getHandler: () => handler,
        getClass: () => AssetsController,
        switchToHttp: () => ({ getRequest: () => request }),
      } as unknown as ExecutionContext;
      expect(() => guard.canActivate(context)).toThrow();
    }
  });
});
