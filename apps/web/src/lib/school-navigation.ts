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
  Home,
  Megaphone,
  MessageSquare,
  Package,
  School,
  Settings2,
  ShieldQuestion,
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
        description: "Admissions, student profiles, class placement, and family details.",
        section: "People",
        apiStatus: "available",
      },
      {
        id: "teachers",
        label: "Teachers",
        icon: GraduationCap,
        description: "Teacher profiles, teaching assignments, and class responsibilities.",
        section: "People",
        apiStatus: "planned",
      },
      {
        id: "staff",
        label: "Staff",
        icon: UsersRound,
        description: "Manage non-teaching staff and school operations personnel.",
        section: "People",
        apiStatus: "planned",
      },
      {
        id: "guardians",
        label: "Guardians",
        icon: HeartHandshake,
        description: "Family contacts and their linked student records.",
        section: "People",
        apiStatus: "planned",
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
        apiStatus: "planned",
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
        apiStatus: "planned",
      },
      {
        id: "clubs",
        label: "Clubs & houses",
        icon: Home,
        description: "Student clubs, houses, memberships, and activities.",
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
        id: "payroll",
        label: "Payroll",
        icon: BadgeDollarSign,
        description: "Staff payroll periods, approvals, and payslips.",
        section: "Finance",
        apiStatus: "planned",
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
        description: "A teacher-focused view of classes, attendance, and assessments.",
        section: "Portals",
        apiStatus: "planned",
      },
      {
        id: "student-portal",
        label: "Student portal",
        icon: School,
        description: "A student view of timetable, attendance, and academic progress.",
        section: "Portals",
        apiStatus: "planned",
      },
      {
        id: "guardian-portal",
        label: "Guardian portal",
        icon: HeartHandshake,
        description: "A family view of linked students, notices, and school updates.",
        section: "Portals",
        apiStatus: "planned",
      },
    ],
  },
  {
    label: "Administration",
    items: [
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
        apiStatus: "planned",
      },
    ],
  },
];

export const schoolNavItems = schoolNavGroups.flatMap((group) => group.items);

export function getSchoolNavItem(id: string) {
  return schoolNavItems.find((item) => item.id === id);
}
