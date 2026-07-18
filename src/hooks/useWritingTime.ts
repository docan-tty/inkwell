import { useCallback, useEffect, useRef, useState } from "react";
import { addWritingSeconds, getTodayWritingSeconds } from "../lib/stats";

// Writing-time tracker: while the user keeps typing, accumulate active
// seconds once a minute (idle stretches longer than 30s don't count).
// The counter ticks the StatusBar display even between bursts.
export function useWritingTime(projectId: string | undefined) {
  const [writingSeconds, setWritingSeconds] = useState(0);
  const lastTypeAt = useRef(0);

  useEffect(() => {
    if (!projectId) return;
    setWritingSeconds(getTodayWritingSeconds(projectId));
    const timer = setInterval(() => {
      const typingRecently = Date.now() - lastTypeAt.current < 30_000;
      if (typingRecently) {
        setWritingSeconds(addWritingSeconds(projectId, 60));
      } else {
        setWritingSeconds(getTodayWritingSeconds(projectId));
      }
    }, 60_000);
    return () => clearInterval(timer);
  }, [projectId]);

  const noteTyping = useCallback(() => {
    lastTypeAt.current = Date.now();
  }, []);

  return { writingSeconds, noteTyping };
}
