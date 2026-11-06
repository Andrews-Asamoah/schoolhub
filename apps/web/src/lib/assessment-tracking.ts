/** Shapes returned by /assessments/tracking and /assessments/corrections. */
export type TrackingStatus = "NO_PUPILS" | "NOT_STARTED" | "IN_PROGRESS" | "COMPLETE" | "SUBMITTED" | "OVERDUE";
export type CorrectionStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

export interface TrackingSheet {
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  teachers: { id: string; name: string }[];
  teacherIds: string[];
  total: number;
  complete: number;
  excused: number;
  partial: number;
  missing: number;
  done: number;
  percent: number;
  deadline: string | null;
  status: TrackingStatus;
  submittedAt: string | null;
  hasPendingCorrection: boolean;
}

export interface TeacherRollup {
  teacherId: string | null;
  name: string;
  sheets: number;
  submitted: number;
  overdue: number;
  pupils: number;
  done: number;
  percent: number;
}

export interface TrackingOverview {
  term: { id: string; name: string };
  templates: { id: string; name: string }[];
  template: { id: string; name: string; deadline: string | null; isLocked: boolean } | null;
  summary: { percent: number; sheets: number; submitted: number; complete: number; overdue: number; notStarted: number; inProgress: number; unassigned: number } | null;
  sheets: TrackingSheet[];
  teachers: TeacherRollup[];
  pendingCorrections: number;
}

export interface CorrectionRow {
  id: string;
  status: CorrectionStatus;
  reason: string;
  requestedAt: string;
  requester: { id: string; name: string };
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewReason: string | null;
  templateName: string;
  classId: string;
  className: string;
  subjectName: string;
  items: {
    studentName: string;
    admissionNumber: string | null;
    componentName: string;
    occurrenceIndex: number;
    maxMarks: number | null;
    previousMarks: number | null;
    requestedMarks: number | null;
  }[];
}

export const STATUS_LABEL: Record<TrackingStatus, string> = {
  NO_PUPILS: "No pupils",
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  COMPLETE: "Ready to submit",
  SUBMITTED: "Submitted",
  OVERDUE: "Overdue",
};

export const STATUS_VARIANT: Record<TrackingStatus, "secondary" | "info" | "warning" | "success" | "destructive"> = {
  NO_PUPILS: "secondary",
  NOT_STARTED: "secondary",
  IN_PROGRESS: "info",
  COMPLETE: "warning",
  SUBMITTED: "success",
  OVERDUE: "destructive",
};

export const formatDate = (value: string | null) =>
  value ? new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "No deadline";

export const formatMark = (value: number | null) => (value === null ? "—" : String(value));
