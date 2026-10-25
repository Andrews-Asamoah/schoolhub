import { Link } from "@tanstack/react-router";
import { SubscriptionBadge } from "./subscription-badge";

interface SchoolRowProps {
  school: {
    id: string;
    name: string;
    code: string;
    subdomain: string;
    createdAt: string | Date;
    organization: {
      subscriptionStatus: string;
    };
    _count: { students: number; teachers: number };
  };
}

export function SchoolRow({ school }: SchoolRowProps) {
  return (
    <tr className="border-b border-slate-100 transition hover:bg-slate-50/60">
      <td className="py-3 pl-4 pr-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">{school.name}</p>
          <p className="text-xs text-slate-400">{school.subdomain}</p>
        </div>
      </td>
      <td className="px-3 py-3">
        <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono text-slate-700">
          {school.code}
        </code>
      </td>
      <td className="px-3 py-3">
        <span className="inline-flex items-center gap-1 text-sm text-slate-600">
          <span className="font-medium text-slate-800">{school._count.students}</span>
          <span className="text-slate-400">students</span>
        </span>
      </td>
      <td className="px-3 py-3">
        <span className="inline-flex items-center gap-1 text-sm text-slate-600">
          <span className="font-medium text-slate-800">{school._count.teachers}</span>
          <span className="text-slate-400">teachers</span>
        </span>
      </td>
      <td className="px-3 py-3">
        <SubscriptionBadge status={school.organization.subscriptionStatus} />
      </td>
      <td className="px-3 py-3 text-sm text-slate-500">
        {new Date(school.createdAt).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })}
      </td>
      <td className="py-3 pl-3 pr-4 text-right">
        <Link
          to="/admin/schools/$schoolId"
          params={{ schoolId: school.id }}
          className="superadmin-button-secondary rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-800 transition hover:bg-indigo-100"
        >
          View →
        </Link>
      </td>
    </tr>
  );
}
