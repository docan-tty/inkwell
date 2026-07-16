import { cn } from "../../lib/utils";

interface DropTargetProps {
  active: boolean;
  onDrop: () => void;
  onDragOver: (active: boolean) => void;
  /** When set, this target only reacts to drags carrying this data type
   *  (e.g. "inkwell/volume-id"), so chapter drags don't light up volume
   *  indicators and vice versa. */
  accepts?: string;
}

// Drop indicator between tree rows. The visual line is 2px, but the hit
// area is padded to ~10px via negative margins so the pointer doesn't have
// to land on a hairline — the gap between rows stays visually unchanged.
export function DropTarget({ active, onDrop, onDragOver, accepts }: DropTargetProps) {
  const matches = (e: React.DragEvent) =>
    !accepts || e.dataTransfer.types.includes(accepts);

  return (
    <div
      onDragEnter={(e) => {
        if (!matches(e)) return;
        e.preventDefault();
        e.stopPropagation();
        onDragOver(true);
      }}
      onDragLeave={(e) => {
        if (!matches(e)) return;
        e.preventDefault();
        e.stopPropagation();
        onDragOver(false);
      }}
      onDragOver={(e) => {
        if (!matches(e)) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer) {
          e.dataTransfer.dropEffect = "move";
        }
      }}
      onDrop={(e) => {
        if (!matches(e)) return;
        e.preventDefault();
        e.stopPropagation();
        onDragOver(false);
        onDrop();
      }}
      className="-my-1 py-1"
    >
      <div
        className={cn(
          "h-0.5 rounded-full transition-all duration-150",
          active ? "bg-accent" : "bg-transparent",
        )}
      />
    </div>
  );
}
