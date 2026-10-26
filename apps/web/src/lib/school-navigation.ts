import {
  ShieldCheck,
  Activity,
  AlertCircle,
  BadgeDollarSign,
  BadgeCheck,
  Bell,
  BookOpen,
  ChartNoAxesCombined,
  CalendarDays,
  Clock3,
  BookOpenCheck,
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
  ReceiptText,
  School,
  Settings2,
  ShieldQuestion,
  TrendingDown,
  UserRound,
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
      {
        id: "assignments",
        label: "Assignments",
        icon: FileText,
        description: "Homework, coursework, and task submissions.",
        section: "Academics",
        apiStatus: "available",
      },
    ],
  },
  {
    label: "Family",
    items: [
      {
        id: "guardian-attendance",
        label: "Children's attendance",
        icon: Activity,
        description: "Review attendance summaries and recent register entries for linked children.",
        section: "Family",
        apiStatus: "available",
      },
      {
        id: "guardian-timetable",
        label: "Children's timetable",
        icon: Clock3,
        description: "View the weekly class timetable for each linked child.",
        section: "Family",
        apiStatus: "available",
      },
      {
        id: "guardian-reports",
        label: "Academic reports",
        icon: BookOpenCheck,
        description: "Read official academic reports published for linked children.",
        section: "Family",
        apiStatus: "available",
      },
      {
        id: "guardian-fees",
        label: "Ward fees",
        icon: WalletCards,
        description: "Review fee balances and payment history for linked children.",
        section: "Family",
        apiStatus: "available",
      },
      {
        id: "guardian-notices",
        label: "School notices",
        icon: Bell,
        description: "Read school announcements available to your guardian account.",
        section: "Family",
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
        apiStatus: "available",
      },
      {
        id: "classmates",
        label: "Classmates",
        icon: UsersRound,
        description: "Class roster, peer learners, and student leaders.",
        section: "School operations",
        apiStatus: "available",
      },
      {
        id: "documents",
        label: "Documents",
        icon: FileText,
        description: "School-wide documents, policies, calendars, and shared resources.",
        section: "School operations",
        apiStatus: "available",
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
        id: "concessions",
        label: "Scholarships & discounts",
        icon: BadgeCheck,
        description: "Manage sibling discount rules and student-specific scholarships applied automatically to new bills.",
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
      {
        id: "fee-reminders",
        label: "Fee reminders",
        icon: Bell,
        description: "Schedule, preview and send fee reminders to guardian portal accounts.",
        section: "Finance",
        apiStatus: "available",
      },
      {
        id: "outstanding",
        label: "Outstanding fees",
        icon: AlertCircle,
        description: "Review unpaid and overdue student bills and follow-up priorities.",
        section: "Finance",
        apiStatus: "available",
      },
      {
        id: "finance-audit",
        label: "Audit trail",
        icon: ShieldCheck,
        description: "Who recorded, reversed or changed financial records, and when.",
        section: "Finance",
        apiStatus: "available",
      },
      {
        id: "student-statements",
        label: "Student statements",
        icon: ReceiptText,
        description: "Review a student's dated account activity, running balance and arrears.",
        section: "Finance",
        apiStatus: "available",
      },
      {
        id: "term-end-review",
        label: "Term-end review",
        icon: ClipboardCheck,
        description: "Review earlier-term arrears and track balances owed by former students.",
        section: "Finance",
        apiStatus: "available",
      },
      {
        id: "finance-reports",
        label: "Finance reports",
        icon: ChartNoAxesCombined,
        description: "Review revenue, receivables, expenses, payroll and export finance summaries.",
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
        apiStatus: "available",
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
        apiStatus: "available",
      },
      {
        id: "messages",
        label: "Messages",
        icon: MessageSquare,
        description: "Private school-scoped messages to permitted staff, families, and learners.",
        section: "Communication",
        apiStatus: "available",
      },
      {
        id: "notifications",
        label: "Notification history",
        icon: Bell,
        description: "Search, filter, and review your in-app notification history.",
        section: "Communication",
        apiStatus: "available",
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
        id: "signatures",
        label: "Staff signatures",
        icon: BadgeCheck,
        description: "Upload and manage authorised staff signatures for future school forms and printouts.",
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

// Not listed in any sidebar (see getSchoolNavGroupsForRole): reached from the header account menu.
schoolNavGroups.push({
  label: "Account",
  items: [
    {
      id: "profile",
      label: "My profile",
      icon: UserRound,
      description: "Your photo and basic contact details.",
      section: "Account",
      apiStatus: "available",
    },
  ],
});

export const schoolNavItems = schoolNavGroups.flatMap((group) => group.items);

const rolePages: Record<string, string[]> = {
  teacher: [
    "students",
    "classes",
    "subjects",
    "timetable",
    "assessments",
    "attendance",
    "reports",
    "documents",
    "messages",
    "notifications",
    "clubs",
  ],
  accountant: [
    "accountant-portal",
    "concessions",
    "finance-reports",
    "student-statements",
    "term-end-review",
    "finance-audit",
    "outstanding",
    "admissions",
    "fees",
    "payments",
    "invoices",
    "expenses",
    "payroll",
    "fee-reminders",
    "inventory",
    "students",
    "documents",
    "messages",
    "notifications",
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
    "houses",
    "clubs",
    "documents",
    "messages",
    "notifications",
  ],
  student: [
    "subjects",
    "timetable",
    "assessments",
    "assignments",
    "attendance",
    "classmates",
    "houses",
    "clubs",
    "announcements",
    "messages",
    "notifications",
  ],
  guardian: ["guardian-attendance", "guardian-timetable", "guardian-reports", "guardian-notices", "guardian-fees", "messages", "notifications"],
};

/**
 * The portal page that is a role's own home screen. Teachers have none: their
 * Overview and the Students, Classes, Subjects and Timetable pages are their workspace.
 */
const ownPortalByRole: Record<string, string> = {
  accountant: "accountant-portal",
  guardian: "dashboard",
};

/**
 * The "Portals" directory is not shown in anyone's sidebar. Administrators
 * and general staff do not need it, and portal users reach their own portal
 * through {@link getOwnPortalItem} instead of a list of every portal.
 */
/**
 * Pages made for students only. Roles with no page list of their own (owner,
 * administrator, headteacher) see everything else, so these are left out of
 * their sidebar.
 */
const studentOnlyPages = ["classmates"];

export function getSchoolNavGroupsForRole(role?: string) {
  const allowedPages = rolePages[role ?? ""];
  const groups = schoolNavGroups.filter((group) => group.label !== "Portals" && group.label !== "Account");
  if (!allowedPages) {
    return groups
      .map((group) => ({ ...group, items: group.items.filter((item) => !studentOnlyPages.includes(item.id)) }))
      .filter((group) => group.items.length > 0);
  }

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

/**
 * Whether a role may open a page. Management roles (no entry in rolePages) may
 * open every page, and account pages such as "My profile" are open to everyone.
 */
export function canRoleAccessPage(role: string | null | undefined, pageId: string) {
  const item = schoolNavItems.find((entry) => entry.id === pageId);
  if (item?.section === "Account") return true;
  const allowed = rolePages[role ?? ""];
  return !allowed || allowed.includes(pageId);
}

export function getSchoolNavItem(id: string) {
  return schoolNavItems.find((item) => item.id === id);
}
