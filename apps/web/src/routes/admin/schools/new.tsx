import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { EnrollSchoolForm } from "@/components/superadmin/enroll-school-form";

export const Route = createFileRoute("/admin/schools/new")({
  component: EnrollSchoolPage,
});

function EnrollSchoolPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div>
        <Link
          to="/admin/schools"
          className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="size-3.5" />
          Back to Schools
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Enroll New School
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Create an organization, school record, and admin account in one step.
        </p>
      </div>

      <EnrollSchoolForm />
    </div>
  );
}
