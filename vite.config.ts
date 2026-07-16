import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],

  // Pre-bundle every heavy dependency at startup so that Vite never triggers a
  // mid-session re-optimization. Re-optimization is what previously crashed
  // the dev server: it would stage a fresh `deps_temp_*` directory and then
  // `rm` the previous `deps/`, and the sandbox's bulk-delete guard (>50
  // files) would reject the `rm` and kill the process. By forcing all of
  // these to be included up front, the optimization happens exactly once at
  // startup and no new discovery is triggered by subsequent imports.
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "@tauri-apps/api/core",
      "@tauri-apps/api/window",
      "@tauri-apps/api/path",
      "@tauri-apps/plugin-dialog",
      "zustand",
      "@tiptap/react",
      "@tiptap/starter-kit",
      "@tiptap/extension-placeholder",
      "@tiptap/extension-typography",
      "lucide-react",
      "clsx",
      "tailwind-merge",
    ],
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
