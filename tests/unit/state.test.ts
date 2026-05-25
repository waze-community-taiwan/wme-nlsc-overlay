// @vitest-environment jsdom
//
// Verifies state.ts load/save behavior, with extra coverage on the legacy
// `above: Record<string, boolean>` → `aboveCode: string | null` migration.

import { beforeEach, describe, expect, it } from "vitest";
import { loadState } from "../../src/state";

const KEY = "wme-nlsc-overlay:state";

describe("loadState aboveCode migration", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns aboveCode = null on a fresh state with no prior data", () => {
    expect(loadState().aboveCode).toBeNull();
  });

  it("passes through a string aboveCode written by a current-version state", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ aboveCode: "EMAP5", layerOrder: ["EMAP5"] }),
    );
    expect(loadState().aboveCode).toBe("EMAP5");
  });

  it("passes through a null aboveCode", () => {
    localStorage.setItem(KEY, JSON.stringify({ aboveCode: null }));
    expect(loadState().aboveCode).toBeNull();
  });

  it("migrates legacy single-true `above` map into aboveCode", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ above: { EMAP5: true, TOWN: false } }),
    );
    expect(loadState().aboveCode).toBe("EMAP5");
  });

  it("migrates legacy multi-true `above` map by picking the topmost in layerOrder", () => {
    // Sidebar layerOrder is top-first, so "B" sits visually highest.
    localStorage.setItem(
      KEY,
      JSON.stringify({
        above: { A: true, B: true, C: true },
        layerOrder: ["B", "A", "C"],
      }),
    );
    expect(loadState().aboveCode).toBe("B");
  });

  it("returns null when legacy `above` map has no true entries", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ above: { A: false, B: false } }),
    );
    expect(loadState().aboveCode).toBeNull();
  });

  it("drops non-boolean entries in legacy `above` map", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ above: { A: "yes", B: 1, C: true } }),
    );
    expect(loadState().aboveCode).toBe("C");
  });
});
