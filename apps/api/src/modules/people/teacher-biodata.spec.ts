import { describe, expect, it } from "vitest";
import { canSeePrivateBiodata, toTeacherBiodata, type TeacherBiodataSource } from "./teacher-biodata.js";

const teacher: TeacherBiodataSource = {
  id: "t1",
  teacherId: "TCH-001",
  staffNumber: "S-9",
  invitationEmail: "invite@school.test",
  firstName: "Old",
  lastName: "Name",
  qualification: "B.Ed",
  specialization: "Mathematics",
  experience: 6,
  employmentType: "FULL_TIME",
  hireDate: new Date("2022-09-01"),
  contractEndDate: null,
  isActive: true,
  department: { id: "d1", name: "JHS" },
  subjects: [{ subject: { id: "s1", name: "Mathematics" } }],
  profile: {
    firstName: "Ama",
    lastName: "Boateng",
    otherNames: "Serwaa",
    phone: "0244000111",
    alternatePhone: "0200000222",
    gender: "FEMALE",
    dateOfBirth: new Date("1990-04-02"),
    nationality: "Ghanaian",
    residentialAddress: "12 Palm St",
    postalAddress: "PO Box 1",
    city: "Accra",
    region: "Greater Accra",
    country: "Ghana",
    emergencyContactName: "Kojo Boateng",
    emergencyContactPhone: "0277000333",
    emergencyRelationship: "Brother",
    user: { email: "ama@school.test", image: "https://cdn.test/a.jpg" },
  },
};

describe("toTeacherBiodata", () => {
  it("gives managers the full sheet including address and emergency contact", () => {
    const sheet = toTeacherBiodata(teacher, true);
    expect(sheet.private).toMatchObject({ residentialAddress: "12 Palm St", emergencyContactName: "Kojo Boateng" });
    expect(sheet.subjects).toEqual([{ id: "s1", name: "Mathematics" }]);
  });
  it("leaves out address and emergency contact for everyone else", () => {
    const sheet = toTeacherBiodata(teacher, false);
    expect(sheet.private).toBeNull();
    expect(JSON.stringify(sheet)).not.toContain("Palm St");
    expect(JSON.stringify(sheet)).not.toContain("Kojo");
    expect(JSON.stringify(sheet)).not.toContain("0200000222");
  });
  it("never includes pay", () => {
    expect(JSON.stringify(toTeacherBiodata({ ...teacher, monthlySalary: 5000 } as TeacherBiodataSource, true))).not.toMatch(/salary/i);
  });
  it("prefers the profile name and login email, with fallbacks for invite-only teachers", () => {
    expect(toTeacherBiodata(teacher, false)).toMatchObject({ firstName: "Ama", email: "ama@school.test" });
    expect(toTeacherBiodata({ ...teacher, profile: null }, true)).toMatchObject({
      firstName: "Old",
      lastName: "Name",
      email: "invite@school.test",
      image: null,
      private: { residentialAddress: null },
    });
  });
});

describe("canSeePrivateBiodata", () => {
  it("is limited to the school's managers", () => {
    for (const role of ["owner", "admin", "headmistress"]) expect(canSeePrivateBiodata(role)).toBe(true);
    for (const role of ["teacher", "staff", "accountant", "student", "guardian", undefined]) expect(canSeePrivateBiodata(role)).toBe(false);
  });
});
