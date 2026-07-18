import { useEffect, useRef, useState } from "react";
import { cn } from "../../lib/utils";

interface EditableLabelProps {
  value: string;
  onSave: (value: string) => void;
  className?: string;
  editing?: boolean;
  onEditingChange?: (editing: boolean) => void;
}

export function EditableLabel({
  value,
  onSave,
  className,
  editing: controlledEditing,
  onEditingChange,
}: EditableLabelProps) {
  const [internalEditing, setInternalEditing] = useState(false);
  const [text, setText] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const editing = controlledEditing ?? internalEditing;
  const setEditing = (next: boolean) => {
    setInternalEditing(next);
    onEditingChange?.(next);
  };

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  useEffect(() => {
    if (!editing) setText(value);
  }, [value, editing]);

  const committedOnce = useRef(false);

  const commit = () => {
    // Enter triggers commit and the subsequent blur would commit again —
    // guard the double-fire, and skip the save entirely when nothing changed
    // (every save is a full project.json write).
    if (committedOnce.current) return;
    committedOnce.current = true;
    const next = text.trim();
    if (next && next !== value) onSave(next);
    setEditing(false);
  };

  useEffect(() => {
    if (editing) committedOnce.current = false;
  }, [editing]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setText(value);
            setEditing(false);
          }
        }}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "w-full max-w-full box-border rounded border border-accent bg-paper px-1 py-0.5 text-sm outline-none dark:bg-paper-dark",
          className,
        )}
      />
    );
  }

  return (
    <span
      onDoubleClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
      className={cn("cursor-text truncate", className)}
      title="双击重命名"
    >
      {value}
    </span>
  );
}
