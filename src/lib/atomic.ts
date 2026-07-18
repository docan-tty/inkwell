// Atomic file write (temp file + same-volume rename) with a localStorage
// fallback for browser/dev mode. Split out of storage.ts so vitest can mock
// this single seam (module-level mocking of storage.ts from inside itself
// is not possible).

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

let bridge: FsBridge = {
  async writeText(path, content) {
    localStorage.setItem(`inkwell-fs:${path}`, content);
  },
  async readText(path) {
    const value = localStorage.getItem(`inkwell-fs:${path}`);
    if (value === null) throw new Error(`File not found: ${path}`);
    return value;
  },
};

// Test seam: storage tests install a mock bridge (see storage.test.ts).
export function setFsBridge(next: FsBridge | null) {
  bridge = next ?? {
    async writeText(path, content) {
      localStorage.setItem(`inkwell-fs:${path}`, content);
    },
    async readText(path) {
      const value = localStorage.getItem(`inkwell-fs:${path}`);
      if (value === null) throw new Error(`File not found: ${path}`);
      return value;
    },
  };
}

export async function atomicWriteTextFile(path: string, content: string): Promise<void> {
  await bridge.writeText(path, content);
}

export async function bridgeReadTextFile(path: string): Promise<string> {
  return bridge.readText(path);
}
