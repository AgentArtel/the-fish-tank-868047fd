import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS, type ContentStatus } from "@/lib/workflow";

const colors: Record<ContentStatus, string> = {
  idea: "bg-slate-100 text-slate-700",
  needs_media: "bg-amber-100 text-amber-800",
  drafting: "bg-blue-100 text-blue-800",
  needs_review: "bg-purple-100 text-purple-800",
  approved: "bg-emerald-100 text-emerald-800",
  scheduled: "bg-cyan-100 text-cyan-800",
  posted: "bg-green-200 text-green-900",
  archived: "bg-slate-200 text-slate-600",
};

export function StatusBadge({ status }: { status: ContentStatus }) {
  return <Badge variant="secondary" className={`${colors[status]} border-0 font-medium`}>{STATUS_LABELS[status]}</Badge>;
}
