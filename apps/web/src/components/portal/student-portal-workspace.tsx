import { StudentAttendanceView } from "./student-attendance-view";
import { StudentSubjectsView } from "./student-subjects-view";
import { StudentTimetableView } from "./student-timetable-view";
import { StudentReportView } from "./student-report-view";
import { StudentClassmatesView } from "./student-classmates-view";
import { StudentAssignmentsView } from "./student-assignments-view";
import { StudentAnnouncementsView } from "./student-announcements-view";
import { StudentOverview } from "./student-overview";

export type StudentPortalPage =
  | "dashboard"
  | "subjects"
  | "timetable"
  | "grades"
  | "assessments"
  | "assignments"
  | "classmates"
  | "attendance"
  | "announcements";

export interface StudentPortalWorkspaceProps {
  page?: StudentPortalPage;
}

/**
 * Renders the content for one student portal route. Navigation lives in the
 * school sidebar; this component deliberately does not duplicate it with tabs.
 */
export function StudentPortalWorkspace({ page = "dashboard" }: StudentPortalWorkspaceProps) {
  switch (page) {
    case "subjects":
      return <StudentSubjectsView />;
    case "timetable":
      return <StudentTimetableView />;
    case "grades":
    case "assessments":
      return <StudentReportView />;
    case "assignments":
      return <StudentAssignmentsView />;
    case "classmates":
      return <StudentClassmatesView />;
    case "attendance":
      return <StudentAttendanceView />;
    case "announcements":
      return <StudentAnnouncementsView />;
    case "dashboard":
    default:
      return <StudentOverview />;
  }
}
