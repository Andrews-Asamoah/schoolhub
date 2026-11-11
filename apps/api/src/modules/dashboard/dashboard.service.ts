import { Prisma } from "@prisma/client";
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";
import { FINANCE_READ_ROLES, FINANCE_SUMMARY_ROLES, isFinancePayrollExportRole } from "../finance/finance.permissions.js";

const FINANCE_SUMMARY_ROLE_SET = new Set<string>(FINANCE_SUMMARY_ROLES);
const sumMoney = <T>(rows: T[], value: (row: T) => Prisma.Decimal | string | number) =>
  rows.reduce((total, row) => total.plus(value(row)), new Prisma.Decimal(0)).toDecimalPlaces(2).toNumber();
const FINANCE_DETAIL_ROLE_SET = new Set<string>(FINANCE_READ_ROLES);

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getAnalytics(schoolId: string, role: string | undefined, requestedMonths?: number) {
    const months = [3, 6, 12].includes(Number(requestedMonths)) ? Number(requestedMonths) : 6;
    const now = new Date();
    const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const firstMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months + 1, 1));
    const canViewFinance = FINANCE_SUMMARY_ROLE_SET.has(role ?? "");
    const canViewFinanceDetails = FINANCE_DETAIL_ROLE_SET.has(role ?? "");
    // Salary spending is confidential: only the roles that may export payroll see it in dashboard totals.
    const salaryFilter = isFinancePayrollExportRole(role) ? {} : { OR: [{ category: null }, { category: { not: "SALARY" as const } }] };
    const monthEnds = Array.from({ length: months }, (_, index) =>
      new Date(Date.UTC(firstMonth.getUTCFullYear(), firstMonth.getUTCMonth() + index + 1, 0, 23, 59, 59, 999)),
    );
    const monthStarts = Array.from({ length: months }, (_, index) =>
      new Date(Date.UTC(firstMonth.getUTCFullYear(), firstMonth.getUTCMonth() + index, 1)),
    );

    const [students, teachers, monthlyPayments, monthlyExpenses, recentStudents, recentPayments, recentExpenses] = await Promise.all([
      this.prisma.client.student.findMany({
        where: { schoolId, deletedAt: null, status: "ACTIVE", admissionDate: { lte: now } },
        select: { admissionDate: true, createdAt: true, profile: { select: { firstName: true, lastName: true, gender: true } } },
      }),
      this.prisma.client.teacher.count({ where: { schoolId, isActive: true, deletedAt: null } }),
      canViewFinance ? this.prisma.client.payment.findMany({
        where: { schoolId, status: "COMPLETED", paymentDate: { gte: firstMonth, lte: now } },
        select: { amount: true, paymentDate: true },
      }) : Promise.resolve([]),
      canViewFinance ? this.prisma.client.expense.findMany({
        where: { schoolId, date: { gte: firstMonth, lte: now }, ...salaryFilter },
        select: { amount: true, date: true },
      }) : Promise.resolve([]),
      role !== "teacher" ? this.prisma.client.student.findMany({
        where: { schoolId, deletedAt: null, createdAt: { gte: firstMonth, lte: now } },
        orderBy: { createdAt: "desc" }, take: 8,
        select: { id: true, createdAt: true, admissionDate: true, profile: { select: { firstName: true, lastName: true } } },
      }) : Promise.resolve([]),
      canViewFinanceDetails ? this.prisma.client.payment.findMany({
        where: { schoolId, createdAt: { gte: firstMonth, lte: now }, status: "COMPLETED" },
        orderBy: { createdAt: "desc" }, take: 8,
        select: { id: true, amount: true, createdAt: true, paymentNumber: true, student: { select: { profile: { select: { firstName: true, lastName: true } } } } },
      }) : Promise.resolve([]),
      canViewFinanceDetails ? this.prisma.client.expense.findMany({
        where: { schoolId, createdAt: { gte: firstMonth, lte: now }, ...salaryFilter },
        orderBy: { createdAt: "desc" }, take: 8,
        select: { id: true, amount: true, createdAt: true, description: true, payee: true },
      }) : Promise.resolve([]),
    ]);

    const genderCounts = { MALE: 0, FEMALE: 0, OTHER: 0, UNKNOWN: 0 };
    for (const student of students) {
      const gender = student.profile.gender;
      if (gender === "MALE") genderCounts.MALE += 1;
      else if (gender === "FEMALE") genderCounts.FEMALE += 1;
      else if (gender === "OTHER") genderCounts.OTHER += 1;
      else genderCounts.UNKNOWN += 1;
    }

    const enrollmentGrowth = monthStarts.map((start, index) => {
      const end = monthEnds[index]!;
      const population = students.filter((student) => student.admissionDate <= end).length;
      const newAdmissions = students.filter((student) => student.admissionDate >= start && student.admissionDate <= end).length;
      return {
        month: new Intl.DateTimeFormat("en-GH", { month: "short", year: "2-digit", timeZone: "UTC" }).format(start),
        population,
        newAdmissions,
      };
    });

    const financialStatus = canViewFinance ? monthStarts.map((start, index) => {
      const end = monthEnds[index]!;
      const revenue = sumMoney(monthlyPayments.filter(payment => payment.paymentDate >= start && payment.paymentDate <= end), payment => payment.amount);
      const expenditures = sumMoney(monthlyExpenses.filter(expense => expense.date >= start && expense.date <= end), expense => expense.amount);
      return {
        month: new Intl.DateTimeFormat("en-GH", { month: "short", year: "2-digit", timeZone: "UTC" }).format(start),
        revenue: revenue,
        expenditures: expenditures,
      };
    }) : [];

    const activities = [
      ...recentStudents.map((student) => ({
        id: "student-" + student.id, type: "student" as const, title: "Student record added",
        detail: [student.profile.firstName, student.profile.lastName].filter(Boolean).join(" ") || "Student record",
        amount: null, createdAt: student.createdAt.toISOString(),
      })),
      ...(canViewFinanceDetails ? recentPayments.map((payment) => ({
        id: "payment-" + payment.id, type: "payment" as const, title: "Fee payment recorded",
        detail: [payment.paymentNumber, [payment.student.profile.firstName, payment.student.profile.lastName].filter(Boolean).join(" ")].filter(Boolean).join(" · "),
        amount: Number(payment.amount), createdAt: payment.createdAt.toISOString(),
      })) : []),
      ...(canViewFinanceDetails ? recentExpenses.map((expense) => ({
        id: "expense-" + expense.id, type: "expense" as const, title: "Expenditure recorded",
        detail: expense.description || expense.payee || "School expense",
        amount: Number(expense.amount), createdAt: expense.createdAt.toISOString(),
      })) : []),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 8);

    const hasFinancialRecords = canViewFinance && (monthlyPayments.length > 0 || monthlyExpenses.length > 0);
    const currentMonthPayments = canViewFinance ? sumMoney(monthlyPayments.filter((payment) => payment.paymentDate >= currentMonthStart && payment.paymentDate <= now), payment => payment.amount) : null;
    const currentMonthExpenses = canViewFinance ? sumMoney(monthlyExpenses.filter((expense) => expense.date >= currentMonthStart && expense.date <= now), expense => expense.amount) : null;
    const newThisMonth = students.filter((student) => student.admissionDate >= currentMonthStart && student.admissionDate <= now).length;

    return {
      generatedAt: now.toISOString(),
      periodMonths: months,
      canViewFinance,
      metrics: {
        activeStudents: students.length,
        activeTeachers: teachers,
        newAdmissionsThisMonth: newThisMonth,
        revenueThisMonth: currentMonthPayments === null ? null : Math.round(currentMonthPayments * 100) / 100,
        expendituresThisMonth: currentMonthExpenses === null ? null : Math.round(currentMonthExpenses * 100) / 100,
      },
      genderDistribution: [
        { label: "Male", value: genderCounts.MALE },
        { label: "Female", value: genderCounts.FEMALE },
        { label: "Other", value: genderCounts.OTHER },
        { label: "Not recorded", value: genderCounts.UNKNOWN },
      ],
      enrollmentGrowth,
      financialStatus,
      hasFinancialRecords,
      recentActivities: activities,
    };
  }
}
