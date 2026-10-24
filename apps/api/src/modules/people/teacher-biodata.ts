/** Roles that may see a teacher's home address and emergency contact. */
export const BIODATA_PRIVATE_ROLES = ["owner", "admin", "headteacher"] as const;

export function canSeePrivateBiodata(role: string | undefined) {
  return (BIODATA_PRIVATE_ROLES as readonly string[]).includes(role ?? "");
}

export interface TeacherBiodataSource {
  id: string;
  teacherId: string;
  staffNumber: string | null;
  invitationEmail: string | null;
  firstName: string | null;
  lastName: string | null;
  qualification: string | null;
  specialization: string | null;
  experience: number | null;
  employmentType: string;
  hireDate: Date;
  contractEndDate: Date | null;
  isActive: boolean;
  department: { id: string; name: string };
  subjects: { subject: { id: string; name: string } }[];
  profile: {
    firstName: string;
    lastName: string;
    otherNames: string | null;
    phone: string | null;
    alternatePhone: string | null;
    gender: string | null;
    dateOfBirth: Date | null;
    nationality: string | null;
    residentialAddress: string | null;
    postalAddress: string | null;
    city: string | null;
    region: string | null;
    country: string | null;
    emergencyContactName: string | null;
    emergencyContactPhone: string | null;
    emergencyRelationship: string | null;
    user: { email: string; image: string | null } | null;
  } | null;
}

/**
 * The biodata sheet for one teacher. Pay is never included. Address and
 * emergency-contact details are only added for roles allowed to see them.
 */
export function toTeacherBiodata(teacher: TeacherBiodataSource, canSeePrivate: boolean) {
  const profile = teacher.profile;
  const biodata = {
    id: teacher.id,
    teacherId: teacher.teacherId,
    staffNumber: teacher.staffNumber,
    isActive: teacher.isActive,
    firstName: profile?.firstName ?? teacher.firstName ?? "",
    lastName: profile?.lastName ?? teacher.lastName ?? "",
    otherNames: profile?.otherNames ?? null,
    gender: profile?.gender ?? null,
    dateOfBirth: profile?.dateOfBirth ?? null,
    phone: profile?.phone ?? null,
    email: profile?.user?.email ?? teacher.invitationEmail ?? null,
    image: profile?.user?.image ?? null,
    department: teacher.department,
    qualification: teacher.qualification,
    specialization: teacher.specialization,
    experience: teacher.experience,
    employmentType: teacher.employmentType,
    hireDate: teacher.hireDate,
    contractEndDate: teacher.contractEndDate,
    subjects: teacher.subjects.map((row) => row.subject),
  };
  if (!canSeePrivate) return { ...biodata, private: null };
  return {
    ...biodata,
    private: {
      alternatePhone: profile?.alternatePhone ?? null,
      nationality: profile?.nationality ?? null,
      residentialAddress: profile?.residentialAddress ?? null,
      postalAddress: profile?.postalAddress ?? null,
      city: profile?.city ?? null,
      region: profile?.region ?? null,
      country: profile?.country ?? null,
      emergencyContactName: profile?.emergencyContactName ?? null,
      emergencyContactPhone: profile?.emergencyContactPhone ?? null,
      emergencyRelationship: profile?.emergencyRelationship ?? null,
    },
  };
}
