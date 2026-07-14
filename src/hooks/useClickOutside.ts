import { useEffect, RefObject } from "react";

export function useClickOutside(ref: RefObject<HTMLElement | null>, onClickOutside: () => void, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClickOutside();
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [ref, onClickOutside, enabled]);
}
