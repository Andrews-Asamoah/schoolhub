import {
  Activity,
  BadgeDollarSign,
  Bell,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  FileBarChart,
  FileText,
  GraduationCap,
  HeartHandshake,
  House,
  Home,
  Megaphone,
  MessageSquare,
  Package,
  Receipt,
  School,
  Settings2,
  ShieldQuestion,
  TrendingDown,
  UsersRound,
  WalletCards,
  type LucideIcon,
} from "lucide-react";

export interface SchoolNavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  description: string;
  section: string;
  apiStatus: "available" | "planned";
}

export interface SchoolNavGroup {
  label: string;
  items: SchoolNavItem[];
}

export const schoolNavGroups: SchoolNavGroup[] = [
  {
    label: "People",
    items: [
      {
        id: "students",
        label: "Students",
        icon: UsersRound,
        description:
          "Student identity, admissions, profile status, and current class context.",
        section: "People",
        apiStatus: "available",
      },
      {
        id: "admissions",
        label: "Admissions",
        icon: ClipboardCheck,
        description:
          "Open an intake, review applications, run entrance exams, and admit successful applicants with portal logins.",
        section: "People",
        apiStatus: "available",
      },
      {
        id: "enrollments",
        label: "Enrollments",
        icon: GraduationCap,
        description:
          "Place students into classes by academic year and term, and review historical rosters.",
        section: "People",
        apiStatus: "available",
      },
      {
        id: "teachers",
        label: "Teachers",
        icon: GraduationCap,
        description:
          "Teaching personnel, qualifications, departments, and teacher records.",
        section: "People",
        apiStatus: "available",
      },
      {
        id: "staff",
        label: "Staff",
        icon: UsersRound,
        description: "Non-teaching employees and school operations personnel.",
        section: "People",
        apiStatus: "available",
      },
      {
        id: "guardians",
        label: "Guardians",
        icon: HeartHandshake,
        description:
          "Family contacts, relationship details, and linked student records.",
        section: "People",
        apiStatus: "available",
      },
    ],
  },
  {
    label: "Academics",
    items: [
      {
        id: "classes",
        label: "Classes",
        icon: School,
        description: "Class lists, year placement, teachers, and capacity.",
        section: "Academics",
        apiStatus: "available",
      },
      {
        id: "subjects",
        label: "Subjects",
        icon: BookOpen,
        description: "Subject catalogue and weekly period requirements.",
        section: "Academics",
        apiStatus: "available",
      },
      {
        id: "academic-years",
        label: "Academic years",
        icon: CalendarDays,
        description: "School years, terms, and the active academic calendar.",
        section: "Academics",
        apiStatus: "available",
      },
      {
        id: "timetable",
        label: "Timetable",
        icon: CalendarDays,
        description: "Lesson periods, rooms, and class schedules.",
        section: "Academics",
        apiStatus: "available",
      },
      {
        id: "assessments",
        label: "Assessments",
        icon: ClipboardCheck,
        description: "Grading templates, score entry, and student reports.",
        section: "Academics",
        apiStatus: "available",
      },
    ],
  },
  {
    label: "School operations",
    items: [
      {
        id: "attendance",
        label: "Attendance",
        icon: Activity,
        description: "Record and review daily attendance by class.",
        section: "School operations",
        apiStatus: "available",
      },
      {
        id: "inventory",
        label: "Inventory",
        icon: Package,
        description: "Track school supplies, stock levels, and transactions.",
        section: "School operations",
        apiStatus: "available",
      },
      {
        id: "houses",
        label: "Houses",
        icon: House,
        description:
          "Manage permanent school houses, their colors, mottos, and lead teachers.",
        section: "School operations",
        apiStatus: "available",
      },
      {
        id: "clubs",
        label: "Clubs",
        icon: Home,
        description: "Student clubs, memberships, and activities.",
        section: "School operations",
        apiStatus: "planned",
      },
      {
        id: "documents",
        label: "Documents",
        icon: FileText,
        description: "School and student documents in one place.",
        section: "School operations",
        apiStatus: "planned",
      },
    ],
  },
  {
    label: "Finance",
    items: [
      {
        id: "fees",
        label: "Fee structures",
        icon: WalletCards,
        description: "Fee schedules and class-specific charges.",
        section: "Finance",
        apiStatus: "available",
      },
      {
        id: "payments",
        label: "Payments",
        icon: BadgeDollarSign,
        description: "Record fee payments and review transaction history.",
        section: "Finance",
        apiStatus: "available",
      },
      {
        id: "invoices",
        label: "Invoices & billing",
        icon: Receipt,
        description: "Issue term fees, student bills, and manage receivables.",
        section: "Finance",
        apiStatus: "available",
      },
      {
        id: "expenses",
        label: "Expenses",
        icon: TrendingDown,
        description: "Track school operational expenditures and vouchers.",
        section: "Finance",
        apiStatus: "available",
      },
      {
        id: "payroll",
        label: "Payroll",
        icon: BadgeDollarSign,
        description: "Staff payroll periods, approvals, and payslips.",
        section: "Finance",
        apiStatus: "available",
      },
    ],
  },
  {
    label: "Insights",
    items: [
      {
        id: "reports",
        label: "Reports",
        icon: FileBarChart,
        description: "School performance, enrollment, and attendance insights.",
        section: "Insights",
        apiStatus: "planned",
      },
    ],
  },
  {
    label: "Communication",
    items: [
      {
        id: "announcements",
        label: "Announcements",
        icon: Megaphone,
        description: "School-wide notices and targeted updates.",
        section: "Communication",
        apiStatus: "planned",
      },
      {
        id: "messages",
        label: "Messages",
        icon: MessageSquare,
        description: "School communications with families and staff.",
        section: "Communication",
        apiStatus: "planned",
      },
      {
        id: "notifications",
        label: "Notifications",
        icon: Bell,
        description: "In-app alerts and delivery history.",
        section: "Communication",
        apiStatus: "planned",
      },
    ],
  },
  {
    label: "Portals",
    items: [
      {
        id: "teacher-portal",
        label: "Teacher portal",
        icon: GraduationCap,
        description:
          "Teacher workspace for classes, attendance, grading, remarks, and schedule.",
        section: "Portals",
        apiStatus: "available",
      },
      {
        id: "accountant-portal",
        label: "Accountant portal",
        icon: BadgeDollarSign,
        description:
          "Financial hub for revenue, invoicing, fee collections, expenses, and payroll.",
        section: "Portals",
        apiStatus: "available",
      },
      {
        id: "guardian-portal",
        label: "Parent / Guardian portal",
        icon: HeartHandshake,
        description:
          "Family hub for monitoring children's academic progress, attendance, and fee payments.",
        section: "Portals",
        apiStatus: "available",
      },
      {
        id: "student-portal",
        label: "Student portal",
        icon: School,
        description:
          "Student learning dashboard for timetable, coursework, grades, classmates, and clubs.",
        section: "Portals",
        apiStatus: "available",
      },
    ],
  },
  {
    label: "Administration",
    items: [
      {
        id: "team",
        label: "Team & roles",
        icon: UsersRound,
        description:
          "Manage school accounts and the roles each person can use.",
        section: "Administration",
        apiStatus: "available",
      },
      {
        id: "settings",
        label: "School settings",
        icon: Settings2,
        description: "School profile and workspace preferences.",
        section: "Administration",
        apiStatus: "available",
      },
      {
        id: "support",
        label: "Support",
        icon: ShieldQuestion,
        description: "Get help and follow up on school support requests.",
        section: "Administration",
        apiStatus: "available",
      },
    ],
  },
];

