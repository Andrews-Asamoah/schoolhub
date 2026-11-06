import { describe, expect, it, vi } from "vitest";
import { AssessmentEntryService } from "./assessment-entry.service.js";

describe("assessment roster names", () => {
  it("includes other names in the pupil name and keeps surname ordering", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { student: { id: "s1", admissionNumber: "A1", profile: { firstName: "Ama", otherNames: "Akua", lastName: "Mensah" } } },
      { student: { id: "s2", admissionNumber: "A2", profile: { firstName: "Esi", otherNames: null, lastName: "Boateng" } } },
    ]);
    const service = new AssessmentEntryService({ client: { enrollment: { findMany } } } as never, {} as never);
    const roster = await service.loadRoster("class", "term");
    expect(roster.map((student) => student.name)).toEqual(["Esi Boateng", "Ama Akua Mensah"]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: { student: { select: {
        id: true, admissionNumber: true,
        profile: { select: { firstName: true, otherNames: true, lastName: true } },
      } } },
    }));
  });
});
