import { useEffect, useState } from "react";
import { Feather, X } from "lucide-react";
import { useAppStore } from "../store";

/** 「关于墨池」对话框:版本 + 一句话简介。 */
export function AboutDialog() {
  const open = useAppStore((s) => s.aboutOpen);
  const setAboutOpen = useAppStore((s) => s.setAboutOpen);
  const [version, setVersion] = useState("");

  useEffect(() => {
    if (!open) return;
    import("../../package.json")
      .then((pkg) => setVersion(pkg.version))
      .catch(() => setVersion(""));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setAboutOpen(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, setAboutOpen]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4 animate-[inkwell-fade-in_0.15s_ease-out]"
      onClick={() => setAboutOpen(false)}
    >
      <div
        className="w-full max-w-xs rounded-xl border border-warm-gray bg-paper p-6 text-center shadow-2xl dark:border-warm-gray-dark dark:bg-paper-dark animate-[inkwell-pop-in_0.15s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-white shadow-sm">
          <Feather size={24} />
        </div>
        <h2 className="text-base font-semibold text-ink dark:text-ink-dark">墨池</h2>
        {version && <p className="mt-0.5 text-xs text-ink-muted dark:text-ink-muted-dark">版本 {version}</p>}
        <p className="mt-3 text-xs leading-relaxed text-ink-muted dark:text-ink-muted-dark">
          为中文长篇小说写作而生的桌面编辑器。
          <br />
          数据保存在本地,离线可用。
        </p>
        <button
          onClick={() => setAboutOpen(false)}
          className="mt-4 inline-flex items-center gap-1 rounded-lg bg-accent px-4 py-1.5 text-sm text-white transition-colors hover:bg-accent-light"
        >
          <X size={14} />
          关闭
        </button>
      </div>
    </div>
  );
}
