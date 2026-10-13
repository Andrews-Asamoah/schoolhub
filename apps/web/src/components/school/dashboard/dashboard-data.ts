import {
  ClipboardCheck,
  GraduationCap,
  UsersRound,
  WalletCards,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const weeklyAttendance = [
  { day: "Mon", value: 82 },
  { day: "Tue", value: 94 },
  { day: "Wed", value: 76 },
  { day: "Thu", value: 100 },
  { day: "Fri", value: 88 },
];

export const dashboardMetrics: {
  label: string;
  value: string;
  change: string;
  trend: "up" | "down";
  detail: string;
  icon: LucideIcon;
  iconClass: string;
}[] = [
  {
    label: "Total students",
    value: "1,284",
    change: "+8.2%",
    trend: "up",
    detail: "vs. last term",
    icon: UsersRound,
    iconClass: "bg-blue-50 text-blue-600",
  },
  {
    label: "Teaching staff",
    value: "68",
    change: "+2",
    trend: "up",
    detail: "new this term",
    icon: GraduationCap,
    iconClass: "bg-violet-50 text-violet-600",
  },
  {
    label: "Attendance today",
    value: "94.6%",
    change: "−1.4%",
    trend: "down",
    detail: "vs. yesterday",
    icon: ClipboardCheck,
    iconClass: "bg-emerald-50 text-emerald-600",
  },
  {
    label: "Fees collected",
    value: "GHS 84,250",
    change: "+12.5%",
    trend: "up",
    detail: "this term",
    icon: WalletCards,
    iconClass: "bg-amber-50 text-amber-600",
  },
];

export const recentActivities: {
  icon: LucideIcon;
  color: string;
  title: string;
  detail: string;
  time: string;
}[] = [
  {
    icon: UsersRound,
    color: "bg-blue-50 text-blue-600",
    title: "New student admitted",
    detail: "Ama Serwaa joined Primary 4",
    time: "10:42 AM",
  },
  {
    icon: WalletCards,
    color: "bg-emerald-50 text-emerald-600",
    title: "Fee payment received",
    detail: "Term 2 tuition · GHS 1,250",
    time: "9:18 AM",
  },
  {
    icon: ClipboardCheck,
    color: "bg-violet-50 text-violet-600",
    title: "Attendance completed",
    detail: "JHS 2A · 31 of 32 students",
    time: "8:05 AM",
  },
];
