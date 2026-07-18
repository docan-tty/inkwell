import { beforeEach, describe, expect, it } from "vitest";
import { createSnapshot, listSnapshots, readSnapshot, removeSnapshots } from "./snapshots";

// Browser-mode snapshots back onto namespaced localStorage keys, so the
// pruning policy is fully testable without Tauri.
describe("snapshots", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("creates, lists (newest first) and reads snapshots", async () => {
    await createSnapshot("ch1", "<p>v1</p>", {});
    // Distinct timestamps — same-ms snapshots share a file name.
    await new Promise((r) => setTimeout(r, 2));
    await createSnapshot("ch1", "<p>v2</p>", {});
    const all = await listSnapshots("ch1", {});
    expect(all).toHaveLength(2);
    expect(all[0].timestamp).toBeGreaterThanOrEqual(all[1].timestamp);
    expect(await readSnapshot("ch1", all[0].timestamp, {})).toBe("<p>v2</p>");
  });

  it("ignores non-snapshot files when listing", async () => {
    await createSnapshot("ch1", "<p>v1</p>", {});
    const all = await listSnapshots("ch1", {});
    expect(all.every((s) => /^\d+\.html$/.test(s.fileName))).toBe(true);
  });

  it("prunes beyond the 20-snapshot cap, keeping the newest", async () => {
    for (let i = 0; i < 23; i++) {
      await createSnapshot("ch1", `<p>v${i}</p>`, {});
      // Ensure distinct timestamps even within the same millisecond.
      await new Promise((r) => setTimeout(r, 2));
    }
    const all = await listSnapshots("ch1", {});
    expect(all.length).toBeLessThanOrEqual(20);
    // The newest snapshot always survives pruning.
    expect(await readSnapshot("ch1", all[0].timestamp, {})).toBe("<p>v22</p>");
  }, 15000);

  it("removeSnapshots deletes every snapshot of the chapter", async () => {
    await createSnapshot("ch1", "<p>v1</p>", {});
    await createSnapshot("ch1", "<p>v2</p>", {});
    await removeSnapshots("ch1", {});
    expect(await listSnapshots("ch1", {})).toHaveLength(0);
  });

  it("removeSnapshots is a no-op when nothing exists", async () => {
    await expect(removeSnapshots("nope", {})).resolves.toBeUndefined();
  });
});
