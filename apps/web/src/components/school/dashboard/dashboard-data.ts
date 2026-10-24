export interface DashboardActivity {
  id: string;
  type: "student" | "payment" | "expense";
  title: string;
  detail: string;
  amount: number | null;
  createdAt: string;
}

export interface DashboardAnalytics {
  generatedAt: string;
  periodMonths: number;
  canViewFinance: boolean;
  metrics: {
    activeStudents: number;
    activeTeachers: number;
    newAdmissionsThisMonth: number;
    revenueThisMonth: number | null;
    expendituresThisMonth: number | null;
  };
  genderDistribution: { label: string; value: number }[];
  enrollmentGrowth: { month: string; population: number; newAdmissions: number }[];
  financialStatus: { month: string; revenue: number; expenditures: number }[];
  recentActivities: DashboardActivity[];
}
