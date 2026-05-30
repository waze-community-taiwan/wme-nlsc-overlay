// @vitest-environment jsdom
//
// Integration test that simulates the real index.ts addUserLayer flow,
// stubbing only OL and the WME SDK. The goal: identify whether the
// "click 新增 doesn't add a row" symptom comes from a JS bug or from
// an SDK exception.

import { describe, expect, it, vi } from "vitest";
import { renderSidebar } from "../../src/sidebar";
import { NlscController, type LayerBinding } from "../../src/controller";
import type { NlscLayer } from "../../src/layers";
import type { NlscState } from "../../src/state";

const makeLayer = (code: string, suffix = ""): NlscLayer => ({
  code,
  title: `title-${code}${suffix}`,
  format: "jpeg",
  name: `${code} · jpeg · title-${code}${suffix}`,
  minZoom: 0,
  maxZoom: 22,
  attribution: "© NLSC",
  defaultOpacity: 0.5,
});

function setupRealAddFlow(opts: {
  defaultLayers: NlscLayer[];
  catalog: NlscLayer[];
  sdkAddCheckboxImpl?: (args: { name: string; isChecked?: boolean }) => void;
}) {
  const tabLabel = document.createElement("div");
  const tabPane = document.createElement("div");
  document.body.appendChild(tabPane);

  // Stub OL.Layer.XYZ + olMap (createTileLayer just needs these calls).
  const olAddLayer = vi.fn();
  const olRemoveLayer = vi.fn();
  const tileLayerFactory = (name: string) => ({
    name,
    setVisibility: vi.fn(),
    setOpacity: vi.fn(),
  });

  // SDK stub — addLayerCheckbox uses the configurable impl.
  const checkboxes = new Set<string>();
  const sdkAddCheckbox =
    opts.sdkAddCheckboxImpl ??
    (({ name }: { name: string }) => {
      if (checkboxes.has(name)) {
        const err = new Error(
          `InvalidStateError: checkbox "${name}" already exists`,
        );
        (err as any).name = "InvalidStateError";
        throw err;
      }
      checkboxes.add(name);
    });

  const state: NlscState = { visible: {}, opacity: {}, color: {}, aboveCode: null, userLayers: [], removedDefaults: [], layerOrder: [], floatBox: { enabled: true, opacity: 0.9, x: null, y: null } };

  // Build controller seeded with default-layer bindings.
  const defaultBindings: LayerBinding[] = opts.defaultLayers.map((layer) => ({
    layer,
    setLayerVisible: vi.fn(),
    setLayerOpacity: vi.fn(),
    setLayerColor: vi.fn(),
  }));
  const controller = new NlscController(state, defaultBindings);

  // Replicate index.ts: register a checkbox per default layer.
  for (const layer of opts.defaultLayers) {
    sdkAddCheckbox({ name: layer.name, isChecked: false });
  }

  const userTileLayers = new Map<string, ReturnType<typeof tileLayerFactory>>();

  // Mirrors the post-fix `safeAddCheckbox` helper in src/index.ts.
  const safeAddCheckbox = (name: string, isChecked: boolean): void => {
    try {
      sdkAddCheckbox({ name, isChecked });
    } catch (err) {
      console.warn(`addLayerCheckbox(${name}) failed`, err);
    }
  };

  const registerCatalogLayer = (
    layer: NlscLayer,
    visible: boolean,
    opacity: number,
  ): void => {
    const tileLayer = tileLayerFactory(layer.name);
    olAddLayer(tileLayer);
    userTileLayers.set(layer.code, tileLayer);
    controller.addBinding({
      layer,
      setLayerVisible: tileLayer.setVisibility,
      setLayerOpacity: tileLayer.setOpacity,
      setLayerColor: vi.fn(),
    });
    safeAddCheckbox(layer.name, visible);
  };

  const addUserLayer = (code: string): NlscLayer | null => {
    if (userTileLayers.has(code)) return null;
    const layer = opts.catalog.find((l) => l.code === code);
    if (!layer) return null;
    const visible = state.visible[code] ?? true;
    const opacity = state.opacity[code] ?? layer.defaultOpacity;
    registerCatalogLayer(layer, visible, opacity); // <-- may throw
    if (!state.userLayers.includes(code)) state.userLayers.push(code);
    state.visible[code] = visible;
    state.opacity[code] = opacity;
    return layer;
  };

  const removeUserLayer = vi.fn();

  renderSidebar(tabLabel, tabPane, opts.defaultLayers, controller, state, {
    catalog: opts.catalog,
    addUserLayer,
    removeUserLayer,
  });

  return {
    tabPane,
    state,
    userTileLayers,
    olAddLayer,
    olRemoveLayer,
    checkboxes,
    clickAdd: (code: string) => {
      const select = tabPane.querySelector("select") as HTMLSelectElement;
      const addBtn = tabPane.querySelector("button") as HTMLButtonElement;
      select.value = code;
      addBtn.click();
    },
    rowTitles: () =>
      Array.from(tabPane.querySelectorAll("span"))
        .map((s) => s.textContent ?? "")
        .filter(Boolean),
  };
}

describe("addUserLayer flow", () => {
  it("happy path: clicking 新增 adds row + checkbox + tile when no collision", () => {
    const def = makeLayer("EMAP5");
    const cat = makeLayer("LANDSECT");
    const env = setupRealAddFlow({
      defaultLayers: [def],
      catalog: [cat],
    });

    env.clickAdd(cat.code);

    expect(env.userTileLayers.has(cat.code)).toBe(true);
    expect(env.checkboxes.has(cat.name)).toBe(true);
    expect(env.state.userLayers).toEqual([cat.code]);
    expect(env.rowTitles()).toContain(cat.title);
  });

  it("post-fix: row still appears in panel even when addLayerCheckbox throws", () => {
    const def = makeLayer("EMAP5");
    const cat = makeLayer("LANDSECT");

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Simulate an SDK that rejects the catalog name (the original symptom).
    const env = setupRealAddFlow({
      defaultLayers: [def],
      catalog: [cat],
      sdkAddCheckboxImpl: ({ name }) => {
        if (name === cat.name) {
          const err = new Error("InvalidStateError: simulated");
          (err as any).name = "InvalidStateError";
          throw err;
        }
      },
    });

    expect(() => env.clickAdd(cat.code)).not.toThrow();

    // Row appears in the sidebar even though the SDK rejected the checkbox.
    expect(env.rowTitles()).toContain(cat.title);
    expect(env.state.userLayers).toEqual([cat.code]);
    expect(env.userTileLayers.has(cat.code)).toBe(true);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
