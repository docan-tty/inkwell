import { useCallback, useEffect, useRef, useState } from "react";

// Auto-hiding top bars for focus / fullscreen mode: hidden by default,
// revealed when the mouse touches the top ~6px hot zone (or hovers the bars
// themselves), hidden again 400ms after the mouse leaves.
export function useAutoHideTopBars(active: boolean) {
  const [showTopBars, setShowTopBars] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const enterTopBars = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    setShowTopBars(true);
  }, []);

  const leaveTopBars = useCallback(() => {
    hideTimer.current = setTimeout(() => {
      setShowTopBars(false);
    }, 400);
  }, []);

  useEffect(() => {
    if (!active) setShowTopBars(false);
  }, [active]);

  // Top-edge hot zone: while the bars are hidden, the hidden bar itself
  // can't be hovered (pointer-events-none), so we watch the cursor.
  useEffect(() => {
    if (!active) return;
    const onMove = (e: MouseEvent) => {
      if (e.clientY <= 6) enterTopBars();
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [active, enterTopBars]);

  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    },
    [],
  );

  return { showTopBars, enterTopBars, leaveTopBars };
}
