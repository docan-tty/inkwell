// Atomic file write (temp file + same-volume rename) with a localStorage
// fallback for browser/dev mode. Split out of storage.ts so vitest can mock
// this single seam (module-level mocking of storage.ts from inside itself
// is not possible).
//
// The default bridge talks to the Rust `read_text_file` / `write_text_file`
// commands when the app runs inside Tauri, and falls back to a namespaced
// localStorage entry only in plain browser/dev mode (no __TAURI_INTERNALS__).
// Tests replace the bridge wholesale via setFsBridge.

import { invoke } from "@tauri-apps/api/core";

export interface FsBridge {
  writeText(path: string, content: string): Promise<void>;
  readText(path: string): Promise<string>;
}

export function isNotFoundError(err: unknown): boolean {
  // The Tauri read command formats errors as "读取失败 (path): <io error>".
  // A missing file is the only case where falling back to the localStorage
  // mirror is safe — anything else (disk unplugged, permission) must
  // surface rather than silently serving a stale mirror.
  return (
    /not found|os error 2|cannot find|系统找不到|no such file/i.test(String(err)) ||
    (err instanceof Error && /^File not found:/.test(err.message))
  );
}

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

// LocalStorage-backed bridge used only outside Tauri (browser dev / SSR).
const localStorageBridge: FsBridge = {
  async writeText(path, content) {
    localStorage.setItem(`inkwell-fs:${path}`, content);
  },
  async readText(path) {
    const value = localStorage.getItem(`inkwell-fs:${path}`);
    if (value === null) throw new Error(`File not found: ${path}`);
    return value;
  },
};

// Tauri bridge: routes through the path-whitelisted Rust commands.
const tauriBridge: FsBridge = {
  async writeText(path, content) {
    await invoke("write_text_file", { path, content });
  },
  async readText(path) {
    return await invoke<string>("read_text_file", { path });
  },
};

function defaultBridge(): FsBridge {
  return isTauri() ? tauriBridge : localStorageBridge;
}

// When set (tests), overrides the auto-detected bridge entirely.
let override: FsBridge | null = null;

// Test seam: storage tests install a mock bridge (see storage.test.ts).
// Passing null restores auto-detection.
export function setFsBridge(next: FsBridge | null) {
  override = next;
}

export async function atomicWriteTextFile(path: string, content: string): Promise<void> {
  await (override ?? defaultBridge()).writeText(path, content);
}

export async function bridgeReadTextFile(path: string): Promise<string> {
  return (override ?? defaultBridge()).readText(path);
}
