import { cn } from "../../lib/utils";
import type { ChapterStatus } from "../../types";
import { STATUS_LABELS } from "../../types";

export function StatusDot({ status }: { status: ChapterStatus }) {
  return (
    <span
      className={cn(
        "inline-block h-2 w-2 rounded-full",
        status === "draft" && "bg-warm-gray dark:bg-warm-gray-dark",
        status === "editing" && "bg-amber-500",
        status === "review" && "bg-blue-500",
        status === "done" && "bg-emerald-500",
      )}
      title={STATUS_LABELS[status]}
    />
  );
}