export const schoolNavItems = schoolNavGroups.flatMap((group) => group.items);

const rolePages: Record<string, string[]> = {
  teacher: [
    "teacher-portal",
    "students",
    "classes",
    "subjects",
    "timetable",
    "assessments",
    "attendance",
    "reports",
  ],
  accountant: [
    "accountant-portal",
    "admissions",
    "fees",
    "payments",
    "invoices",
    "expenses",
    "payroll",
    "inventory",
    "students",
    "reports",
  ],
  staff: [
    "students",
    "admissions",
    "enrollments",
    "teachers",
    "staff",
    "guardians",
    "attendance",
    "inventory",
    "clubs",
    "documents",
  ],
  student: ["student-portal", "timetable"],
  guardian: ["guardian-portal"],
};

/** The one portal page that is each role's own home screen. */
const ownPortalByRole: Record<string, string> = {
  teacher: "teacher-portal",
  accountant: "accountant-portal",
  guardian: "guardian-portal",
  student: "student-portal",
};

/**
 * The "Portals" directory is not shown in anyone's sidebar. Administrators
 * and general staff do not need it, and portal users reach their own portal
 * through {@link getOwnPortalItem} instead of a list of every portal.
 */
export function getSchoolNavGroupsForRole(role?: string) {
  const allowedPages = rolePages[role ?? ""];
  const groups = schoolNavGroups.filter((group) => group.label !== "Portals");
  if (!allowedPages) return groups;

  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => allowedPages.includes(item.id)),
    }))
    .filter((group) => group.items.length > 0);
}

/** A portal user's own portal link (undefined for admins and general staff). */
export function getOwnPortalItem(role?: string) {
  const id = ownPortalByRole[role ?? ""];
  return id ? schoolNavItems.find((item) => item.id === id) : undefined;
}

export function getSchoolNavItem(id: string) {
  return schoolNavItems.find((item) => item.id === id);
}
