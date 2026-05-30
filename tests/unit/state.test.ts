// @vitest-environment jsdom
//
// Verifies state.ts load/save behavior, with extra coverage on the legacy
// `above: Record<string, boolean>` → `aboveCode: string | null` migration.

import { beforeEach, describe, expect, it } from "vitest";
import { loadState, saveState } from "../../src/state";

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

describe("loadState floatBox defaults", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns the default floatBox on a fresh state with no prior data", () => {
    // Req 5.2 (enabled defaults true), Req 7.6 (defaults when no persisted settings).
    expect(loadState().floatBox).toEqual({
      enabled: true,
      opacity: 0.9,
      x: null,
      y: null,
    });
  });

  it("fills floatBox defaults for a legacy state that has no floatBox key", () => {
    // Backward compatibility: older persisted states predate floatBox.
    localStorage.setItem(KEY, JSON.stringify({ aboveCode: "EMAP5" }));
    expect(loadState().floatBox).toEqual({
      enabled: true,
      opacity: 0.9,
      x: null,
      y: null,
    });
  });
});

describe("loadState floatBox validation", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  function persistFloatBox(floatBox: unknown): void {
    localStorage.setItem(KEY, JSON.stringify({ floatBox }));
  }

  it("clamps an out-of-range high opacity into [0.1, 1.0]", () => {
    // Req 7.6: invalid/out-of-range persisted opacity normalizes in-range.
    persistFloatBox({ enabled: true, opacity: 5, x: null, y: null });
    const { opacity } = loadState().floatBox;
    expect(opacity).toBeGreaterThanOrEqual(0.1);
    expect(opacity).toBeLessThanOrEqual(1.0);
    expect(opacity).toBe(1.0);
  });

  it("clamps an out-of-range low opacity into [0.1, 1.0]", () => {
    persistFloatBox({ enabled: true, opacity: 0.01, x: null, y: null });
    const { opacity } = loadState().floatBox;
    expect(opacity).toBeGreaterThanOrEqual(0.1);
    expect(opacity).toBeLessThanOrEqual(1.0);
    expect(opacity).toBe(0.1);
  });

  it("falls back to the default opacity for a non-numeric opacity", () => {
    // Persisted JSON could hold a string from a corrupt/older write.
    persistFloatBox({ enabled: true, opacity: "x", x: null, y: null });
    const { opacity } = loadState().floatBox;
    expect(opacity).toBe(0.9);
    expect(opacity).toBeGreaterThanOrEqual(0.1);
    expect(opacity).toBeLessThanOrEqual(1.0);
  });

  it("falls back to the default opacity for a NaN opacity", () => {
    // JSON.stringify(NaN) === "null", so persist the raw object literal.
    persistFloatBox({ enabled: true, opacity: NaN, x: null, y: null });
    expect(loadState().floatBox.opacity).toBe(0.9);
  });

  it("falls back to enabled = true for a non-boolean enabled", () => {
    persistFloatBox({ enabled: "yes", opacity: 0.5, x: null, y: null });
    expect(loadState().floatBox.enabled).toBe(true);
  });

  it("preserves an explicit enabled = false", () => {
    persistFloatBox({ enabled: false, opacity: 0.5, x: null, y: null });
    expect(loadState().floatBox.enabled).toBe(false);
  });

  it("coerces non-finite x/y to null", () => {
    persistFloatBox({ enabled: true, opacity: 0.5, x: "a", y: NaN });
    const { x, y } = loadState().floatBox;
    expect(x).toBeNull();
    expect(y).toBeNull();
  });

  it("preserves finite x/y coordinates", () => {
    persistFloatBox({ enabled: true, opacity: 0.5, x: 120, y: 240 });
    const { x, y } = loadState().floatBox;
    expect(x).toBe(120);
    expect(y).toBe(240);
  });
});

describe("saveState/loadState floatBox round-trip", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("preserves a valid floatBox across a save then load", () => {
    // Req 7.1–7.4 persistence: a valid floatBox survives the round-trip.
    const state = loadState();
    state.floatBox = { enabled: false, opacity: 0.45, x: 200, y: 50 };
    saveState(state);
    expect(loadState().floatBox).toEqual({
      enabled: false,
      opacity: 0.45,
      x: 200,
      y: 50,
    });
  });

  it("preserves a valid floatBox with null position across the round-trip", () => {
    const state = loadState();
    state.floatBox = { enabled: true, opacity: 0.9, x: null, y: null };
    saveState(state);
    expect(loadState().floatBox).toEqual({
      enabled: true,
      opacity: 0.9,
      x: null,
      y: null,
    });
  });
});
