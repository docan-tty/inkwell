import { useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "../lib/utils";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  /** Label of the confirm button. Defaults to "删除". */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Danger styling (red confirm button) — used for destructive actions. */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Application-styled confirmation modal. Used for destructive actions
 * (delete project / volume / chapter) that previously fired on a single
 * click with no way back.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "删除",
  cancelLabel = "取消",
  danger = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4 animate-[inkwell-fade-in_0.15s_ease-out]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-sm rounded-xl border border-warm-gray bg-paper p-5 shadow-2xl dark:border-warm-gray-dark dark:bg-paper-dark animate-[inkwell-pop-in_0.15s_ease-out]">
        <div className="flex items-start gap-3">
          {danger && (
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-red-600 dark:text-red-400">
              <AlertTriangle size={18} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-ink dark:text-ink-dark">{title}</h3>
            <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-ink-muted dark:text-ink-muted-dark">
              {message}
            </p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="rounded-lg border border-warm-gray px-3.5 py-1.5 text-sm text-ink transition-colors hover:bg-warm-gray dark:border-warm-gray-dark dark:text-ink-dark dark:hover:bg-warm-gray-dark"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={cn(
              "rounded-lg px-3.5 py-1.5 text-sm font-medium text-white transition-colors",
              danger ? "bg-red-600 hover:bg-red-500" : "bg-accent hover:bg-accent-light",
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
